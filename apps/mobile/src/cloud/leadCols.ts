/** App lead fields → public.leads columns (only the fields present in the patch). Pure — tested in test/leads.test.ts. */
import type { Lead } from "@/data/types";

export type LeadPatch = Partial<
  Pick<Lead, "name" | "phone" | "phone2" | "phone2Label" | "email" | "preferredContact" | "language" | "address" | "city" | "state" | "zip" | "sourceId"
    | "serviceItemId" | "service" | "timeframe" | "timeframeDate" | "budgetCents" | "message" | "assigneeId"
    | "interest" | "snoozedUntil" | "snoozeReason" | "remindedAt" | "askAgainAt" | "serviceCategoryId">
>;

const COLS: Record<keyof LeadPatch, string> = {
  name: "contact_name",
  phone: "phone",
  phone2: "phone2",
  phone2Label: "phone2_label",
  email: "email",
  preferredContact: "preferred_contact",
  language: "language",
  address: "address_line1",
  city: "address_city",
  state: "address_state",
  zip: "address_zip",
  sourceId: "source_id",
  serviceItemId: "service_item_id",
  service: "service_requested",
  timeframe: "timeframe",
  timeframeDate: "timeframe_date",
  budgetCents: "budget_cents",
  message: "message",
  assigneeId: "assigned_to",
  interest: "interest",
  snoozedUntil: "snoozed_until",
  snoozeReason: "snooze_reason",
  remindedAt: "reminded_at",
  askAgainAt: "ask_again_at",
  serviceCategoryId: "service_category_id",
};

export function leadCols(p: LeadPatch, full?: Pick<Lead, "address" | "city" | "state" | "zip">): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p) as [keyof LeadPatch, unknown][]) {
    if (!(k in COLS)) continue;
    out[COLS[k]] = v === "" || v === undefined ? null : v;
  }
  // keep the one-line address in sync for older readers (search, client page)
  if ("address" in p || "city" in p || "state" in p || "zip" in p) {
    const a = { ...full, ...p };
    out.address_text = [a.address, a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
  }
  if (out.contact_name === null) delete out.contact_name; // name is required
  return out;
}
