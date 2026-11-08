/**
 * Purchase orders (docs/specs/37) between the app and the database rows: what ops.ts writes and repo.ts reads. Pure.
 */
import type { PoStatus, PurchaseOrder, PurchaseOrderLine } from "@/data/types";

const STATUSES: PoStatus[] = ["draft", "sent", "partially_received", "received", "cancelled"];
const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);
/** a numeric column as the app's decimal text ("2", "1.5") */
const num = (v: unknown) => (v === null || v === undefined ? "0" : String(Number(v)));

/** the header as the server takes it (every column: the save sends what is on the phone) */
export function poToRow(o: PurchaseOrder, companyId: string): Record<string, unknown> {
  return {
    id: o.id, company_id: companyId, supplier_id: o.supplierId || null, job_id: o.jobId || null, status: o.status,
    revision: o.revision, fulfillment: o.fulfillment, deliver_to: o.deliverTo || null, needed_on: o.neededOn || null,
    note: o.note || null, print_prices: o.printPrices, supplier_name: o.supplierName || null, supplier_phone: o.supplierPhone || null,
    supplier_email: o.supplierEmail || null, supplier_address: o.supplierAddress || null, sent_at: o.sentAt || null,
  };
}

/** a line as the server takes it (received_qty is po_receive's only) */
export function poLineToRow(l: PurchaseOrderLine, poId: string, companyId: string): Record<string, unknown> {
  return {
    id: l.id, company_id: companyId, po_id: poId, position: l.position, catalog_item_id: l.catalogItemId || null, name: l.name,
    supplier_sku: l.supplierSku || null, note: l.note || null, bom_qty: l.bomQty || null, qty: Number(l.qty), unit: l.unit,
    check_pack: l.checkPack,
  };
}

/** the server's rows → the app's orders: lines by order, costs by line (none for who does not see costs) */
export function posFromRows(orders: Record<string, unknown>[], lines: Record<string, unknown>[], costs: Record<string, unknown>[]): PurchaseOrder[] {
  const costOf = new Map(costs.map((r) => [String(r.line_id), Number(r.unit_cost_cents)]));
  const linesOf = new Map<string, PurchaseOrderLine[]>();
  for (const r of lines) {
    const k = String(r.po_id);
    const cost = costOf.get(String(r.id));
    linesOf.set(k, [
      ...(linesOf.get(k) ?? []),
      {
        id: String(r.id), position: Number(r.position ?? 0), name: String(r.name ?? ""), qty: num(r.qty), unit: String(r.unit ?? "ea"),
        receivedQty: num(r.received_qty), checkPack: r.check_pack === true,
        ...(str(r.catalog_item_id) ? { catalogItemId: str(r.catalog_item_id) } : {}),
        ...(str(r.supplier_sku) ? { supplierSku: str(r.supplier_sku) } : {}),
        ...(str(r.note) ? { note: str(r.note) } : {}),
        ...(str(r.bom_qty) ? { bomQty: str(r.bom_qty) } : {}),
        ...(cost !== undefined && Number.isFinite(cost) ? { costCents: cost } : {}),
      },
    ]);
  }
  return orders.map((r) => {
    const status = STATUSES.includes(r.status as PoStatus) ? (r.status as PoStatus) : "draft";
    return {
      id: String(r.id), status, revision: Number(r.revision ?? 0), fulfillment: r.fulfillment === "pickup" ? "pickup" : "delivery",
      printPrices: r.print_prices === true, createdAt: String(r.created_at ?? ""),
      ...(typeof r.row_version === "number" || typeof r.row_version === "string" ? { rowVersion: Number(r.row_version) } : {}),
      lines: (linesOf.get(String(r.id)) ?? []).sort((a, b) => a.position - b.position),
      ...(str(r.number) ? { number: str(r.number) } : {}),
      ...(str(r.supplier_id) ? { supplierId: str(r.supplier_id) } : {}),
      ...(str(r.job_id) ? { jobId: str(r.job_id) } : {}),
      ...(str(r.deliver_to) ? { deliverTo: str(r.deliver_to) } : {}),
      ...(str(r.needed_on) ? { neededOn: str(r.needed_on) } : {}),
      ...(str(r.note) ? { note: str(r.note) } : {}),
      ...(str(r.supplier_name) ? { supplierName: str(r.supplier_name) } : {}),
      ...(str(r.supplier_phone) ? { supplierPhone: str(r.supplier_phone) } : {}),
      ...(str(r.supplier_email) ? { supplierEmail: str(r.supplier_email) } : {}),
      ...(str(r.supplier_address) ? { supplierAddress: str(r.supplier_address) } : {}),
      ...(str(r.sent_at) ? { sentAt: str(r.sent_at) } : {}),
      ...(str(r.received_at) ? { receivedAt: str(r.received_at) } : {}),
    };
  });
}
