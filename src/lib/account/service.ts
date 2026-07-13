import { supabaseServer } from '@/lib/supabase/server';
import { 
  AccountContext, 
  AccountHolder, 
  RelatedPerson, 
  PromiseToPay, 
  Transaction, 
  CallAppointment,
  ContactMethod
} from './types';

export async function getAccount(accountId: string): Promise<AccountContext> {
  // Fetch data 
  const { data: account, error } = await supabaseServer
    .from('account_holders')
    .select(`
      *,
      related_people (*),
      promises_to_pay (*),
      transactions (*),
      call_appointments (*)
    `)
    .eq('account_id', accountId) 
    .single();

  if (error || !account) {
    throw new Error(`Account with identifier ${accountId} could not be found.`);
  }

  // 2. Map flat columns and nest the address properties exactly
  const mappedAccount: AccountHolder = {
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

  // Map child relations using safe array fallbacks
  const mappedRelatedPeople: RelatedPerson[] = (account.related_people || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    relationship: p.relationship ?? undefined,
    authorizedToAct: p.authorized_to_act,
  }));

  const mappedPromisesToPay: PromiseToPay[] = (account.promises_to_pay || []).map((p: any) => ({
    id: p.id,
    amountCents: p.amount_cents,
    currency: p.currency,
    dueDate: p.due_date,
    status: p.status as "active" | "completed" | "cancelled" | "missed",
    createdAt: p.created_at,
  }));

  const mappedTransactions: Transaction[] = (account.transactions || []).map((t: any) => ({
    id: t.id,
    type: t.type as "payment" | "charge" | "fee" | "adjustment",
    status: t.status as "completed" | "pending" | "failed" | "posted",
    amountCents: t.amount_cents,
    currency: t.currency,
    description: t.description,
    transactionDate: t.transaction_date,
  }));

  const mappedCallAppointments: CallAppointment[] = (account.call_appointments || []).map((c: any) => ({
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
      supportPhone: account.support_phone ?? '+35318000000',
      supportEmail: account.support_email ?? 'support@example.test',
    },
    notificationRules: {
      sendEmailOnDataChange: true,
      pdfPasswordSource: "account_phone_last4",
    },
  };
}