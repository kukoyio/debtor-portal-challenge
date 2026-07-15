# Account Self-Service Chatbot

This is a self-service chatbot built with Next.js, Supabase, and Resend, designed to help customers with overdue accounts safely manage their account details, set up promises to pay, make payments, and schedule appointments.

## 🚀 Live Application
*   **Production Deployment:** https://debtor-portal-challenge-seven.vercel.app/

---

## 💻 Local Setup Instructions

Follow these steps to configure and run the application on your local machine:

### 1. Database Configuration
This project uses Supabase for persistent data storage.
*   Log in to your Supabase account and create a new database project.
*   Navigate to the **SQL Editor** in your Supabase dashboard.
*   Locate the migration files in the `supabase/migrations/` directory of this repository.
*   Copy and run the contents of these files in the SQL Editor to set up the required table schemas and populate them with the initial synthetic user seed data.

### 2. Environment Variables
Copy the example environment file to create your local environment configuration:

```bash
cp .env.local.example .env.local
```
Fill in your specific keys in `.env.local`.

> **Do not commit this file to version control.**

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-key

RESEND_API_KEY=re_your_api_key
NOTIFICATION_FROM_EMAIL=Account Portal <notifications@example.test>

# Choose one provider for message parsing. Do not commit real keys.
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
OPENROUTER_API_KEY=sk-or-your-openrouter-key
GEMINI_API_KEY=sk-or-your-gemini-key
```

## 3. Install Dependencies

Install the project packages using pnpm:

```bash
pnpm i
```

## 4. Running the App

Start the local development server:

```bash
pnpm dev
```

## 5. Running Tests

The core logic and offline validation checks can be run without network access:

```bash
pnpm test
```

## Verification Matrix

| Example # | User Input Example | Intent / Action Parsed | Implementation Location | Automated Test Location |
| --- | --- | --- | --- | --- |
| 1 | “What phone number is on my account?” | `read_account` | Router branch in [src/lib/chat/action-router.ts](src/lib/chat/action-router.ts) calling `getAccount` from [src/lib/account/service.ts](src/lib/account/service.ts). | Test block: “retrieves the account phone number when asked” in [src/lib/chat/chat-contracts.test.ts](src/lib/chat/chat-contracts.test.ts). |
| 2 | “Change my phone number to +353831112233.” | `update_account_holder` | Router branch in [src/lib/chat/action-router.ts](src/lib/chat/action-router.ts), validated by `validateUpdateAccountHolder` in [src/lib/chat/validators.ts](src/lib/chat/validators.ts), then written by `updateAccountHolder` in [src/lib/account/service.ts](src/lib/account/service.ts). | Test block: “updates the account holder phone number and queues a redacted notification” in [src/lib/chat/chat-contracts.test.ts](src/lib/chat/chat-contracts.test.ts). |
| 3 | “Add Mark Murphy, mark@example.test, +353831998877 so he can act for me.” | `add_related_person` | Router branch in [src/lib/chat/action-router.ts](src/lib/chat/action-router.ts), validated by `validateAddRelatedPerson` in [src/lib/chat/validators.ts](src/lib/chat/validators.ts), then persisted by `addRelatedPerson` in [src/lib/related-people/service.ts](src/lib/related-people/service.ts). | Test block: “adds an authorized related person with name, email, and phone” in [src/lib/chat/chat-contracts.test.ts](src/lib/chat/chat-contracts.test.ts). |
| 4 | “Add my brother so he can speak for me.” | `clarify` | Router `clarify` branch in [src/lib/chat/action-router.ts](src/lib/chat/action-router.ts), with intent guidance from [src/lib/chat/intent-parser.ts](src/lib/chat/intent-parser.ts). | Test block: “returns a clarify result without calling any service when fields are missing” in [src/lib/chat/chat-contracts.test.ts](src/lib/chat/chat-contracts.test.ts). |
| 5 | “Can I pay 500 euro on the 1st of next month?” | `create_promise_to_pay` | Router branch in [src/lib/chat/action-router.ts](src/lib/chat/action-router.ts), validated by `validateCreatePromiseToPay` in [src/lib/chat/validators.ts](src/lib/chat/validators.ts), then stored by `createPromiseToPay` in [src/lib/promises/service.ts](src/lib/promises/service.ts). | Test block: “records a one-time promise to pay with amount and future due date” in [src/lib/chat/chat-contracts.test.ts](src/lib/chat/chat-contracts.test.ts). |
| 6 | “Pay 150 euro now.” | `mock_payment` | Router branch in [src/lib/chat/action-router.ts](src/lib/chat/action-router.ts), validated by `validateMockPayment` in [src/lib/chat/validators.ts](src/lib/chat/validators.ts), then executed by `makePayment` in [src/lib/payments/service.ts](src/lib/payments/service.ts). | Test block: “records a mocked payment transaction and surfaces payment failures” in [src/lib/chat/chat-contracts.test.ts](src/lib/chat/chat-contracts.test.ts). |
| 7 | “Show my transactions.” | `read_transactions` | Router branch in [src/lib/chat/action-router.ts](src/lib/chat/action-router.ts) calling `listTransactions` in [src/lib/payments/service.ts](src/lib/payments/service.ts). | Test block: “shows transaction history when requested” in [src/lib/chat/chat-contracts.test.ts](src/lib/chat/chat-contracts.test.ts). |
| 8 | “Book a call next Tuesday at 10am about my bill.” | `book_call_appointment` | Router branch in [src/lib/chat/action-router.ts](src/lib/chat/action-router.ts), validated by `validateBookCallAppointment` in [src/lib/chat/validators.ts](src/lib/chat/validators.ts), then written by `bookCallAppointment` in [src/lib/appointments/service.ts](src/lib/appointments/service.ts). | Test block: “books a future call appointment and rejects dates in the past” in [src/lib/chat/chat-contracts.test.ts](src/lib/chat/chat-contracts.test.ts). |
| 9 | “Book a call yesterday.” | `book_call_appointment` | Same router/service path as Example 8, but the validation path rejects the past date before the service is invoked. | Test block: “books a future call appointment and rejects dates in the past” in [src/lib/chat/chat-contracts.test.ts](src/lib/chat/chat-contracts.test.ts). |

## Design Notes

### 1. System Architecture & Data Flow

This application uses a clean three-layer architecture to ensure the AI never has direct access to the database.

#### UI Layer
A Next.js dashboard reads and displays data directly from Supabase.

#### Brain Layer
The `/api/chat` route processes incoming messages. Gemini 3.5 Flash translates the user's natural language into a structured action (for example, `mock_payment`).

#### Validation & Service Layer
Before anything reaches Supabase, plain TypeScript code using Zod schemas strictly validates the data. If validation succeeds, the appropriate service performs the database update.

#### Notification System
Every successful data change triggers a background task that generates an encrypted PDF using a custom `pdfkit` build and sends it via Resend.

---

### 2. Key Decisions & Trade-offs

#### Gemini 3.5 Flash over OpenAI (ADR-002)

Gemini was chosen because of its generous free tier and fast response times. Since it can occasionally struggle to produce strictly formatted JSON, defensive fallback logic was implemented to maintain system stability.

#### PDFKit Standalone (ADR-003)

Many PDF libraries either lack password protection or have font compatibility issues when bundled by Next.js. Using the standalone build of `pdfkit` solved both problems.

#### In-Memory Chat History (ADR-006)

Account data is stored securely in Supabase, while chat history is stored temporarily in server memory. This approach is lightweight and suited the project's scope, although conversation history is lost when the server restarts.

#### No Pre-Payment Confirmations (ADR-005)

Because payments are simulated and no real funds are transferred, confirmation prompts were intentionally omitted. Instead, an immediate notification email acts as the confirmation record.

---

### 3. Handling Failures & LLM Quirks

#### Handling Multi-Field Extraction Failures

During testing, a recurring issue was observed: when users supplied multiple details in a single message (such as a name, email address, and phone number), the LLM would occasionally omit one of the fields.

##### Solution

A custom fallback parser was implemented. If the LLM fails to extract an email address or phone number, regular expressions automatically recover the missing values from the original message before validation.

If required fields are still missing after this step, Zod validation stops the request and prompts the user for the missing information.

#### Resilient Notifications

If Resend is unavailable or PDF generation fails, database updates are **not** rolled back. Instead, the notification result is recorded in the `notification_attempts` table with a status such as `sent`, `failed`, or `logged`. This ensures notification failures never prevent legitimate account updates.

#### Atomic Balances (ADR-007)

Account balances are prevented from becoming negative. Any payment that exceeds the available balance is rejected during validation rather than silently reducing the balance to zero.

---

### 4. Security & Privacy

#### Trust Boundaries (ADR-014)

The frontend never performs database writes. The server resolves the internal account ID once and passes it securely to the service layer.

#### No Raw PII in Logs (ADR-013)

Sensitive information is never exposed in logs or error reports. All values returned by the notification service redact email addresses (for example, `m***@example.test`).

#### PDF Password Protection (ADR-012)

Sensitive financial information is never included in the email body. Instead, it is contained within an attached PDF encrypted using the last four digits of the account holder's registered phone number.

---

### 5. Next Steps for Production

If this system were being prepared for production, the highest-priority improvements would include:

- **Redis-backed chat history:** Move chat history from server memory to a persistent data store so conversations survive server restarts.
- **Notification retry queue:** Add a background worker to automatically retry failed email deliveries caused by temporary network issues.
- **Strict ID unification (ADR-015):** Standardize internal database service interfaces so all services use the same ID conventions.
- **Verified email domain:** Replace the Resend sandbox domain with a fully authenticated production domain.

---

### 6. Known Limitations

#### LLM Multi-Field Extraction Reliability

Testing surfaced a repeatable pattern: when a single message requires
extracting two or more required fields at once (e.g. name + email + phone
when adding a related person), the model occasionally omitted one field
from its structured output — and its own `missingFields` self-report did
not always catch its own omission.

**Mitigation:** every parsed result is independently re-validated against
required-field rules in `validators.ts` regardless of what the model
claims, so an omission never results in an incomplete database write —
only, at worst, one extra clarifying turn. A deterministic regex-based
fallback (see ADR-018) additionally recovers email/phone values directly
from the raw message for the actions most affected by this, before
validation runs.

#### Multi-Turn Conversation Continuity

Conversation history is held in an in-memory store scoped to the running
server process (see ADR-006). This is reliable for a continuously-running
local dev process, but is not guaranteed to persist across requests in a
serverless deployment (e.g. Vercel), where consecutive requests to the
same conversation are not guaranteed to hit the same running instance.
As a result, multi-turn slot-filling (answering a follow-up question in a
later message) may not reliably resolve in the deployed environment even
when it works correctly locally. The robust fix is backing conversation
history with a database table instead of in-memory state — scoped out
for time and listed under Next Steps.

#### Read Actions Return Full Account Detail

`read_account` currently has no field-level granularity — asking "what's
my phone number" and asking "what's on my account" both return the same
full account summary. Functionally correct but not minimal. A future
iteration would add an optional `requestedField` to the action matrix so
replies can be scoped to exactly what was asked.