import type { AccountContext } from "@/lib/account/types";
import { supabaseServer } from "@/lib/supabase/server";
import { Resend } from "resend";
import { generateEncryptedAccountPdf } from "./pdf";

// Takes the already-resolved internal UUID, not the public account_id
// string — the router resolves this once per request; this avoids a
// redundant lookup on every notification.
export type AccountChangeNotification = {
  internalAccountId: string;
  changedBy: "account_holder" | "authorized_representative";
  changeSummary: string;
  accountSnapshot: AccountContext;
};

export type AccountChangeNotificationResult = {
  notificationId: string;
  sent: boolean;
  redactedRecipient: string;
};

type NotificationAttemptStatus = "queued" | "sent" | "failed" | "logged";

async function recordNotificationAttempt(params: {
  internalAccountId: string;
  triggerAction: string;
  recipientEmail: string;
  status: NotificationAttemptStatus;
  sensitiveDetailInPdf: boolean;
  errorMessage?: string;
}): Promise<void> {
  try {
    const { error } = await supabaseServer
      .from("notification_attempts")
      .insert({
        account_holder_id: params.internalAccountId,
        trigger_action: params.triggerAction,
        recipient_email: params.recipientEmail,
        email_provider: "resend",
        status: params.status,
        sensitive_detail_in_pdf: params.sensitiveDetailInPdf,
        error_message: params.errorMessage ?? null,
      });

    if (error) {
      console.error(
        `[notification_attempts] Failed to write row: ${error.message}`,
      );
    }
  } catch (err) {
    console.error(`[notification_attempts] Unexpected error writing row:`, err);
  }
}

export async function sendAccountChangeNotification(
  notification: AccountChangeNotification,
): Promise<AccountChangeNotificationResult> {
  const { internalAccountId, changeSummary, accountSnapshot } = notification;

  const recipientEmail = accountSnapshot.account.email;
  const redactedRecipient = redactEmail(recipientEmail);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateEncryptedAccountPdf(accountSnapshot);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await recordNotificationAttempt({
      internalAccountId,
      triggerAction: changeSummary,
      recipientEmail,
      status: "failed",
      sensitiveDetailInPdf: false, // never got as far as generating the PDF
      errorMessage: `PDF generation failed: ${errorMessage}`,
    });
    return {
      notificationId: crypto.randomUUID(),
      sent: false,
      redactedRecipient,
    };
  }

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(
      `[notification] RESEND_API_KEY not set — logging instead of sending. ` +
        `internalAccountId=${internalAccountId} recipient=${redactedRecipient} summary="${changeSummary}"`,
    );
    await recordNotificationAttempt({
      internalAccountId,
      triggerAction: changeSummary,
      recipientEmail,
      status: "logged",
      sensitiveDetailInPdf: true,
    });

    return {
      notificationId: crypto.randomUUID(),
      sent: false,
      redactedRecipient,
    };
  }

  const resend = new Resend(apiKey);
  const emailBody = buildEmailBody(changeSummary);

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.NOTIFICATION_FROM_EMAIL ?? "notifications@example.test",
      to: recipientEmail,
      subject: "Your account was updated",
      text: emailBody,
      attachments: [
        {
          filename: "account-summary.pdf",
          content: pdfBuffer,
        },
      ],
    });

    if (error) {
      await recordNotificationAttempt({
        internalAccountId,
        triggerAction: changeSummary,
        recipientEmail,
        status: "failed",
        sensitiveDetailInPdf: true,
        errorMessage: error.message,
      });

      return {
        notificationId: crypto.randomUUID(),
        sent: false,
        redactedRecipient,
      };
    }

    await recordNotificationAttempt({
      internalAccountId,
      triggerAction: changeSummary,
      recipientEmail,
      status: "sent",
      sensitiveDetailInPdf: true,
    });

    return {
      notificationId: data?.id ?? crypto.randomUUID(),
      sent: true,
      redactedRecipient,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await recordNotificationAttempt({
      internalAccountId,
      triggerAction: changeSummary,
      recipientEmail,
      status: "failed",
      sensitiveDetailInPdf: true,
      errorMessage,
    });

    return {
      notificationId: crypto.randomUUID(),
      sent: false,
      redactedRecipient,
    };
  }
}

/**
 * Redacts an email for safe logging/return values
 */
function redactEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) return "***"; // malformed input, don't leak anything
  const firstChar = email[0];
  const domain = email.slice(atIndex);
  return `${firstChar}***${domain}`;
}

/**
 * Builds the plain-text/HTML-safe email body. Deliberately generic —
 * no account numbers, amounts, names, or specific old/new values here.
 * `changeSummary` is expected to already be phrased generically by the caller
 */
function buildEmailBody(changeSummary: string): string {
  return [
    "Hello,",
    "",
    `Your account was recently updated. ${changeSummary}.`,
    "",
    "For full details, please see the attached PDF. The PDF is password protected — the password is the last 4 digits of the phone number on file for your account.",
    "",
    "If you did not expect this change, please contact support immediately.",
  ].join("\n");
}
