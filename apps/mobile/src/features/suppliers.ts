/**
 * Suppliers (docs/specs/36-suppliers.md, SUP1): the same rules as the server's CHECKs (migration 20261110000000), who
 * sees them, picking a supplier for a price-list item and the history of an item's cost. Pure (no React).
 */
import type { CatalogItem, CostHistoryEntry, DB, PaymentTerms, Role, Supplier } from "@/data/types";

export const PAYMENT_TERMS: PaymentTerms[] = ["cod", "prepaid", "net_15", "net_30", "net_60", "custom"];

// control characters and bidirectional overrides (they reach screens and the supplier order PDF)
// eslint-disable-next-line no-control-regex
const BAD = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/;
// the notes keep line breaks
// eslint-disable-next-line no-control-regex
const BAD_NOTE = /[\u0000-\u0009\u000b-\u001f\u007f‪-‮⁦-⁩]/;
const EMAIL = /^[^@\s]+@[^@\s]+$/;

/** owner, admin, office (director, dispatcher): sales and the tech never (the account number; spec 36 §4 №9) */
export const canSeeSuppliers = (role: Role) => role === "director" || role === "dispatcher";

/** a text field as the server takes it: trimmed, empty → absent; cut to `max`, bad characters taken out */
function text(v: string | undefined, max: number, bad = BAD): string | undefined {
  if (v === undefined) return undefined;
  const s = [...v.replace(new RegExp(bad.source, "g"), "").trim()].slice(0, max).join("").trim();
  return s === "" ? undefined : s;
}

/** the supplier as the server takes it; null — no name (the save is refused on the screen) */
export function cleanSupplier(x: Supplier): Supplier | null {
  const name = text(x.name, 80);
  if (!name) return null;
  const email = text(x.email, 120);
  const out: Supplier = { id: x.id, name, active: x.active !== false };
  const put = <K extends keyof Supplier>(k: K, v: Supplier[K] | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  put("contactName", text(x.contactName, 80));
  put("phone", text(x.phone, 30));
  put("email", email && EMAIL.test(email) ? email : undefined);
  put("accountNumber", text(x.accountNumber, 40));
  put("address", text(x.address, 200));
  put("terms", x.terms && PAYMENT_TERMS.includes(x.terms) ? x.terms : undefined);
  // the note of the terms only with «custom»
  put("termsNote", x.terms === "custom" ? text(x.termsNote, 80) : undefined);
  put("taxBps", typeof x.taxBps === "number" && Number.isInteger(x.taxBps) && x.taxBps >= 0 && x.taxBps <= 10000 ? x.taxBps : undefined);
  put("notes", text(x.notes, 500, BAD_NOTE));
  return out;
}

/** a typed email that the server would refuse (shown under the field, the save waits) */
export const emailBad = (v: string | undefined) => !!v?.trim() && !EMAIL.test(v.trim());

/** the supplier's code of an item: trimmed, 1..60, no control characters; "" / bad → absent */
export function cleanSupplierSku(v: string | undefined): string | undefined {
  return text(v, 60);
}

/**
 * An item with its supplier link cleaned. "" means «cleared» (sent as null); absent means «never set» (not sent: an old
 * server without the columns is never written to — like C3). An unknown supplier id is kept (another phone made it).
 */
export function cleanSupplierLink(it: CatalogItem): CatalogItem {
  if (it.supplierSku === undefined) return it;
  return { ...it, supplierSku: cleanSupplierSku(it.supplierSku) ?? "" };
}

export const suppliersOf = (db: DB) => db.suppliers ?? [];
export const supplierOf = (db: DB, id: string | undefined) => (id ? suppliersOf(db).find((x) => x.id === id) : undefined);

/** active first by name, then archived by name */
export function sortedSuppliers(list: Supplier[]): Supplier[] {
  return [...list].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

/** the price-list items of a supplier, by name */
export function itemsOfSupplier(db: DB, supplierId: string): CatalogItem[] {
  return db.catalog.filter((x) => x.supplierId === supplierId).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Picking a supplier for an item (spec 36 §1а S0c): the link, its name into `vendor` (old phones read it), and its tax
 * into the item's supplier tax when the supplier has one (the engine counts from the item's own — new estimate lines
 * follow, old ones keep their snapshot). null — no supplier: the link goes, `vendor` stays as typed before.
 */
export function pickSupplier(it: CatalogItem, s: Supplier | null): CatalogItem {
  // "" = cleared (the save sends null); never-set stays absent
  if (!s) return it.supplierId ? { ...it, supplierId: "", supplierSku: it.supplierSku === undefined ? undefined : "" } : it;
  return { ...it, supplierId: s.id, vendor: s.name, ...(s.taxBps !== undefined ? { vendorTaxBps: s.taxBps } : {}) };
}

/** the items of a supplier whose supplier tax differs from the supplier's own («Применить к N позициям?») */
export function itemsWithOtherTax(db: DB, s: Supplier): CatalogItem[] {
  if (s.taxBps === undefined) return [];
  return itemsOfSupplier(db, s.id).filter((x) => x.kind === "material" && (x.vendorTaxBps ?? 0) !== s.taxBps);
}

/** the name shown for an item's supplier: the supplier's, else the old text (`vendor`), else none */
export function supplierName(db: DB, it: CatalogItem): string | undefined {
  return supplierOf(db, it.supplierId)?.name ?? (it.vendor?.trim() || undefined);
}

/** the history of one item (newest first), or of every item of a supplier; at most `limit` */
export function historyOf(db: DB, where: { itemId?: string; supplierId?: string }, limit: number): CostHistoryEntry[] {
  const items = where.supplierId ? new Set(itemsOfSupplier(db, where.supplierId).map((x) => x.id)) : null;
  return (db.costHistory ?? [])
    .filter((h) => (where.itemId ? h.itemId === where.itemId : items ? items.has(h.itemId) : false))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit);
}

/**
 * The phone's own history row for a cost just saved (shown at once and offline; the next read from the server replaces
 * the list with the server's). Only who sees costs; nothing when neither the cost nor the supplier tax changed.
 */
export function localHistoryEntry(
  prev: CatalogItem | undefined,
  it: CatalogItem,
  id: string,
  at: string,
): CostHistoryEntry | null {
  const cost = it.costCents;
  const tax = it.vendorTaxBps;
  if (cost === undefined && tax === undefined) return null;
  if (prev && prev.costCents === cost && prev.vendorTaxBps === tax) return null;
  return {
    id, itemId: it.id, source: "manual", at, local: true,
    ...(it.supplierId ? { supplierId: it.supplierId } : {}),
    ...(cost !== undefined ? { costCents: cost } : {}),
    ...(tax !== undefined ? { vendorTaxBps: tax } : {}),
  };
}

/** the server's row of a supplier → the app's */
export function supplierFromRow(r: Record<string, unknown>): Supplier {
  const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);
  const terms = str(r.payment_terms) as PaymentTerms | undefined;
  return {
    id: String(r.id), name: String(r.name ?? ""), active: r.is_active !== false,
    ...(str(r.contact_name) ? { contactName: str(r.contact_name) } : {}),
    ...(str(r.phone) ? { phone: str(r.phone) } : {}),
    ...(str(r.email) ? { email: str(r.email) } : {}),
    ...(str(r.account_number) ? { accountNumber: str(r.account_number) } : {}),
    ...(str(r.address) ? { address: str(r.address) } : {}),
    ...(terms && PAYMENT_TERMS.includes(terms) ? { terms } : {}),
    ...(str(r.terms_note) ? { termsNote: str(r.terms_note) } : {}),
    ...(typeof r.purchase_tax_bps === "number" ? { taxBps: r.purchase_tax_bps } : {}),
    ...(str(r.notes) ? { notes: str(r.notes) } : {}),
  };
}

/** the app's supplier → the server's row (every column: the save sends what is on the screen) */
export function supplierToRow(x: Supplier, companyId: string): Record<string, unknown> {
  return {
    id: x.id, company_id: companyId, name: x.name, contact_name: x.contactName ?? null, phone: x.phone ?? null,
    email: x.email ?? null, account_number: x.accountNumber ?? null, address: x.address ?? null,
    payment_terms: x.terms ?? null, terms_note: x.termsNote ?? null, purchase_tax_bps: x.taxBps ?? null,
    notes: x.notes ?? null, is_active: x.active,
  };
}

/** the server's history row → the app's */
export function historyFromRow(r: Record<string, unknown>): CostHistoryEntry {
  return {
    id: String(r.id), itemId: String(r.item_id), source: String(r.source ?? "manual"), at: String(r.at),
    ...(typeof r.supplier_id === "string" ? { supplierId: r.supplier_id } : {}),
    ...(r.unit_cost_cents !== null && r.unit_cost_cents !== undefined ? { costCents: Number(r.unit_cost_cents) } : {}),
    ...(typeof r.vendor_tax_bps === "number" ? { vendorTaxBps: r.vendor_tax_bps } : {}),
  };
}

/** the vendor chips of a new expense: the company's active suppliers first, then the usual ones; no doubles; at most 8 */
export function expenseVendors(db: DB, usual: readonly string[]): string[] {
  const out: string[] = [];
  for (const n of [...sortedSuppliers(suppliersOf(db).filter((x) => x.active)).map((x) => x.name), ...usual]) {
    if (!out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n);
  }
  return out.slice(0, 8);
}

/**
 * The server's rows of one item / one supplier into the phone's history: they replace what the phone holds for that
 * scope (its own local rows of a save included — the server wrote its own), the rest stays. Newest first.
 */
export function mergeHistory(db: DB, where: { itemId?: string; supplierId?: string }, rows: CostHistoryEntry[]): CostHistoryEntry[] {
  const items = where.supplierId ? new Set(itemsOfSupplier(db, where.supplierId).map((x) => x.id)) : null;
  const inScope = (h: CostHistoryEntry) =>
    where.itemId ? h.itemId === where.itemId : h.supplierId === where.supplierId || (!!h.local && !!items?.has(h.itemId));
  const ids = new Set(rows.map((r) => r.id));
  return [...rows, ...(db.costHistory ?? []).filter((h) => !inScope(h) && !ids.has(h.id))].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/**
 * A full read of the company brings no history (the screens read it when opened): keep what the phone has read, so a
 * reload right after does not blank the open screen. Not for whom the server no longer gives costs.
 */
export function keepCostHistory(next: DB, cur: DB): DB {
  return next.costsVisible === false ? { ...next, costHistory: [] } : { ...next, costHistory: cur.costHistory ?? [] };
}
