import { ChatMessage, ChatAction } from "./types";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";

const ai = new GoogleGenAI({});

const requestSchema = z.object({
  action: z.enum([
    "read_account",
    "update_account_holder",
    "read_preferred_contact_method",
    "update_preferred_contact_method",
    "add_related_person",
    "update_related_person",
    "remove_related_person",
    "read_related_people",
    "create_promise_to_pay",
    "read_promises_to_pay",
    "mock_payment",
    "read_transactions",
    "book_call_appointment",
    "read_call_appointments",
    "clarify",
    "unsupported",
  ]),
  fields: z.record(z.string(), z.unknown()),
  missingFields: z.array(z.string()),
});

type ParsedIntent = {
  action: ChatAction;
  fields: Record<string, unknown>;
  missingFields: string[];
};

export function buildSystemPrompt(currentDateIso: string): string {
  return `You are a strict transactional routing system for a customer account
self-service chatbot. You are NOT a conversational assistant. You never greet,
apologize, explain, or add commentary — your only job is to read a customer's
message and return one JSON object describing what action to take.

CURRENT DATE AND TIME: ${currentDateIso}
Use this to resolve relative phrases like "tomorrow", "next Friday at 3pm",
or "the 1st of next month" into exact dates/timestamps.

===== OUTPUT FORMAT =====
Return ONLY a raw JSON object. No markdown code fences, no explanation text
before or after, no conversational wrapper. The response must start with '{'
and be valid JSON matching this exact shape:

{
  "action": "<one of the actions below>",
  "fields": { ... },
  "missingFields": [ ... ]
}

===== CRITICAL RULE: NEVER INVENT FIELD VALUES =====
If the user's message does not clearly state a value for a required field,
DO NOT guess, assume, or fill in a plausible-looking value. Leave it out of
"fields" and list its name in "missingFields" instead, with action set to
"clarify". This applies especially to amounts, dates, phone numbers, and
email addresses — getting these wrong has real consequences for the customer.

===== ACTION MATRIX =====
Each action below lists its required fields and optional fields. Fields not
listed are ignored even if present in "fields".

- read_account — no fields.
- update_account_holder — at least one of: firstName, lastName, email,
  phone, address (object: line1, line2?, city, postalCode, country). If the
  user says "update my details" with no specifics, treat as missing and ask
  what they want to change.
- read_preferred_contact_method — no fields.
- update_preferred_contact_method — required: contactMethod
  (one of "email" | "sms" | "phone").
- add_related_person — required: name, email, phone — ALL THREE must be
  extracted if present in the message; do not omit email even if name and
  phone are also present. Optional: relationship,
  authorizedToAct (boolean — true only if the user explicitly says this
  person can act/speak on their behalf; default false if unstated).
- update_related_person — required: personName (identifies who to update),
  plus at least one of: name, email, phone, relationship, authorizedToAct
  (the new value(s) to change).
- remove_related_person — required: personName.
- read_related_people — no fields.
- create_promise_to_pay — required: amountCents (integer, e.g. "500 euro"
  means 50000), dueDate (format: YYYY-MM-DD, must be a future date).
- read_promises_to_pay — no fields.
- mock_payment — required: amountCents (integer, e.g. "150 euro" means 15000).
- read_transactions — no fields.
- book_call_appointment — required: scheduledAt (full ISO 8601 datetime,
  resolved from relative phrases using CURRENT DATE AND TIME above).
  Optional: phone (only include if the user explicitly states a phone
  number for this call — do NOT ask for it or treat it as missing; the
  system will fall back to the phone number already on file), reason
  (extract the topic/purpose of the call whenever the user mentions one,
  e.g. "about my bill" → reason: "my bill", "regarding the missed payment"
  → reason: "the missed payment"; omit only if the user gives no topic
  at all — do not leave it out just because it wasn't phrased as a
  standalone field).
- read_call_appointments — no fields.

===== ROUTING LOGIC =====
1. If the message clearly matches one action AND all its required fields are
   present and unambiguous → return that action, with "fields" populated and
   "missingFields" as an empty array.
2. If the message clearly wants an action but is missing one or more required
   fields, or a required field is ambiguous (e.g. two related people with the
   same first name, and it's unclear which one) → return action: "clarify",
   with whatever fields WERE found in "fields", and the names of the missing
   or ambiguous fields in "missingFields".
3. If the message is off-topic, a greeting, small talk, or something this
   system cannot do at all → return action: "unsupported", with empty
   "fields" and empty "missingFields".
4. Before finalizing "fields" and "missingFields" for any action, re-read the
   user's message (and, if continuing a prior turn, the combined context)
   one field at a time: for each field required by the action, explicitly
   check "is this value present anywhere in the text?" before deciding it's
   missing. Do not let extracting one field cause you to skip checking for
   another — a message can contain a name, an email, and a phone number all
   at once, and each must be checked independently.

===== USING CONVERSATION HISTORY =====
You will be given the last few messages of this conversation. If the
assistant's previous message asked the user for specific missing
information (e.g. "what date and time works for you?"), and the user's new
message appears to answer that question, treat it as a continuation of the
SAME action from that earlier turn — combine the previously-known fields
with the newly-provided ones, and re-evaluate whether all required fields
are now present. Do not treat it as an unrelated new request.

===== EXAMPLES =====
User: "Pay 150 euro now."
→ {"action": "mock_payment", "fields": {"amountCents": 15000}, "missingFields": []}

User: "Can I book a call?"
→ {"action": "clarify", "fields": {}, "missingFields": ["scheduledAt"]}

User: "Book a call next Tuesday at 10am about my bill."
→ {"action": "book_call_appointment", "fields": {"scheduledAt": "2026-07-21T10:00:00.000Z", "reason": "about my bill"}, "missingFields": []}

User: "What's the weather like today?"
→ {"action": "unsupported", "fields": {}, "missingFields": []}

User: "Change Mark's phone number to +353831112233."
→ {"action": "update_related_person", "fields": {"personName": "Mark", "phone": "+353831112233"}, "missingFields": []}

User: "Add Mark Murphy, mark@example.test, +353831998877 so he can act for me."
→ {"action": "add_related_person", "fields": {"name": "Mark Murphy", "email": "mark@example.test", "phone": "+353831998877", "authorizedToAct": true}, "missingFields": []}

User: "Add my sister Sarah Byrne, sarah.byrne@example.test, +353851122334."
→ {"action": "add_related_person", "fields": {"name": "Sarah Byrne", "email": "sarah.byrne@example.test", "phone": "+353851122334", "relationship": "sister"}, "missingFields": []}

User: "Can I book a call?"
Assistant: "Could you tell me: what date/time, and what phone number?"
User: "Next Tuesday at 10am, +353871234567"
→ {"action": "book_call_appointment", "fields": {"scheduledAt": "2026-07-21T10:00:00.000Z", "phone": "+353871234567"}, "missingFields": []}`;
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_REGEX = /\+[0-9]{10,15}/;

function applyDeterministicFallback(
  rawMessage: string,
  parsedIntent: ParsedIntent,
): ParsedIntent {
  const targetActions = [
    "add_related_person",
    "update_related_person",
    "update_account_holder",
  ];

  if (!targetActions.includes(parsedIntent.action)) {
    return parsedIntent;
  }

  const finalizedIntent: ParsedIntent = {
    ...parsedIntent,
    fields: { ...parsedIntent.fields },
  };

  if (!finalizedIntent.fields.email) {
    const emailMatch = rawMessage.match(EMAIL_REGEX);
    if (emailMatch) {
      finalizedIntent.fields.email = emailMatch[0];
    }
  }

  if (!finalizedIntent.fields.phone) {
    const phoneMatch = rawMessage.match(PHONE_REGEX);
    if (phoneMatch) {
      finalizedIntent.fields.phone = phoneMatch[0];
    }
  }

  return finalizedIntent;
}

export async function parseIntent(
  message: string,
  context: { recentMessages: ChatMessage[] },
): Promise<ParsedIntent> {
  const fallback: ParsedIntent = {
    action: "unsupported",
    fields: {},
    missingFields: [],
  };
  // One retry on failure — occasional LLM output glitches (e.g. degenerate
  // repetition loops) are usually transient and succeed on a second attempt.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Always generate exact current timestamp whenever function is called
      const currentDateIso = new Date().toISOString();

      // Last 5 messages is enough context for slot-filling follow-ups without
      // blowing up token usage on long conversations.
      const historyParts = context.recentMessages.slice(-5).map((msg) => ({
        role: msg.role === "account_holder" ? "user" : "model",
        parts: [{ text: msg.content }],
      }));

      const conversationContents = [
        ...historyParts,
        { role: "user", parts: [{ text: message }] },
      ];
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s to timeout, prevent long delays

      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash", // gemini-3.5-flash or gemini-3.1-flash-lite
          contents: conversationContents,
          config: {
            systemInstruction: buildSystemPrompt(currentDateIso),
            temperature: 0,
            maxOutputTokens: 2048,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.MEDIUM,
            },
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                action: {
                  type: "STRING",
                  enum: [
                    "read_account",
                    "update_account_holder",
                    "read_preferred_contact_method",
                    "update_preferred_contact_method",
                    "add_related_person",
                    "update_related_person",
                    "remove_related_person",
                    "read_related_people",
                    "create_promise_to_pay",
                    "read_promises_to_pay",
                    "mock_payment",
                    "read_transactions",
                    "book_call_appointment",
                    "read_call_appointments",
                    "clarify",
                    "unsupported",
                  ],
                },
                fields: {
                  type: "OBJECT",
                  properties: {
                    firstName: { type: "STRING" },
                    lastName: { type: "STRING" },
                    email: { type: "STRING" },
                    phone: { type: "STRING" },
                    address: {
                      type: "OBJECT",
                      properties: {
                        line1: { type: "STRING" },
                        line2: { type: "STRING" },
                        city: { type: "STRING" },
                        postalCode: { type: "STRING" },
                        country: { type: "STRING" },
                      },
                    },
                    contactMethod: {
                      type: "STRING",
                      enum: ["email", "sms", "phone"],
                    },
                    name: { type: "STRING" },
                    personName: { type: "STRING" },
                    relationship: { type: "STRING" },
                    authorizedToAct: { type: "BOOLEAN" },
                    amountCents: { type: "INTEGER" },
                    dueDate: { type: "STRING" },
                    scheduledAt: { type: "STRING" },
                    reason: { type: "STRING" },
                  },
                },
                missingFields: {
                  type: "ARRAY",
                  items: { type: "STRING" },
                },
              },
              required: ["action", "fields", "missingFields"],
            },
            abortSignal: controller.signal,
          },
        });

        const responseText = response.text;
        if (!responseText) return fallback;

        const cleanJson = responseText.replace(/```json\n?|\n?```/g, "").trim();
        const rawParsed = JSON.parse(cleanJson);
        const validated = requestSchema.parse(rawParsed);
        const parsedIntent: ParsedIntent = {
          action: validated.action as ChatAction,
          fields: validated.fields,
          missingFields: validated.missingFields,
        };

        return applyDeterministicFallback(message, parsedIntent);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      console.error(
        `[IntentParser Error]: Attempt ${attempt + 1} failed.`,
        error,
      );
      if (attempt === 1) return fallback;
      await new Promise((resolve) => setTimeout(resolve, 400)); // pause before retry help with 503 errors
    }
  }

  return fallback;
}
