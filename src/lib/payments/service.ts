import { Transaction } from "../account/types";
import { supabaseServer } from "../supabase/server";

type SupabaseTransactionRow = {
  id: string;
  type: "payment" | "charge" | "fee" | "adjustment";
  status: "completed" | "pending" | "failed" | "posted";
  amount_cents: number;
  currency: string;
  description: string;
  transaction_date: string;
};

// Converts a raw Supabase row into the app's Transaction shape.
function mapTransactionRow(row: SupabaseTransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type as "payment" | "charge" | "fee" | "adjustment",
    status: row.status as "completed" | "pending" | "failed" | "posted",
    amountCents: row.amount_cents,
    currency: row.currency,
    description: row.description,
    transactionDate: row.transaction_date,
  };
}

export async function listTransactions(
  internalAccountId: string,
): Promise<Transaction[]> {
  const { data, error } = await supabaseServer
    .from("transactions")
    .select("*")
    .eq("account_holder_id", internalAccountId);

  if (error) throw new Error(`Failed to list transactions: ${error.message}`);

  return (data || []).map(mapTransactionRow);
}

export async function makePayment(
  internalAccountId: string,
  amountCents: number,
): Promise<{ transaction: Transaction; newBalanceCents: number }> {
  if (amountCents <= 0)
    throw new Error("Payment amount must be greater than zero.");

  const { data: account, error: fetchError } = await supabaseServer
    .from("account_holders")
    .select("balance_cents, currency")
    .eq("id", internalAccountId)
    .single();

  if (fetchError || !account) {
    throw new Error(
      `Failed to fetch account balance: ${fetchError?.message || "Account not found"}`,
    );
  }

  const currentBalanceCents = account.balance_cents;
  const currency = account.currency ?? "EUR";

  if (amountCents > currentBalanceCents) {
    throw new Error("Payment amount exceeds current balance.");
  }

  const newBalanceCents = currentBalanceCents - amountCents;

  /* insert the transaction, then update the balance. Not
   atomic: if the balance update fails after the transaction insert
   succeeds, the account is left inconsistent (transaction recorded,
   balance unchanged). Logged as CRITICAL below so it's visible in prod.*/

  // Insert Transaction Row First
  const { data: txData, error: txError } = await supabaseServer
    .from("transactions")
    .insert({
      account_holder_id: internalAccountId,
      amount_cents: Math.round(amountCents),
      currency: currency,
      type: "payment",
      status: "completed",
      description: "Mocked chat payment",
      transaction_date: new Date().toISOString().split("T")[0],
    })
    .select()
    .single();

  if (txError || !txData) {
    throw new Error(
      `Failed to record payment transaction: ${txError?.message}`,
    );
  }

  // Update Balance Step
  const { error: updateError } = await supabaseServer
    .from("account_holders")
    .update({ balance_cents: newBalanceCents })
    .eq("id", internalAccountId);

  if (updateError) {
    console.error(
      `CRITICAL: Transaction recorded for account ${internalAccountId}, but balance update failed: ${updateError.message}`,
    );
    throw new Error(
      `Payment recorded but failed to update account balance: ${updateError.message}`,
    );
  }

  return {
    transaction: mapTransactionRow(txData),
    newBalanceCents,
  };
}
