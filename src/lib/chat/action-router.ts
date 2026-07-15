import { ChatRequest, ChatActionResult, ChatMessage } from "./types";
import { parseIntent } from "./intent-parser";
import { appendMessage, getRecentMessages } from "./conversation-store";
import {
  getAccount,
  getInternalAccountId,
  updateAccountHolder,
  updatePreferredContactMethod,
} from "../account/service";
import {
  listRelatedPeople,
  addRelatedPerson,
  updateRelatedPerson,
  removeRelatedPerson,
  findRelatedPersonByName,
} from "../related-people/service";
import { listPromisesToPay, createPromiseToPay } from "../promises/service";
import { listTransactions, makePayment } from "../payments/service";
import {
  listFutureCallAppointments,
  bookCallAppointment,
} from "../appointments/service";
import { sendAccountChangeNotification } from "../notifications/account-change-notification";
import * as v from "./validators";

// Fires a notification after a successful write, without letting a
// notification failure break the underlying action's success reply.
async function notifyAfterChange(
  accountId: string,
  internalAccountId: string,
  changeSummary: string,
): Promise<void> {
  try {
    const snapshot = await getAccount(accountId);
    await sendAccountChangeNotification({
      internalAccountId,
      changedBy: "account_holder",
      changeSummary,
      accountSnapshot: snapshot,
    });
  } catch (err) {
    console.error(
      "[notifyAfterChange] Notification failed, action itself still succeeded:",
      err,
    );
  }
}

// Resolves a personName from the parser against real related people.
// Returns exactly one match, or a ChatActionResult explaining why we
// can't proceed (nobody found / more than one match).
async function resolveOneRelatedPerson(
  internalAccountId: string,
  action: ChatActionResult["action"],
  personName: string,
): Promise<{ id: string } | ChatActionResult> {
  const matches = await findRelatedPersonByName(internalAccountId, personName);

  if (matches.length === 0) {
    return {
      action,
      success: false,
      reply: `I couldn't find anyone named "${personName}" on this account.`,
    };
  }
  if (matches.length > 1) {
    const names = matches
      .map((p) => `${p.name} (${p.relationship ?? "related person"})`)
      .join(", ");
    return {
      action,
      success: false,
      reply: `More than one match for "${personName}": ${names}. Could you be more specific?`,
      missingFields: ["personName"],
    };
  }
  return { id: matches[0].id };
}

export async function handleChatMessage(
  request: ChatRequest,
): Promise<ChatActionResult> {
  const conversationId = request.conversationId || crypto.randomUUID();

  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "account_holder",
    content: request.message,
    createdAt: new Date().toISOString(),
  };
  appendMessage(conversationId, userMessage);

  const recentMessages = getRecentMessages(conversationId);
  const intent = await parseIntent(request.message, { recentMessages });

  let result: ChatActionResult;

  try {
    if (intent.action === "unsupported") {
      result = {
        action: "unsupported",
        success: false,
        reply:
          "I'm not able to help with that here — I can only handle account details, related people, payments, promises to pay, and call bookings.",
      };
    } else if (intent.action === "clarify") {
      // Model itself asked for clarification with no specific action locked in yet.
      const missing = intent.missingFields ?? [];
      result = {
        action: "clarify",
        success: false,
        reply:
          missing.length > 0
            ? `Could you tell me: ${missing.join(", ")}?`
            : "Could you tell me a bit more about what you'd like to do?",
        missingFields: missing,
      };
    } else {
      // internalAccountId resolved once, reused across every branch below.
      const internalAccountId = await getInternalAccountId(request.accountId);

      switch (intent.action) {
        case "read_account": {
          const account = await getAccount(request.accountId);
          const a = account.account;
          const accountSummary = `Here is a summary of your account:

          Status: ${a.status}
          Current Balance: ${(a.balanceCents / 100).toFixed(2)} ${a.currency}
          Preferred Contact: ${a.preferredContactMethod}
          Phone: ${a.phone}
          Email: ${a.email}
          Billing Address: ${a.address.line1}, ${a.address.city}, ${a.address.postalCode}, ${a.address.country}`;
          result = {
            action: "read_account",
            success: true,
            reply: accountSummary,
            account,
          };
          break;
        }

        case "read_preferred_contact_method": {
          const account = await getAccount(request.accountId);
          result = {
            action: "read_preferred_contact_method",
            success: true,
            reply: `Your preferred contact method is ${account.account.preferredContactMethod}.`,
          };
          break;
        }

        case "update_preferred_contact_method": {
          const check = v.validateUpdatePreferredContactMethod(intent.fields);
          if (!check.valid) {
            result = {
              action: intent.action,
              success: false,
              reply:
                check.reason ??
                "Which contact method would you like — email, sms, or phone?",
              missingFields: check.missingFields,
            };
            break;
          }
          await updatePreferredContactMethod(
            request.accountId,
            check.fields.contactMethod,
          );
          await notifyAfterChange(
            request.accountId,
            internalAccountId,
            "Your preferred contact method was updated",
          );
          result = {
            action: intent.action,
            success: true,
            reply: `Done — your preferred contact method is now ${check.fields.contactMethod}.`,
            notificationQueued: true,
          };
          break;
        }

        case "update_account_holder": {
          const check = v.validateUpdateAccountHolder(intent.fields);
          if (!check.valid) {
            result = {
              action: intent.action,
              success: false,
              reply:
                check.reason ??
                `I need a bit more info: ${check.missingFields.join(", ")}`,
              missingFields: check.missingFields,
            };
            break;
          }
          const updated = await updateAccountHolder(
            request.accountId,
            check.fields,
          );
          await notifyAfterChange(
            request.accountId,
            internalAccountId,
            "Your account details were updated",
          );
          result = {
            action: intent.action,
            success: true,
            reply: `Done — your details have been updated.`,
            notificationQueued: true,
          };
          break;
        }

        case "read_related_people": {
          const people = await listRelatedPeople(internalAccountId);
          const list = people
            .map(
              (p) =>
                `- ${p.name} (${p.relationship || "relationship not specified"}) — ${p.authorizedToAct ? "authorized to act on account" : "not authorized to act"}`,
            )
            .join("\n");
          result = {
            action: intent.action,
            success: true,
            reply:
              people.length === 0
                ? "You have no related people on file."
                : `You have ${people.length} related ${people.length === 1 ? "person" : "people"} on file:\n\n${list}`,
            relatedPeople: people,
          };
          break;
        }

        case "add_related_person": {
          const check = v.validateAddRelatedPerson(intent.fields);
          if (!check.valid) {
            result = {
              action: intent.action,
              success: false,
              reply:
                check.reason ??
                `I need a bit more info: ${check.missingFields.join(", ")}`,
              missingFields: check.missingFields,
            };
            break;
          }
          const person = await addRelatedPerson(
            internalAccountId,
            check.fields,
          );
          await notifyAfterChange(
            request.accountId,
            internalAccountId,
            `${person.name} was added as a related person`,
          );
          result = {
            action: intent.action,
            success: true,
            reply: `Added ${person.name} as a related person.`,
            notificationQueued: true,
          };
          break;
        }

        case "update_related_person": {
          const check = v.validateUpdateRelatedPerson(intent.fields);
          if (!check.valid) {
            result = {
              action: intent.action,
              success: false,
              reply:
                check.reason ??
                `I need a bit more info: ${check.missingFields.join(", ")}`,
              missingFields: check.missingFields,
            };
            break;
          }
          const resolved = await resolveOneRelatedPerson(
            internalAccountId,
            intent.action,
            check.fields.personName,
          );
          if ("reply" in resolved) {
            result = resolved;
            break;
          }
          const { personName, ...updateFields } = check.fields;
          const updated = await updateRelatedPerson(
            internalAccountId,
            resolved.id,
            updateFields,
          );
          await notifyAfterChange(
            request.accountId,
            internalAccountId,
            `${updated.name}'s details were updated`,
          );
          result = {
            action: intent.action,
            success: true,
            reply: `Updated ${updated.name}'s details.`,
            notificationQueued: true,
          };
          break;
        }

        case "remove_related_person": {
          const check = v.validateRemoveRelatedPerson(intent.fields);
          if (!check.valid) {
            result = {
              action: intent.action,
              success: false,
              reply: check.reason ?? `Who would you like to remove?`,
              missingFields: check.missingFields,
            };
            break;
          }
          const resolved = await resolveOneRelatedPerson(
            internalAccountId,
            intent.action,
            check.fields.personName,
          );
          if ("reply" in resolved) {
            result = resolved;
            break;
          }
          await removeRelatedPerson(internalAccountId, resolved.id);
          await notifyAfterChange(
            request.accountId,
            internalAccountId,
            "A related person was removed",
          );
          result = {
            action: intent.action,
            success: true,
            reply: `Removed ${check.fields.personName} from your account.`,
            notificationQueued: true,
          };
          break;
        }

        case "read_promises_to_pay": {
          const promises = await listPromisesToPay(internalAccountId);
          const list = promises
            .map(
              (p) =>
                `- ${(p.amountCents / 100).toFixed(2)} ${p.currency} due on ${p.dueDate} — status: ${p.status}`,
            )
            .join("\n");
          result = {
            action: intent.action,
            success: true,
            reply:
              promises.length === 0
                ? "You have no promises to pay on file."
                : `Here are your recorded promises to pay:\n\n${list}`,
            promisesToPay: promises,
          };
          break;
        }

        case "create_promise_to_pay": {
          const check = v.validateCreatePromiseToPay(intent.fields);
          if (!check.valid) {
            result = {
              action: intent.action,
              success: false,
              reply:
                check.reason ??
                `I need a bit more info: ${check.missingFields.join(", ")}`,
              missingFields: check.missingFields,
            };
            break;
          }
          try {
            const promise = await createPromiseToPay(
              internalAccountId,
              check.fields,
            );
            await notifyAfterChange(
              request.accountId,
              internalAccountId,
              "A new promise to pay was recorded",
            );
            result = {
              action: intent.action,
              success: true,
              reply: `Got it — recorded a promise to pay ${(promise.amountCents / 100).toFixed(2)} ${promise.currency} on ${promise.dueDate}.`,
              promiseToPay: promise,
              notificationQueued: true,
            };
          } catch (err) {
            // Catches the service-layer future-date business rule
            result = {
              action: intent.action,
              success: false,
              reply:
                err instanceof Error
                  ? err.message
                  : "Couldn't record that promise to pay.",
            };
          }
          break;
        }

        case "read_transactions": {
          const transactions = await listTransactions(internalAccountId);
          const list = transactions
            .map(
              (t) =>
                `- ${t.transactionDate}: ${t.type} of ${(t.amountCents / 100).toFixed(2)} ${t.currency} — status: ${t.status}`,
            )
            .join("\n");
          result = {
            action: intent.action,
            success: true,
            reply:
              transactions.length === 0
                ? "You have no transactions on file."
                : `Here is your transaction history:\n\n${list}`,
            transactions,
          };
          break;
        }

        case "mock_payment": {
          const check = v.validateMockPayment(intent.fields);
          if (!check.valid) {
            result = {
              action: intent.action,
              success: false,
              reply: check.reason ?? "How much would you like to pay?",
              missingFields: check.missingFields,
            };
            break;
          }
          try {
            const { transaction, newBalanceCents } = await makePayment(
              internalAccountId,
              check.fields.amountCents,
            );
            await notifyAfterChange(
              request.accountId,
              internalAccountId,
              "A payment was recorded on your account",
            );
            result = {
              action: intent.action,
              success: true,
              reply: `Done — recorded a payment of ${(transaction.amountCents / 100).toFixed(2)} ${transaction.currency}. Your new balance is ${(newBalanceCents / 100).toFixed(2)} ${transaction.currency}.`,
              transaction,
              notificationQueued: true,
            };
          } catch (err) {
            // Catches "exceeds current balance" from the service layer
            result = {
              action: intent.action,
              success: false,
              reply:
                err instanceof Error
                  ? err.message
                  : "Couldn't process that payment.",
            };
          }
          break;
        }

        case "read_call_appointments": {
          const appointments =
            await listFutureCallAppointments(internalAccountId);
          const list = appointments
            .map(
              (a) =>
                `- ${new Date(a.scheduledAt).toLocaleString()} — phone: ${a.phone} — ${a.reason || "general account discussion"} (${a.status})`,
            )
            .join("\n");
          result = {
            action: intent.action,
            success: true,
            reply:
              appointments.length === 0
                ? "You have no upcoming calls booked."
                : `Here are your scheduled call appointments:\n\n${list}`,
            callAppointments: appointments,
          };
          break;
        }

        case "book_call_appointment": {
          const check = v.validateBookCallAppointment(intent.fields);
          if (!check.valid) {
            result = {
              action: intent.action,
              success: false,
              reply:
                check.reason ??
                `I need a bit more info: ${check.missingFields.join(", ")}`,
              missingFields: check.missingFields,
            };
            break;
          }
          try {
            const appointment = await bookCallAppointment(
              internalAccountId,
              check.fields,
            );
            await notifyAfterChange(
              request.accountId,
              internalAccountId,
              "A call appointment was booked",
            );
            result = {
              action: intent.action,
              success: true,
              reply: `Booked your call for ${new Date(appointment.scheduledAt).toLocaleString()}.`,
              callAppointment: appointment,
              notificationQueued: true,
            };
          } catch (err) {
            result = {
              action: intent.action,
              success: false,
              reply:
                err instanceof Error ? err.message : "Couldn't book that call.",
            };
          }
          break;
        }

        default:
          result = {
            action: "unsupported",
            success: false,
            reply: "I'm not able to help with that.",
          };
      }
    }
  } catch (error) {
    console.error("[action-router] Unexpected error:", error);
    result = {
      action: intent.action,
      success: false,
      reply:
        "Sorry, I ran into an issue processing that request. Please try again.",
    };
  }

  const assistantMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: result.reply,
    createdAt: new Date().toISOString(),
  };
  appendMessage(conversationId, assistantMessage);

  return result;
}
