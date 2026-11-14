/**
 * Estimate templates (docs/specs/07 §3.5, §11, wave E3b): a saved estimate without client, property or lead.
 * Core, trade-agnostic. All money math goes through @octo/estimating-engine (rule 8): this file only picks prices
 * (current catalog, else the template's) and never sums anything itself.
 */
import { DEFAULT_TAX, parseQty, sectionIdOk, type CustomLine, type CustomOption } from "@octo/estimating-engine";
import type { CatalogItem, EstimateDoc, EstimateTemplate } from "@/data/types";
import type { DictKey } from "@/i18n";
import type { StarterEstimate } from "@/modules/registry";
import { catalogMatch } from "./catalogMatch";
import { canEditTemplates, stableUuid } from "./checklist";
import { MAX_OPTIONS, catalogUnitCost, catalogUnitPrice, clientSectionsOf, markedHidden, mainOption, newDoc, nextOptionName, normalizeDoc, optionTotals, uid } from "./estimateDoc";

/** The keys of a template line the server takes (app.valid_estimate_template_doc); a module's `source` never rides along */
type TemplateLine = Pick<CustomLine, "id" | "name" | "description" | "group" | "quantity" | "unit" | "unitPriceCents" | "unitCostCents" | "catalogItemId" | "optional" | "selected" | "clientVisible" | "sectionId">;

/** text the server takes: no control characters, at most `n` characters (never half an emoji: by code points) */
// eslint-disable-next-line no-control-regex
export const cut = (v: string, n: number): string => Array.from(v.replace(/[\u0000-\u001f\u007f]/g, " ")).slice(0, n).join("").trim();

function templateLine(l: CustomLine, withCost: boolean, keepIds = false): TemplateLine {
  const q = parseQty(String(l.quantity));
  const out: TemplateLine = {
    id: keepIds ? l.id : uid(),
    name: cut(l.name, 300),
    group: l.group,
    // the engine's own decimal (no «1,5», no spaces): what the server checks; not a number — kept, and the check refuses
    quantity: q ?? String(l.quantity),
    unit: cut(l.unit, 20),
    unitPriceCents: l.unitPriceCents,
  };
  if (l.description) out.description = Array.from(l.description).slice(0, 2000).join("");
  if (l.catalogItemId) out.catalogItemId = l.catalogItemId;
  if (l.optional) {
    out.optional = true;
    out.selected = false;
  }
  // #1232: its section, and «hidden from the client» — only at $0 (the engine and the server: a priced line is visible)
  if (sectionIdOk(l.sectionId)) out.sectionId = l.sectionId;
  // hidden as the phone reads it (false, or «false» / 0 written by another copy) — always a boolean false to the server
  if (markedHidden(l) && l.unitPriceCents === 0) out.clientVisible = false;
  // who does not see costs sends no key: the server then keeps what it had (spec 07 §11, E3b duty)
  if (withCost && l.unitCostCents !== undefined) out.unitCostCents = l.unitCostCents;
  return out;
}

/**
 * «Сохранить как шаблон»: the estimate's options, lines, add-ons, discount, tax, deposit and note — fresh ids, lines of a
 * module become plain lines (no measurement to recompute from, §11 №6), costs only for who sees them.
 */
export function toTemplateDoc(doc: EstimateDoc, costsVisible: boolean, taxExempt = false, keepIds = false): EstimateDoc {
  return {
    options: doc.options.map((o) => ({
      id: keepIds ? o.id : uid(),
      name: cut(o.name, 120),
      ...(o.recommended ? { recommended: true } : {}),
      // #1232: the sections as the client reads them (the server checks that form); the lines keep their sectionId
      ...(clientSectionsOf(o).length ? { sections: clientSectionsOf(o) } : {}),
      lines: o.lines.map((l) => templateLine(l, costsVisible, keepIds)),
    })),
    // a tax-exempt client's estimate has its tax switched off (exemptDoc): the template must not carry that to others
    settings: taxExempt ? { ...doc.settings, tax: DEFAULT_TAX } : { ...doc.settings },
    ...(doc.note ? { note: Array.from(doc.note).slice(0, 5000).join("") } : {}),
  };
}

/** the doc without our costs + the costs by line id (DB keeps them apart: EstimateTemplate.costs) */
export function splitCosts(doc: EstimateDoc): { doc: EstimateDoc; costs: Record<string, number> } {
  const costs: Record<string, number> = {};
  const options = doc.options.map((o) => ({
    ...o,
    lines: o.lines.map(({ unitCostCents, ...l }) => {
      if (unitCostCents !== undefined) costs[l.id] = unitCostCents;
      return l;
    }),
  }));
  return { doc: { ...doc, options }, costs };
}

const QTY = /^([0-9]{1,12}([.][0-9]{1,12})?|[.][0-9]{1,12})$/;
const SHARE = /^(0([.][0-9]{1,6})?|1([.]0{1,6})?|[.][0-9]{1,6})$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const cents = (v: unknown, max = 1e11): boolean => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
const text = (v: unknown, n: number): boolean => typeof v === "string" && Array.from(v).length <= n && !/[\u0000-\u001f\u007f]/.test(v);

/**
 * The server's check (app.valid_estimate_template_doc, migration 20261108230000) on the phone: a document it would
 * refuse is never queued (lesson of the director). Keep the two in step.
 */
export function validTemplateDoc(doc: EstimateDoc, costs: Record<string, number> = {}): boolean {
  if (JSON.stringify(doc).length > 262144 || doc.options.length < 1 || doc.options.length > 10) return false;
  if (doc.note != null && (typeof doc.note !== "string" || Array.from(doc.note).length > 5000)) return false;
  const lineIds = new Set<string>();
  const optIds = new Set<string>();
  for (const o of doc.options) {
    if (!ID.test(o.id) || optIds.has(o.id) || !text(o.name, 120) || o.lines.length > 200) return false;
    optIds.add(o.id);
    // #1232: sections — a list (the server puts them in the client's form itself, trigger t02, before its check)
    if (o.sections != null && !Array.isArray(o.sections)) return false;
    for (const l of o.lines) {
      if (!ID.test(l.id) || lineIds.has(l.id)) return false;
      lineIds.add(l.id);
      if (!text(l.name, 300) || !text(l.unit, 20) || !["service", "labor", "material"].includes(l.group)) return false;
      if (l.description != null && (typeof l.description !== "string" || Array.from(l.description).length > 2000)) return false;
      if (!QTY.test(String(l.quantity)) || !cents(l.unitPriceCents)) return false;
      const c = l.unitCostCents ?? costs[l.id];
      if (c !== undefined && !cents(c)) return false;
      if (l.catalogItemId != null && !ID.test(l.catalogItemId)) return false;
      // a boolean or none (the server's jsonb_typeof); false only at $0
      if (l.clientVisible != null && typeof l.clientVisible !== "boolean") return false;
      if (l.clientVisible === false && l.unitPriceCents !== 0) return false;
      if (l.sectionId != null && !sectionIdOk(l.sectionId)) return false;
    }
  }
  const s = doc.settings;
  if (s.discount) {
    if (s.discount.kind === "fixed" ? !cents(s.discount.cents) : !SHARE.test(String(s.discount.value))) return false;
  }
  if (!cents(s.tax.rateBps, 10000)) return false;
  // #1219: the rate in ppm, when there is one — a whole 0..1000000 (the server the same, app.valid_estimate_template_doc)
  if (s.tax.ratePpm !== undefined && !cents(s.tax.ratePpm, 1_000_000)) return false;
  if (s.deposit.kind === "pct" ? !cents(s.deposit.bps, 10000) : s.deposit.kind === "fixed" ? !cents(s.deposit.cents) : false) return false;
  return true;
}

export interface FromTemplate {
  doc: EstimateDoc;
  /** ids (in the new doc) of lines whose catalog item is gone: the template's price, «нет в каталоге, проверьте цену» */
  checkPrice: string[];
  /** ids of lines that were hidden and got a price from the catalog: shown to the client again (the mark «Снова видна клиенту») */
  unhidden: string[];
}

/**
 * A new estimate's document from a template (S5t): fresh ids; a line linked to the catalog takes the CURRENT catalog
 * price (PRD 05 EST-02) and cost; a line without a link keeps the template's price and cost (`costs`: the template's
 * side table, empty for who does not see costs). Costs never reach a phone that may not see them.
 */
export function fromTemplate(tpl: EstimateDoc, catalog: CatalogItem[], costs: Record<string, number>, costsVisible: boolean, fromModule = false): FromTemplate {
  const checkPrice: string[] = [];
  const options: CustomOption[] = tpl.options.map((o) => ({
    ...o,
    id: uid(),
    lines: o.lines.map((l) => {
      const id = uid();
      const { unitCostCents: _c, ...rest } = l;
      const line: CustomLine = { ...rest, id, selected: l.optional ? false : l.selected };
      if (l.catalogItemId) {
        const it = catalog.find((x) => x.id === l.catalogItemId);
        if (it && it.kind !== "kit") {
          line.unitPriceCents = catalogUnitPrice(it);
          const cost = catalogUnitCost(it);
          if (costsVisible && cost !== undefined) line.unitCostCents = cost;
          return line;
        }
        checkPrice.push(id);
      } else if (fromModule && !l.unitPriceCents) checkPrice.push(id); // a module's starter: a line its catalog lacked (§12 №3); a company's own $0 line is meant
      const cost = costs[l.id];
      if (costsVisible && cost !== undefined) line.unitCostCents = cost;
      return line;
    }),
  }));
  // a hidden line takes the catalog price → it is priced, so it is shown again (Р3 п.2: normalizeDoc on every entrance of a document)
  // the tax never comes from a template: a new estimate has it off, always (founder 12.11; spec 39 §11.9 п.3, DS §8.7) — the
  // client's total is the sum of the lines until the tax is switched on in this estimate
  const made = normalizeDoc({ options, settings: { ...tpl.settings, tax: { ...DEFAULT_TAX, groups: { ...DEFAULT_TAX.groups } } }, ...(tpl.note ? { note: tpl.note } : {}) });
  return { doc: made.doc, checkPrice, unhidden: made.unhidden };
}

/** what «Добавить из шаблона…» brought into an estimate: «Вернуть» takes out only these (DS §8.13, §15.2) */
export interface Appended {
  lineIds: string[];
  sectionIds: string[];
  optionIds: string[];
  /** the template's options that did not fit (three at most): their names, for the toast */
  skipped: string[];
  /** the arrived lines of the option being edited, in order: «Кол-во» of the first takes the cursor, «›» goes on */
  chain: string[];
}

/**
 * «Добавить из шаблона…» (DS §8.13, spec 39 §11.9 п.2): only adds — what is typed stays. `add` is the template as a new
 * estimate's document (fromTemplate: today's catalog prices, no tax). One option in the template: its lines go to the end
 * of the option being edited (`cur`); several: by number, the ones past the estimate's become new options while there are
 * fewer than three (a name already there gets the next free one), the rest are named in `skipped`. Sections come as
 * sections under new ids (the same template twice never clashes); the estimate's settings stay (no tax, no discount from
 * the template); the template's note goes in only where the estimate's is empty.
 */
export function appendTemplate(doc: EstimateDoc, add: EstimateDoc, cur: number): { doc: EstimateDoc; added: Appended } {
  const added: Appended = { lineIds: [], sectionIds: [], optionIds: [], skipped: [], chain: [] };
  const options = [...doc.options];
  const at = Math.max(0, Math.min(cur, options.length - 1));
  add.options.forEach((src, i) => {
    // the lines keep the ids fromTemplate gave them (fresh; «проверьте цену» and «Снова видна» point at them); the sections
    // get new ones — the template's own ids would clash with the same template added before
    const ids = new Map<string, string>();
    const srcSecs = Array.isArray(src.sections) ? src.sections.filter((x) => !!x && typeof x === "object") : [];
    for (const x of srcSecs) if (!ids.has(x.id)) ids.set(x.id, uid());
    const to = (id: string | undefined) => (id !== undefined && ids.has(id) ? ids.get(id)! : id);
    const lines = src.lines.map((l) => (l.sectionId !== undefined && ids.has(l.sectionId) ? { ...l, sectionId: to(l.sectionId) } : l));
    const secs = srcSecs.map((x) => ({ ...x, id: to(x.id)!, ...(x.parentId !== undefined ? { parentId: to(x.parentId) } : {}) }));
    const { recommended: _rec, ...plain } = src;
    const c: CustomOption = { ...plain, id: uid(), lines, ...(srcSecs.length ? { sections: secs } : {}) };
    const target = add.options.length === 1 ? at : i;
    const into = options[target];
    if (into) {
      options[target] = { ...into, lines: [...into.lines, ...lines], ...(secs.length || into.sections ? { sections: [...(Array.isArray(into.sections) ? into.sections : []), ...secs] } : {}) };
      if (target === at) added.chain.push(...lines.map((l) => l.id));
    } else if (options.length < MAX_OPTIONS) {
      const name = options.some((o) => o.name.trim() === c.name.trim()) ? nextOptionName(options) : c.name;
      options.push({ ...c, name });
      added.optionIds.push(c.id);
    } else {
      added.skipped.push(src.name);
      return;
    }
    added.lineIds.push(...lines.map((l) => l.id));
    added.sectionIds.push(...secs.map((x) => x.id));
  });
  const note = !doc.note?.trim() && add.note?.trim() ? { note: add.note } : {};
  return { doc: { ...doc, ...note, options }, added };
}

/** «Вернуть» of «Добавить из шаблона…»: the arrived lines, sections and options go; every other edit since stays */
export function removeAppended(doc: EstimateDoc, added: Appended): EstimateDoc {
  const lines = new Set(added.lineIds);
  const secs = new Set(added.sectionIds);
  const opts = new Set(added.optionIds);
  const options = doc.options
    .filter((o) => !opts.has(o.id))
    .map((o) => ({
      ...o,
      lines: o.lines.filter((l) => !lines.has(l.id)),
      ...(Array.isArray(o.sections) ? { sections: o.sections.filter((x) => !secs.has(x.id)) } : {}),
    }));
  // every own option was deleted after the add: an empty one stays (an estimate has one), never the template's lines
  return { ...doc, options: options.length ? options : [{ ...doc.options[0]!, lines: [], sections: [] }] };
}

/** «от $X» in the picker: the recommended option's total at today's catalog prices (the engine sums) */
export function templateFromCents(tpl: EstimateDoc, catalog: CatalogItem[]): number {
  const { doc } = fromTemplate(tpl, catalog, {}, false);
  return optionTotals(doc, mainOption(doc)).total;
}

/** who makes, changes and archives templates (§8; server: owner / admin / office = the app's director and dispatcher —
 *  the same rule as checklist templates); everyone uses them */
export const canEditEstimateTemplates = canEditTemplates;

export const ESTIMATE_TEMPLATE_NAME_MAX = 120;

/** a template the server takes: a name 1..120 without control characters, at least one option (else null: not queued) */
export function cleanEstimateTemplate(t: EstimateTemplate): EstimateTemplate | null {
  const name = cut(t.name, ESTIMATE_TEMPLATE_NAME_MAX);
  // our costs never sit in the doc (EstimateTemplate.costs): a cost put there by the save moves to `costs`
  const split = splitCosts(t.doc);
  const costs = { ...(t.costs ?? {}), ...split.costs };
  if (!name || !validTemplateDoc(split.doc, costs)) return null;
  return { ...t, name, doc: split.doc, ...(Object.keys(costs).length ? { costs } : {}) };
}

/** the picker and the list: live ones, last used first, then by name */
export function pickableTemplates(list: EstimateTemplate[]): EstimateTemplate[] {
  return list
    .filter((t) => !t.archivedAt)
    .sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "") || a.name.localeCompare(b.name));
}

/* ---------- E3c: starters of modules, copy (docs/specs/07 §12) ---------- */

/** the id of a module's starter estimate template in a company: fixed, so a second add (another phone) is the same row */
export const starterEstimateId = (companyId: string, moduleKey: string, key: string): string => stableUuid(`est-starter:${companyId}:${moduleKey}:${key}`);

/** the starters of the given (active) modules the company has not added yet (an archived one counts as added) */
export function estimateStartersToAdd(
  mods: readonly { key: string; estimateTemplates?: readonly StarterEstimate[] }[],
  templates: readonly EstimateTemplate[],
  companyId: string,
): { module: string; starter: StarterEstimate }[] {
  const have = new Set(templates.map((x) => x.id));
  return mods.flatMap((m) => (m.estimateTemplates ?? []).filter((s) => !have.has(starterEstimateId(companyId, m.key, s.key))).map((starter) => ({ module: m.key, starter })));
}

/**
 * What a starter's line finds in the catalog (#1336): its properties and the same unit; a kit never (no price of its own). The item must be ONE —
 * of several equally close candidates no first-by-name is taken (`several`: no link, $0 and «проверьте цену»).
 * `narrowed` — the module's own wish for this company: tried first. Only when nothing has it the line's wider `match` is the question (an item
 * priced by hand with fewer properties still serves, if it is the only one) — and such an item must not CONTRADICT the wish: one that
 * says another variant than the company's default is another thing, not a hand-priced version of it (`none`).
 */
export function starterLookup(catalog: readonly CatalogItem[], match: Record<string, string> | undefined, unit: string, narrowed?: Record<string, string>): { item?: CatalogItem; why: "found" | "none" | "several" } {
  if (!match) return { why: "none" };
  const pool = catalog.filter((it) => it.kind !== "kit" && it.unit.trim().toLowerCase() === unit.trim().toLowerCase());
  const only = (hits: CatalogItem[]): { item?: CatalogItem; why: "found" | "none" | "several" } => {
    if (!hits.length) return { why: "none" };
    const n = (it: CatalogItem) => Object.keys(it.attributes ?? {}).length;
    const top = hits.filter((h) => n(h) === n(hits[0]!)); // catalogMatch sorts the closest first
    return top.length === 1 ? { item: top[0]!, why: "found" } : { why: "several" };
  };
  if (narrowed) {
    const near = catalogMatch(pool, narrowed);
    if (near.length) return only(near);
  }
  const agrees = (it: CatalogItem) => !narrowed || Object.keys(narrowed).every((k) => { const v = it.attributes?.[k]; return v === undefined || v.trim().toLowerCase() === narrowed[k]!.trim().toLowerCase(); });
  return only(catalogMatch(pool, match).filter(agrees));
}

export const starterItem = (catalog: readonly CatalogItem[], match: Record<string, string> | undefined, unit: string, narrowed?: Record<string, string>): CatalogItem | undefined => starterLookup(catalog, match, unit, narrowed).item;

/**
 * Would a starter come out with NO line priced (#1336)? Then it is not added: all lines $0 and unlinked, and a later item does not find its line.
 * `none` — the catalog has nothing for its lines (an empty price list); `several` — some line has several equally fitting items and none of the
 * others is found (the company must sort its price list out). Counted the way `starterEstimateTemplate` finds items.
 */
export function starterAllUnpriced(s: StarterEstimate, ctx: { catalog: readonly CatalogItem[]; want?: (match: Record<string, string>) => Record<string, string> }): "none" | "several" | null {
  let total = 0, several = 0;
  for (const o of s.options) for (const l of o.lines) {
    total++;
    const r = starterLookup(ctx.catalog, l.match, l.unit, l.match && ctx.want ? ctx.want(l.match) : undefined);
    if (r.why === "found") return null;
    if (r.why === "several") several++;
  }
  return total ? (several ? "several" : "none") : null;
}

/**
 * A module's starter as the company's template (§12 №2, №3): the name in the app's language (`tApp`), what reaches the
 * client in the company's document language (`tDoc`); a line found in the catalog — the item's link, today's price and
 * (for who sees costs) cost; not found — price 0, no link. Tax and deposit from the company; clean as the server takes
 * it, else null.
 */
export function starterEstimateTemplate(
  moduleKey: string,
  s: StarterEstimate,
  ctx: { id: string; catalog: readonly CatalogItem[]; tApp: (k: DictKey) => string; tDoc: (k: DictKey) => string; depositBps?: number | null; costsVisible: boolean; /** #1336: the module's wish for this company (moduleDef.starterWant with its settings) */ want?: (match: Record<string, string>) => Record<string, string> },
): EstimateTemplate | null {
  const base = newDoc(ctx.depositBps);
  const costs: Record<string, number> = {};
  const doc: EstimateDoc = {
    options: s.options.map((o) => ({
      id: uid(),
      name: cut(ctx.tDoc(o.nameKey), 120),
      ...(o.recommended ? { recommended: true } : {}),
      lines: o.lines.map((l) => {
        const it = starterLookup(ctx.catalog, l.match, l.unit, l.match && ctx.want ? ctx.want(l.match) : undefined).item;
        const line: CustomLine = {
          id: uid(),
          name: cut(ctx.tDoc(l.nameKey), 300),
          group: l.group,
          quantity: parseQty(l.quantity) ?? l.quantity,
          unit: cut(l.unit, 20),
          unitPriceCents: it ? catalogUnitPrice(it) : 0,
          ...(it ? { catalogItemId: it.id } : {}),
          ...(l.optional ? { optional: true, selected: false } : {}),
        };
        const cost = it ? catalogUnitCost(it) : undefined;
        if (ctx.costsVisible && cost !== undefined) costs[line.id] = cost;
        return line;
      }),
    })),
    settings: { ...base.settings },
    ...(s.noteKey ? { note: Array.from(ctx.tDoc(s.noteKey)).slice(0, 5000).join("") } : {}),
  };
  return cleanEstimateTemplate({ id: ctx.id, name: ctx.tApp(s.nameKey), doc, ...(Object.keys(costs).length ? { costs } : {}), module: moduleKey });
}

/**
 * «Копировать» (§12 №11): a new template of the company — fresh ids, «<name> (копия)», no module's mark (the copy is the
 * company's own), no uses, not archived; costs only for who sees them (else no key: the server keeps none).
 */
export function copyTemplate(x: EstimateTemplate, name: string, costsVisible: boolean): EstimateTemplate | null {
  const costs: Record<string, number> = {};
  const options = x.doc.options.map((o) => ({
    ...o,
    id: uid(),
    lines: o.lines.map((l) => {
      const id = uid();
      const c = x.costs?.[l.id];
      if (costsVisible && c !== undefined) costs[id] = c;
      return { ...l, id };
    }),
  }));
  return cleanEstimateTemplate({ id: uid(), name, doc: { ...x.doc, options }, ...(Object.keys(costs).length ? { costs } : {}) });
}

/**
 * «Сохранить шаблон» from the builder (§12 №10): the edited doc as the template's — the same id, name and mark; lines
 * cleaned as «Сохранить как шаблон» does (toTemplateDoc); costs only for who sees them (absent key = the server keeps).
 */
export function editedTemplate(x: EstimateTemplate, doc: EstimateDoc, costsVisible: boolean, name = x.name): EstimateTemplate | null {
  // the template's own line ids kept: the server's costs of the lines (estimate_template_line_costs) stay theirs
  const { doc: d, costs } = splitCosts(toTemplateDoc(doc, costsVisible, false, true));
  return cleanEstimateTemplate({ ...x, name, doc: d, costs: costsVisible ? costs : undefined });
}

/** lines whose cost the builder wiped (who sees costs): the server keeps a cost unless told null (§12.7, T124) */
export function clearedCosts(x: EstimateTemplate, doc: EstimateDoc, costsVisible: boolean): string[] {
  if (!costsVisible || !x.costs) return [];
  return doc.options.flatMap((o) => o.lines).filter((l) => x.costs![l.id] !== undefined && l.unitCostCents === undefined).map((l) => l.id);
}

/** the template's doc for editing in the builder: its own ids; costs into the lines for who sees them */
export function templateForEdit(x: EstimateTemplate, costsVisible: boolean): EstimateDoc {
  const doc = JSON.parse(JSON.stringify(x.doc)) as EstimateDoc;
  if (!costsVisible || !x.costs) return doc;
  return { ...doc, options: doc.options.map((o) => ({ ...o, lines: o.lines.map((l) => (x.costs![l.id] !== undefined ? { ...l, unitCostCents: x.costs![l.id] } : l)) })) };
}
