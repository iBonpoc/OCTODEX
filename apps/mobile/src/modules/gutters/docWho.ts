/**
 * Whose and where, in the head of every Gutters document — the client's drawing, the crew's cut, the shop drawings, the
 * supplier's order (founder 18.11, #2159: «нет адреса, кому принадлежит»; «если это черновик, то тоже нужно обозначить»):
 * the lead's or the client's name and the job's address (the client's property; else the lead's own address). A
 * measurement tied to nobody is «Черновик · без адреса» in the document's language — never an empty head.
 */
import type { DB } from "@/data/types";
import type { MeasurementRow } from "./canvas/model";

export interface DocWho {
  /** the lead's or the client's name; for a draft — «Черновик · без адреса» */
  who: string;
  /** the job's address, one line; none for a draft or a lead without one */
  address?: string;
  draft: boolean;
}

const line = (...xs: (string | undefined)[]) => xs.map((x) => x?.trim()).filter(Boolean).join(", ") || undefined;

export function docWho(db: Pick<DB, "leads" | "properties" | "customers">, m: Pick<MeasurementRow, "leadId" | "propertyId">, draftWord: string): DocWho {
  const lead = m.leadId ? db.leads.find((l) => l.id === m.leadId) : undefined;
  const prop = m.propertyId ? db.properties.find((p) => p.id === m.propertyId) : undefined;
  const client = prop ? db.customers.find((c) => c.id === prop.customerId) : undefined;
  const name = lead?.name?.trim() || client?.name?.trim();
  const address = prop ? line(prop.address, prop.city) : lead ? line(lead.address, lead.city) : undefined;
  if (!name && !address) return { who: draftWord, draft: true };
  return { who: name ?? draftWord, ...(address ? { address } : {}), draft: false };
}
