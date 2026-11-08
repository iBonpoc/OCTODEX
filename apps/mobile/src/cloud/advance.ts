/**
 * Applying a client's advance to an invoice on the server (docs/specs/35-stripe.md §4г) → public.advance_apply. Needs the
 * network, never queued offline (the server decides, as a refund — PRD 16 §105). A repeat of the same apply is the same
 * answer (the database), so «no answer» may simply be tapped again. Our words only — never the server's text.
 */
import { advanceError, type AdvanceError } from "@/features/payments/advance";
import { supabase } from "./client";

export type AdvanceAnswer = { ok: true; balanceCents: number } | { ok: false; error: AdvanceError };

export async function advanceApply(paymentId: string, invoiceId: string): Promise<AdvanceAnswer> {
  try {
    const { data, error } = await supabase.rpc("advance_apply", { p_payment_id: paymentId, p_invoice_id: invoiceId });
    if (error) {
      if (!error.code) return { ok: false, error: "retry_later" };   // no SQLSTATE: no answer — the same apply again is safe
      if (error.code === "42501") return { ok: false, error: /company is closed/.test(error.message ?? "") ? "company_closed" : "not_allowed" };
      return { ok: false, error: advanceError(error.message) };
    }
    const row = data as Record<string, unknown> | null;
    return row && typeof row === "object" ? { ok: true, balanceCents: Number(row.balance_cents ?? 0) } : { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "retry_later" };
  }
}
