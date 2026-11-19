/**
 * Purchase orders (docs/specs/37, SUP2): what a job needs to buy, grouped by supplier, in packs of the purchase unit;
 * the moves of an order; who may do what. Pure (no React). Quantities only through the engine (purchasePacks, sumQty).
 */
import { orderCostCents, packCostCents, purchasePacks, sumQty } from "@octo/estimating-engine";
import type { CatalogItem, DB, ID, PoStatus, PurchaseOrder, PurchaseOrderLine, Role } from "@/data/types";
import { resolveMerged } from "./catalogMatch";

/** a line a trade module adds to the order of a job (registry slot S11g, spec 37 §3) */
export interface ModulePurchaseLine {
  catalogItemId: ID;
  /** in the item's own unit; with `packed` — already in packs of the purchase unit */
  qty: string;
  packed?: boolean;
  note?: string;
  /** #2227: the item's variant (a module's colour): summed by item + variant, the variant's sku */
  variant?: { attr: string; value: string };
}

/** #2227: the words of the order the core cannot know (the supplier's language — en, rule 7): the caller gives them */
export interface OrderWords {
  /** «<property> not set» — a line of an item with variants that names none */
  variantNotSet: (attr: string) => string;
  /** «<property> code not set» — the variant has no supplier code: no code is put in its place (spec 33-price-key §11.4) */
  variantSkuNotSet: (attr: string) => string;
  /** the property's word («color») for the line's name */
  attrWord?: (attr: string) => string;
}
const PLAIN_WORDS: OrderWords = { variantNotSet: (a) => `${a} not set`, variantSkuNotSet: (a) => `${a} code not set` };

/** what a job needs, before packs: item (+ variant) → quantity in its own unit (and a module's note / packs) */
interface Need {
  item: CatalogItem;
  variant?: { attr: string; value: string };
  qty: string;
  packed?: string;
  note?: string;
}

/** owner, admin, office: make, edit, send, cancel (sales — no: spec 36 В3) */
export const canEditOrders = (role: Role) => role === "director" || role === "dispatcher";
/** the tech of the job and the office mark what came (public.po_receive) */
export const canReceive = (role: Role) => role !== "sales";

/** the key of a need: the item, and its variant when it has one */
const needKey = (itemId: ID, v?: { attr: string; value: string }) => (v ? `${itemId}|${v.attr}=${v.value}` : itemId);
const normVariant = (v: { attr: string; value: string } | undefined) =>
  v && v.attr && v.value?.trim() ? { attr: v.attr, value: v.value.trim().toLowerCase() } : undefined;

/**
 * The materials of a job: the approved option of its estimate (the recommended one when there is one option), else its job
 * lines. Summed by item + variant (#2227: one item for every value — two values of one item are two lines).
 * A line of a merged item (attributes.mergedInto) counts as the item it went into, with the variant of its own value.
 */
export function jobMaterialNeeds(db: DB, jobId: ID): { catalogItemId: ID; variant?: { attr: string; value: string }; qty: string }[] {
  const job = db.jobs.find((j) => j.id === jobId);
  if (!job) return [];
  const est = job.estimateId ? db.estimates.find((e) => e.id === job.estimateId) : undefined;
  const raw: { catalogItemId?: ID; variant?: { attr: string; value: string }; qty: string }[] = [];
  if (est?.doc) {
    const opt = est.doc.options.find((o) => o.id === est.approval?.optionId) ?? (est.doc.options.length === 1 ? est.doc.options[0] : undefined);
    for (const l of opt?.lines ?? []) {
      if (l.group !== "material") continue;
      if (l.optional && !(est.approval?.addonIds ?? []).includes(l.id)) continue;
      raw.push({ catalogItemId: l.catalogItemId, variant: normVariant(l.source?.variant), qty: String(l.quantity) });
    }
  } else {
    for (const l of (db.jobLines ?? []).filter((x) => x.jobId === jobId)) raw.push({ catalogItemId: l.catalogItemId, qty: l.quantity });
  }
  // only items of the price list that are materials; summed per item + variant (engine decimal)
  const by = new Map<string, { item: CatalogItem; variant?: { attr: string; value: string }; qs: string[] }>();
  for (const r of raw) {
    const found = r.catalogItemId ? db.catalog.find((c) => c.id === r.catalogItemId) : undefined;
    if (!found) continue;
    const m = resolveMerged(db.catalog, found);
    // the kind of the item it counts as (review #2241: the merged one's target)
    if (m.item.kind !== "material") continue;
    const variant = r.variant ?? m.variant;
    const k = needKey(m.item.id, variant);
    const had = by.get(k);
    by.set(k, { item: m.item, ...(variant ? { variant } : {}), qs: [...(had?.qs ?? []), r.qty] });
  }
  return [...by.values()].flatMap(({ item, variant, qs }) => {
    try {
      return [{ catalogItemId: item.id, ...(variant ? { variant } : {}), qty: sumQty(qs) }];
    } catch {
      return [];
    }
  });
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
 * #2227: a line of an item with variants — the variant's supplier, purchase unit and pack (else the item's) and ONLY the
 * variant's code: none — «code not set», never the item's or another colour's (spec 33-price-key §11.4, audit 19.11 №2);
 * a line naming no variant of such an item — «not set», no code.
 */
export function draftsForJob(db: DB, jobId: ID, moduleLines: ModulePurchaseLine[], withCosts: boolean, words: OrderWords = PLAIN_WORDS): DraftGroup[] {
  const needs = new Map<string, Need>();
  for (const n of jobMaterialNeeds(db, jobId)) {
    const item = db.catalog.find((c) => c.id === n.catalogItemId)!;
    needs.set(needKey(item.id, n.variant), { item, ...(n.variant ? { variant: n.variant } : {}), qty: n.qty });
  }
  // a module's lines replace the core's for an item + variant; several lines of the module for one are summed (review SUP2-а №4)
  const fromModule = new Set<string>();
  for (const m of moduleLines) {
    const found = db.catalog.find((c) => c.id === m.catalogItemId);
    // a module's bad quantity never replaces the core's line
    if (!found || !/^\d+(\.\d+)?$/.test(String(m.qty).trim())) continue;
    const r = resolveMerged(db.catalog, found);
    const variant = normVariant(m.variant) ?? r.variant;
    const k = needKey(r.item.id, variant);
    // review #2241: a module's line naming no variant stands for the whole item, as before variants — the core's lines of that
    // item with a variant go too (else the item is ordered twice)
    if (!variant) for (const key of [...needs.keys()]) if (key.startsWith(`${r.item.id}|`) && !fromModule.has(key)) needs.delete(key);
    const had = fromModule.has(k) ? needs.get(k) : undefined;
    try {
      const qty = had ? sumQty([had.packed ?? had.qty, m.qty]) : sumQty([m.qty]);
      const note = [had?.note, m.note].filter(Boolean).join(", ");
      needs.set(k, { item: r.item, ...(variant ? { variant } : {}), qty, ...(m.packed ? { packed: qty } : {}), ...(note ? { note } : {}) });
      fromModule.add(k);
    } catch {
      // a bad quantity of a module: the line is left out, the rest of the order is made
    }
  }
  const groups = new Map<string, DraftGroup>();
  const sorted = [...needs.values()].sort((a, b) => a.item.name.localeCompare(b.item.name) || (a.variant?.value ?? "").localeCompare(b.variant?.value ?? ""));
  for (const n of sorted) {
    const attrs = n.item.variants ? Object.keys(n.item.variants) : [];
    const vAttr = attrs[0];
    const vd = n.variant && n.item.variants?.[n.variant.attr]?.[n.variant.value];
    const packSize = vd?.packSize ?? n.item.packSize ?? null;
    let p: { packs: string; checkPack: boolean };
    try {
      // a module's packs are whole packs too (director's check of #461 №7): rounded up, at least 0.001
      p = n.packed !== undefined ? (Number(n.packed) >= 0.001 ? purchasePacks(n.packed, "1") : { packs: "0", checkPack: false }) : purchasePacks(n.qty, packSize);
    } catch {
      // a bad quantity (negative, empty) of one line does not stop the whole order (review SUP2-а №6)
      continue;
    }
    if (p.packs === "0") continue;
    const supplierId = vd?.supplierId ?? n.item.supplierId;
    const key = supplierId || "";
    const g = groups.get(key) ?? { ...(key ? { supplierId: key } : {}), lines: [] };
    const cost = withCosts && n.item.costCents !== undefined ? packCostCents(n.item.costCents, packSize) : undefined;
    // the item's own code only for an item without variants; a variant's code only its own (never another colour's)
    // review #2241 №2: a line with a variant takes ONLY the variant's code, also on an item that has no variants at all
    const sku = n.variant ? vd?.sku : vAttr ? undefined : n.item.supplierSku;
    const marks = [
      vAttr && !n.variant ? words.variantNotSet(words.attrWord?.(vAttr) ?? vAttr) : undefined,
      n.variant && !vd?.sku ? words.variantSkuNotSet(words.attrWord?.(n.variant.attr) ?? n.variant.attr) : undefined,
    ].filter(Boolean);
    const note = [n.note, ...marks].filter(Boolean).join(", ");
    g.lines.push({
      catalogItemId: n.item.id,
      name: n.variant ? `${n.item.name} · ${n.variant.value}` : n.item.name,
      qty: p.packs, unit: (vd?.purchaseUnit ?? n.item.purchaseUnit)?.trim() || n.item.unit,
      receivedQty: "0", checkPack: p.checkPack,
      ...(n.packed === undefined ? { bomQty: n.qty } : {}),
      ...(sku ? { supplierSku: sku } : {}),
      ...(note ? { note } : {}),
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
 * partially_received; nothing → sent.
 */
export function statusAfterReceive(o: Pick<PurchaseOrder, "status" | "lines">): PoStatus {
  const ls = o.lines;
  if (ls.length && ls.every((l) => Number(l.receivedQty) >= Number(l.qty))) return "received";
  if (ls.some((l) => Number(l.receivedQty) > 0)) return "partially_received";
  // every tick taken back (the undo of a marking): sent again — as public.po_receive
  return o.status === "draft" || o.status === "cancelled" ? o.status : "sent";
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

/** "2026-11-12" → "11/12/2026" (the date field shows US dates) */
export const usDate = (iso?: string) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : "");
/** "11/12/2026" → "2026-11-12"; not a real date → undefined */
export function isoDate(us: string): string | undefined {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(us.trim());
  if (!m) return undefined;
  const iso = `${m[3]}-${m[1]}-${m[2]}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? undefined : iso;
}

/** «Получено: 1 из 2» — lines that have all their quantity */
export const receivedCount = (o: Pick<PurchaseOrder, "lines">) => o.lines.filter((l) => Number(l.receivedQty) >= Number(l.qty)).length;

/** the status chip: draft / cancelled — neutral, sent — info, partially — warn, received — ok (colour only with the word) */
export const PO_TONE: Record<PoStatus, "neutral" | "info" | "warn" | "ok"> = {
  draft: "neutral", sent: "info", partially_received: "warn", received: "ok", cancelled: "neutral",
};
