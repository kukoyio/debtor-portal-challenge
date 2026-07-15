import { supabaseServer } from "@/lib/supabase/server";
import { CallAppointment } from "@/lib/account/types";
import { validatePhone } from "../account/validators";

type SupabaseCallAppointmentRow = {
  id: string;
  scheduled_at: string;
  phone: string;
  reason?: string | null;
  status: "scheduled" | "cancelled" | "completed";
};

// Converts a raw Supabase row into the app's CallAppointment shape.
function mapCallAppointmentRow(row: SupabaseCallAppointmentRow): CallAppointment {
  return {
    id: row.id,
    scheduledAt: row.scheduled_at,
    phone: row.phone,
    reason: row.reason ?? undefined,
    status: row.status as "scheduled" | "cancelled" | "completed",
  };
}

export async function listFutureCallAppointments(
  internalAccountId: string,
): Promise<CallAppointment[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from("call_appointments")
    .select("*")
    .eq("account_holder_id", internalAccountId)
    .eq("status", "scheduled")
    .gt("scheduled_at", now);

  if (error)
    throw new Error(`Failed to list future appointments: ${error.message}`);

  return (data || []).map(mapCallAppointmentRow);
}

export async function bookCallAppointment(
  internalAccountId: string,
  payload: { scheduledAt: string; phone: string; reason?: string },
): Promise<CallAppointment> {
  if (!validatePhone(payload.phone))
    throw new Error("Phone must start with '+' followed by 10 to 15 digits.");

  const parsedDate = new Date(payload.scheduledAt);
  if (isNaN(parsedDate.getTime()))
    throw new Error(
      "Invalid date format. Please provide a valid date and time.",
    );

  const now = new Date();
  if (parsedDate <= now)
    throw new Error(
      "Cannot book a call in the past. Please select a future date and time.",
    );

  const { data, error } = await supabaseServer
    .from("call_appointments")
    .insert({
      account_holder_id: internalAccountId,
      scheduled_at: parsedDate.toISOString(),
      phone: payload.phone,
      reason: payload.reason?.trim() || null,
      status: "scheduled",
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to book call appointment: ${error?.message}`);
  }

  return mapCallAppointmentRow(data);
}
