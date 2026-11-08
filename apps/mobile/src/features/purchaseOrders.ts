/**
 * Purchase orders (docs/specs/37, SUP2): what a job needs to buy, grouped by supplier, in packs of the purchase unit;
 * the moves of an order; who may do what. Pure (no React). Quantities only through the engine (purchasePacks, sumQty).
 */
import { orderCostCents, packCostCents, purchasePacks, sumQty } from "@octo/estimating-engine";
import type { CatalogItem, DB, ID, PoStatus, PurchaseOrder, PurchaseOrderLine, Role } from "@/data/types";

/** a line a trade module adds to the order of a job (registry slot S11g, spec 37 §3) */
export interface ModulePurchaseLine {
  catalogItemId: ID;
  /** in the item's own unit; with `packed` — already in packs of the purchase unit */
  qty: string;
  packed?: boolean;
  note?: string;
}

/** what a job needs, before packs: item → quantity in its own unit (and a module's note / packs) */
interface Need {
  item: CatalogItem;
  qty: string;
  packed?: string;
  note?: string;
}

/** owner, admin, office: make, edit, send, cancel (sales — no: spec 36 В3) */
export const canEditOrders = (role: Role) => role === "director" || role === "dispatcher";
/** the tech of the job and the office mark what came (public.po_receive) */
export const canReceive = (role: Role) => role !== "sales";

/** the job's material lines: the approved option of its estimate (+ the chosen add-ons) or its own lines */
export function jobMaterialNeeds(db: DB, jobId: ID): { catalogItemId: ID; qty: string }[] {
  const job = db.jobs.find((j) => j.id === jobId);
  if (!job) return [];
  const est = job.estimateId ? db.estimates.find((e) => e.id === job.estimateId) : undefined;
  const raw: { catalogItemId?: ID; qty: string }[] = [];
  if (est?.doc) {
    const opt = est.doc.options.find((o) => o.id === est.approval?.optionId) ?? (est.doc.options.length === 1 ? est.doc.options[0] : undefined);
    for (const l of opt?.lines ?? []) {
      if (l.group !== "material") continue;
      if (l.optional && !(est.approval?.addonIds ?? []).includes(l.id)) continue;
      raw.push({ catalogItemId: l.catalogItemId, qty: String(l.quantity) });
    }
  } else {
    for (const l of (db.jobLines ?? []).filter((x) => x.jobId === jobId)) raw.push({ catalogItemId: l.catalogItemId, qty: l.quantity });
  }
  // only items of the price list that are materials; summed per item (engine decimal)
  const by = new Map<ID, string[]>();
  for (const r of raw) {
    const it = r.catalogItemId ? db.catalog.find((c) => c.id === r.catalogItemId) : undefined;
    if (!it || it.kind !== "material") continue;
    by.set(it.id, [...(by.get(it.id) ?? []), r.qty]);
  }
  return [...by.entries()].map(([catalogItemId, qs]) => ({ catalogItemId, qty: sumQty(qs) }));
}

/** a draft order per supplier («none» — items without a supplier: pick one in the order) */
export interface DraftGroup {
  supplierId?: ID;
  lines: Omit<PurchaseOrderLine, "id" | "position">[];
}

/**
 * The drafts of a job (spec 37 §3): the core's material needs, a module's lines replacing the core's for the same item
 * (the module knows better), packs of the purchase unit, grouped by the item's supplier. `withCosts` — the expected
 * cost a pack (cost × pack size, without tax) for who sees costs.
 */
export function draftsForJob(db: DB, jobId: ID, moduleLines: ModulePurchaseLine[], withCosts: boolean): DraftGroup[] {
  const needs = new Map<ID, Need>();
  for (const n of jobMaterialNeeds(db, jobId)) {
    const item = db.catalog.find((c) => c.id === n.catalogItemId)!;
    needs.set(item.id, { item, qty: n.qty });
  }
  for (const m of moduleLines) {
    const item = db.catalog.find((c) => c.id === m.catalogItemId);
    if (!item) continue;
    needs.set(item.id, { item, qty: m.qty, ...(m.packed ? { packed: m.qty } : {}), ...(m.note ? { note: m.note } : {}) });
  }
  const groups = new Map<string, DraftGroup>();
  for (const n of [...needs.values()].sort((a, b) => a.item.name.localeCompare(b.item.name))) {
    const p = n.packed !== undefined ? { packs: n.packed, checkPack: false } : purchasePacks(n.qty, n.item.packSize ?? null);
    if (p.packs === "0") continue;
    const key = n.item.supplierId || "";
    const g = groups.get(key) ?? { ...(key ? { supplierId: key } : {}), lines: [] };
    const cost = withCosts && n.item.costCents !== undefined ? packCost(n.item) : undefined;
    g.lines.push({
      catalogItemId: n.item.id, name: n.item.name, qty: p.packs, unit: n.item.purchaseUnit?.trim() || n.item.unit,
      receivedQty: "0", checkPack: p.checkPack,
      ...(n.packed === undefined ? { bomQty: n.qty } : {}),
      ...(n.item.supplierSku ? { supplierSku: n.item.supplierSku } : {}),
      ...(n.note ? { note: n.note } : {}),
      ...(cost !== undefined ? { costCents: cost } : {}),
    });
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** the expected cost of one pack without tax: the item's cost × its pack size, whole cents (round half up) */
export function packCost(it: Pick<CatalogItem, "costCents" | "packSize">): number | undefined {
  return it.costCents === undefined ? undefined : packCostCents(it.costCents, it.packSize ?? null);
}

/** the moves the office may make by hand (po_receive makes the receiving ones) */
export const PO_MOVES: Record<PoStatus, PoStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["partially_received", "received", "cancelled"],
  partially_received: ["received", "cancelled"],
  received: ["partially_received"],
  cancelled: [],
};
export const canMove = (from: PoStatus, to: PoStatus) => PO_MOVES[from].includes(to);
/** lines can change: a draft, or a sent order (a new revision when sent again) */
export const linesEditable = (o: Pick<PurchaseOrder, "status">) => o.status === "draft" || o.status === "sent";

/**
 * The status after marking what came (as public.po_receive): every line has its qty → received; something came →
 * partially_received; nothing and it was received → partially_received; else as it was.
 */
export function statusAfterReceive(o: Pick<PurchaseOrder, "status" | "lines">): PoStatus {
  const ls = o.lines;
  if (ls.length && ls.every((l) => Number(l.receivedQty) >= Number(l.qty))) return "received";
  if (ls.some((l) => Number(l.receivedQty) > 0)) return "partially_received";
  return o.status === "received" ? "partially_received" : o.status;
}

/** the orders of a job, newest first */
export function ordersOfJob(db: DB, jobId: ID): PurchaseOrder[] {
  return (db.purchaseOrders ?? []).filter((o) => o.jobId === jobId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** the open draft of a job and a supplier (a second «Заказ поставщику» opens it instead of making another) */
export function openDraft(db: DB, jobId: ID, supplierId: ID | undefined): PurchaseOrder | undefined {
  return ordersOfJob(db, jobId).find((o) => o.status === "draft" && (o.supplierId ?? "") === (supplierId ?? ""));
}

/** the expected total of an order without tax (who sees costs): Σ qty × cost a pack, whole cents */
export function orderTotalCents(o: Pick<PurchaseOrder, "lines">): number | undefined {
  if (!o.lines.length || o.lines.some((l) => l.costCents === undefined)) return undefined;
  return orderCostCents(o.lines.map((l) => ({ qty: l.qty, costCents: l.costCents ?? 0 })));
}
