import { supabaseServer } from "@/lib/supabase/server";
import {
  AccountContext,
  AccountHolder,
  RelatedPerson,
  PromiseToPay,
  Transaction,
  CallAppointment,
  ContactMethod,
} from "./types";
import {
  validateAddress,
  validateEmail,
  validateName,
  validatePhone,
} from "./validators";

// Converts a raw Supabase row (snake_case columns) into the app's AccountHolder shape (camelCase).
function mapAccountHolderRow(account: any): AccountHolder {
  return {
    accountId: account.account_id,
    accountHolderFirstName: account.first_name,
    accountHolderLastName: account.last_name,
    email: account.email,
    phone: account.phone,
    address: {
      line1: account.address_line1,
      line2: account.address_line2 ?? undefined,
      city: account.city,
      postalCode: account.postal_code,
      country: account.country,
    },
    preferredContactMethod: account.preferred_contact_method as ContactMethod,
    reference: account.reference,
    creditorName: account.creditor_name,
    currency: account.currency,
    balanceCents: account.balance_cents,
    status: account.status,
    daysPastDue: account.days_past_due,
    minimumPaymentCents: account.minimum_payment_cents,
    lastPaymentDate: account.last_payment_date,
    lastPaymentAmountCents: account.last_payment_amount_cents,
  };
}

// Single query pulls the account plus every related table
export async function getAccount(accountId: string): Promise<AccountContext> {
  // Fetch data
  const { data: account, error } = await supabaseServer
    .from("account_holders")
    .select(
      `
      *,
      related_people (*),
      promises_to_pay (*),
      transactions (*),
      call_appointments (*)
    `,
    )
    .eq("account_id", accountId)
    .single();

  if (error || !account)
    throw new Error(`Account with identifier ${accountId} could not be found.`);

  // 2. Map flat columns and nest the address properties exactly
  const mappedAccount = mapAccountHolderRow(account);

  // Map child relations using safe array fallbacks
  const mappedRelatedPeople: RelatedPerson[] = (
    account.related_people || []
  ).map((p: any) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    relationship: p.relationship ?? undefined,
    authorizedToAct: p.authorized_to_act,
  }));

  const mappedPromisesToPay: PromiseToPay[] = (
    account.promises_to_pay || []
  ).map((p: any) => ({
    id: p.id,
    amountCents: p.amount_cents,
    currency: p.currency,
    dueDate: p.due_date,
    status: p.status as "active" | "completed" | "cancelled" | "missed",
    createdAt: p.created_at,
  }));

  const mappedTransactions: Transaction[] = (account.transactions || []).map(
    (t: any) => ({
      id: t.id,
      type: t.type as "payment" | "charge" | "fee" | "adjustment",
      status: t.status as "completed" | "pending" | "failed" | "posted",
      amountCents: t.amount_cents,
      currency: t.currency,
      description: t.description,
      transactionDate: t.transaction_date,
    }),
  );

  const mappedCallAppointments: CallAppointment[] = (
    account.call_appointments || []
  ).map((c: any) => ({
    id: c.id,
    scheduledAt: c.scheduled_at,
    phone: c.phone,
    reason: c.reason ?? undefined,
    status: c.status as "scheduled" | "cancelled" | "completed",
  }));

  return {
    account: mappedAccount,
    relatedPeople: mappedRelatedPeople,
    promisesToPay: mappedPromisesToPay,
    transactions: mappedTransactions,
    callAppointments: mappedCallAppointments,

    // billing_due_date / support_phone / support_email / last_statement_amount_cents
    // were added to the schema, not in the starter migration. See ADR-008.
    billing: {
      currentAmountCents: account.balance_cents,
      lastStatementAmountCents: account.last_statement_amount_cents,
      dueDate: account.billing_due_date,
    },
    paymentOptions: {
      payNowEnabled: true,
      promiseToPayEnabled: true,
      mockPaymentsEnabled: true,
      arrangementEnabled: false,
      eligibleArrangementOptions: [],
    },
    support: {
      humanSupportAvailable: true,
      supportPhone: account.support_phone,
      supportEmail: account.support_email,
    },
    notificationRules: {
      sendEmailOnDataChange: true,
      pdfPasswordSource: "account_phone_last4",
    },
  };
}

// Partial update: only fields present in `fields` are validated and written.
// Untouched fields are left alone in the database
export async function updateAccountHolder(
  accountId: string,
  fields: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: Partial<AccountHolder["address"]>;
  }>,
): Promise<AccountHolder> {
  const updatePayload: Record<string, any> = {};

  if (fields.firstName !== undefined) {
    if (!validateName(fields.firstName))
      throw new Error("First name cannot be empty.");
    updatePayload.first_name = fields.firstName.trim();
  }

  if (fields.lastName !== undefined) {
    if (!validateName(fields.lastName))
      throw new Error("Last name cannot be empty.");
    updatePayload.last_name = fields.lastName.trim();
  }

  if (fields.email !== undefined) {
    if (!validateEmail(fields.email))
      throw new Error("Email address is not valid.");
    updatePayload.email = fields.email.trim();
  }

  if (fields.phone !== undefined) {
    if (!validatePhone(fields.phone))
      throw new Error("Phone must start with '+' followed by 10 to 15 digits.");
    updatePayload.phone = fields.phone;
  }

  if (fields.address !== undefined) {
    if (!validateAddress(fields.address)) {
      throw new Error(
        "Address is incomplete. Line 1, City, Postal Code, and Country are required.",
      );
    }
    updatePayload.address_line1 = fields.address.line1!.trim();
    updatePayload.address_line2 = fields.address.line2?.trim() || null; // Allow clearing line 2
    updatePayload.city = fields.address.city!.trim();
    updatePayload.postal_code = fields.address.postalCode!.trim();
    updatePayload.country = fields.address.country!.trim();
  }

  if (Object.keys(updatePayload).length === 0) {
    throw new Error("No fields provided to update.");
  }

  const { data: updated, error } = await supabaseServer
    .from("account_holders")
    .update(updatePayload)
    .eq("account_id", accountId)
    .select()
    .single();

  if (error || !updated)
    throw new Error(
      `Failed to update account: ${error?.message || "Account not found"}`,
    );

  return mapAccountHolderRow(updated);
}

export async function updatePreferredContactMethod(
  accountId: string,
  method: ContactMethod,
): Promise<AccountHolder> {
  if (!["email", "sms", "phone"].includes(method))
    throw new Error(
      "Invalid contact method. Must be 'email', 'sms', or 'phone'.",
    );

  const { data: updated, error } = await supabaseServer
    .from("account_holders")
    .update({ preferred_contact_method: method })
    .eq("account_id", accountId)
    .select()
    .single();

  if (error || !updated)
    throw new Error(
      `Failed to update preferred contact method: ${error?.message || "Account not found"}`,
    );

  return mapAccountHolderRow(updated);
}

export async function getInternalAccountId(accountId: string): Promise<string> {
    const { data, error } = await supabaseServer
        .from('account_holders')
        .select('id')
        .eq('account_id', accountId)
        .single();

    if (error || !data) {
        throw new Error("Account with identifier ${accountId} could not be found.");
    }
    return data.id;
}
