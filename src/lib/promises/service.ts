import { supabaseServer } from "@/lib/supabase/server";
import { PromiseToPay } from "@/lib/account/types";

// Converts a raw Supabase row into the app's PromiseToPay shape.
function mapPromiseToPayRow(row: any): PromiseToPay {
  return {
    id: row.id,
    amountCents: row.amount_cents,
    currency: row.currency,
    dueDate: row.due_date,
    status: row.status as "active" | "completed" | "cancelled" | "missed",
    createdAt: row.created_at,
  };
}

export async function listPromisesToPay(
  internalAccountId: string,
): Promise<PromiseToPay[]> {
  const { data, error } = await supabaseServer
    .from("promises_to_pay")
    .select("*")
    .eq("account_holder_id", internalAccountId);

  if (error)
    throw new Error(`Failed to list Promises to pay: ${error.message}`);

  return (data || []).map(mapPromiseToPayRow);
}

// Compare dates only (strip time-of-day) so "today" is correctly rejected
// regardless of what time it currently is.
export async function createPromiseToPay(
  internalAccountId: string,
  payload: { amountCents: number; dueDate: string },
): Promise<PromiseToPay> {
  if (payload.amountCents <= 0)
    throw new Error("Promise to pay amount must be greater than zero.");

  const parsedDate = new Date(payload.dueDate);

  if (isNaN(parsedDate.getTime()))
    throw new Error("Invalid due date format. Please provide a valid date.");

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const targetDate = new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate(),
  );

  if (targetDate <= today) throw new Error("Due date must be a future date.");

  const { data, error } = await supabaseServer
    .from("promises_to_pay")
    .insert({
      account_holder_id: internalAccountId,
      amount_cents: Math.round(payload.amountCents),
      due_date: payload.dueDate,
      status: "active",
      currency: "EUR", // Currency hardcoded to EUR
    })
    .select()
    .single();

  if (error || !data)
    throw new Error(`Failed to create promise to pay: ${error?.message}`);

  return mapPromiseToPayRow(data);
}
