/**
 * #2478 (спека 65 §3.5, В3 по умолчанию): the edits of an estimate's save the server refused because the client signed
 * meanwhile (estimate_signed_meanwhile) → a new draft estimate. The client's signature stays on the signed one; the person
 * chooses «Сделать копию» (this) or «Сбросить» (dismissRejected). The copy: fresh ids for options and lines (the refused
 * ids may already be in the database), the costs back on their lines, the same client, place, lead, template and title.
 * Pure: test/rejectedEstimateCopy.test.ts.
 */
import { reIdDoc } from "@/features/estimateDoc";
import type { EstimateDoc, ID } from "./types";

export interface RejectedEstimateEdit {
  title: string;
  customerId: ID;
  propertyId: ID;
  leadId?: ID;
  templateId?: ID;
  /** the document as the op sent it (without costs — storedDoc) */
  doc: EstimateDoc;
  /** line id → its cost, as the op sent it */
  costs?: Record<string, number>;
}

export function copyOfRejectedEstimate(edit: RejectedEstimateEdit, newId: () => string): Omit<RejectedEstimateEdit, "costs"> {
  const costs = edit.costs ?? {};
  const withCosts: EstimateDoc = {
    ...edit.doc,
    options: edit.doc.options.map((o) => ({ ...o, lines: o.lines.map((l) => (costs[l.id] !== undefined ? { ...l, unitCostCents: costs[l.id] } : l)) })),
  };
  const { doc } = reIdDoc(withCosts, newId);
  return { title: edit.title, customerId: edit.customerId, propertyId: edit.propertyId, ...(edit.leadId ? { leadId: edit.leadId } : {}), ...(edit.templateId ? { templateId: edit.templateId } : {}), doc };
}
