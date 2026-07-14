import { AccountContext } from "../account/types";
import PDFDocument from "pdfkit";

/**
 * Formats integer cents as a currency string, e.g. 128500 -> "1,285.00 EUR"
 */
function formatCents(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

/**
 * Derives the PDF encryption password from the account holder's phone
 * number - the last 4 digits, per ADR (pdfPasswordSource: "account_phone_last4").
 * Example: "+353831234567" -> "4567"
 */
function derivePdfPassword(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, "");

  if (digitsOnly.length < 4) {
    // Extremely defensive — validatePhone() should already guarantee
    // 10-15 digits before this is ever called.
    throw new Error(
      "Cannot derive PDF password: phone number has fewer than 4 digits.",
    );
  }

  return digitsOnly.slice(-4);
}

export async function generateEncryptedAccountPdf(context: AccountContext): Promise<Buffer> {
    const { account, relatedPeople, promisesToPay, transactions, callAppointments } =
    context;
    
    const password = derivePdfPassword(account.phone);

    const now = new Date();
    const futureAppointments = callAppointments.filter(
    (appt) => appt.status === "scheduled" && new Date(appt.scheduledAt) > now,
    );

    const doc = new PDFDocument({
    margin: 50,
    userPassword: password,
    ownerPassword: password,
  });

  const chunks: Buffer[] = [];

  const pdfPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: Error) => reject(err));
  });

  // ---- helpers for consistent section formatting ----
  const sectionHeader = (title: string) => {
    doc.moveDown(1);
    doc.fontSize(14).font("Helvetica-Bold").text(title);
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica");
  };

  const line = (text: string) => {
    doc.text(text);
  };

  // ---- title ----
  doc.fontSize(18).font("Helvetica-Bold").text("Account Summary");
  doc.fontSize(10).font("Helvetica").text(`Generated: ${new Date().toISOString()}`);

  // ---- account summary ----
  sectionHeader("Account Summary");
  line(`Account ID: ${account.accountId}`);
  line(`Reference: ${account.reference}`);
  line(`Creditor: ${account.creditorName}`);
  line(`Status: ${account.status}`);
  line(`Days past due: ${account.daysPastDue}`);

  // ---- current contact details ----
  sectionHeader("Current Contact Details");
  line(`Name: ${account.accountHolderFirstName} ${account.accountHolderLastName}`);
  line(`Email: ${account.email}`);
  line(`Phone: ${account.phone}`);
  line(
    `Address: ${account.address.line1}${
      account.address.line2 ? ", " + account.address.line2 : ""
    }, ${account.address.city}, ${account.address.postalCode}, ${account.address.country}`,
  );

  // ---- preferred contact method ----
  sectionHeader("Preferred Contact Method");
  line(account.preferredContactMethod);

  // ---- current balance ----
  sectionHeader("Current Balance");
  line(`Balance: ${formatCents(account.balanceCents, account.currency)}`);
  line(`Minimum payment: ${formatCents(account.minimumPaymentCents, account.currency)}`);
  line(
    account.lastPaymentDate
      ? `Last payment: ${formatCents(account.lastPaymentAmountCents, account.currency)} on ${account.lastPaymentDate}`
      : "Last payment: none on record",
  );

  // ---- related people ----
  sectionHeader("Related People");
  if (relatedPeople.length === 0) {
    line("No related people on file.");
  } else {
    relatedPeople.forEach((p) => {
      line(
        `${p.name}${p.relationship ? " (" + p.relationship + ")" : ""} — ${p.email}, ${p.phone}${
          p.authorizedToAct ? " — authorized to act" : ""
        }`,
      );
    });
  }

  // ---- promises to pay ----
  sectionHeader("Promises to Pay");
  if (promisesToPay.length === 0) {
    line("No promises to pay on file.");
  } else {
    promisesToPay.forEach((p) => {
      line(
        `${formatCents(p.amountCents, p.currency)} due ${p.dueDate} — status: ${p.status}`,
      );
    });
  }

  // ---- transactions ----
  sectionHeader("Transactions");
  if (transactions.length === 0) {
    line("No transactions on file.");
  } else {
    transactions.forEach((t) => {
      line(
        `${t.transactionDate} — ${t.type} — ${formatCents(t.amountCents, t.currency)} — ${t.status} — ${t.description}`,
      );
    });
  }

  // ---- future call appointments ----
  sectionHeader("Future Call Appointments");
  if (futureAppointments.length === 0) {
    line("No upcoming call appointments.");
  } else {
    futureAppointments.forEach((a) => {
      line(`${a.scheduledAt} — ${a.phone}${a.reason ? " — " + a.reason : ""}`);
    });
  }

  doc.end();

  return pdfPromise;
}