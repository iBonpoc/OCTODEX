/**
 * Universal estimate helpers (core, trade-agnostic). All money math goes through @octo/estimating-engine.
 */
import {
  activeLines,
  jobLineQty,
  catalogPrice,
  marginPctOf,
  partsCost,
  computeCustomOption,
  DEFAULT_TAX,
  type CustomLine,
  type CustomOption,
  type CustomSettings,
  type CustomTotals,
  type LineGroup,
  type LineSource,
  type EstimateSection,
  SECTIONS_MAX,
  SECTION_TITLE_MAX,
  countedSections,
  isSubsection,
  sectionIdOk,
} from "@octo/estimating-engine";
import type { CatalogItem, Estimate, EstimateDoc } from "@/data/types";
import { clientPages, pagesProblem } from "./docPages";
import { taxModeFor } from "@octo/estimating-engine";

/** UUID: Web Crypto when present (web, Node tests), expo-crypto on the phone. */
export const uid = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("expo-crypto") as typeof import("expo-crypto")).randomUUID();
};
export const MAX_OPTIONS = 3;
export const OPTION_NAMES = ["Good", "Better", "Best"];

export const DEFAULT_SETTINGS: CustomSettings = {
  discount: null,
  tax: DEFAULT_TAX,
  deposit: { kind: "pct", bps: 1000 },
  caHic: true,
};

export const newLine = (group: LineGroup, over: Partial<CustomLine> = {}): CustomLine => ({
  id: uid(),
  name: "",
  group,
  quantity: "1",
  unit: group === "labor" ? "hr" : "ea",
  unitPriceCents: 0,
  ...over,
});

export const newOption = (i: number, lines: CustomLine[] = []): CustomOption => ({ id: uid(), name: OPTION_NAMES[i] ?? `Option ${i + 1}`, lines });

/** New estimate; the company's default deposit applies (Company → Documents). */
export function newDoc(defaultDepositBps?: number | null): EstimateDoc {
  const deposit = defaultDepositBps === undefined ? DEFAULT_SETTINGS.deposit : defaultDepositBps === null ? ({ kind: "none" } as const) : ({ kind: "pct", bps: defaultDepositBps } as const);
  return { options: [newOption(0)], settings: { ...DEFAULT_SETTINGS, deposit } };
}

/** A copy of an option with fresh ids (for "add option"). */
export function cloneOption(o: CustomOption, i: number): CustomOption {
  // the sections go with it (the same ids — unique within an option): the lines keep their sectionId (Р4)
  return { id: uid(), name: OPTION_NAMES[i] ?? `Option ${i + 1}`, lines: o.lines.map((l) => ({ ...l, id: uid() })), ...(Array.isArray(o.sections) ? { sections: o.sections.filter((x) => !!x && typeof x === "object").map((x) => ({ ...x })) } : {}) };
}

/** a section's title as it may be kept: no control characters, at most SECTION_TITLE_MAX (the server cuts the same) */
// the same three sets as the server's app.client_title (migration 20261112150000): a control character (Cc) is a space,
// a format character (Cf: zero width, the direction marks…) goes, the title is trimmed of these spaces
// eslint-disable-next-line no-control-regex
const TITLE_CC = /[\u0000-\u001f\u007f-\u009f]/g;
const TITLE_CF = /[\u00ad\u0600-\u0605\u061c\u06dd\u070f\u08e2\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb]/g;
const TITLE_EDGE = /^[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g;
const cleanTitle = (t: unknown): string | undefined => {
  if (typeof t !== "string") return undefined;
  // the length in characters (never half an emoji), cut before the trim — as the server
  const x = Array.from(t.replace(TITLE_CC, " ").replace(TITLE_CF, "")).slice(0, SECTION_TITLE_MAX).join("").replace(TITLE_EDGE, "");
  return x ? x : undefined;
};
/** a section title as the editor keeps it (the same cleaning as normalizeDoc) */
export const cleanSectionTitle = cleanTitle;
/** hidden from the client as the server reads it: false, or «false» / 0 written by another copy */
const markedHidden = (l: { clientVisible?: unknown }): boolean => l.clientVisible === false || ["false", "0"].includes(String(l.clientVisible).toLowerCase());

const SECTION_KINDS: readonly string[] = ["service", "labor", "material", "module"];
/** what the client reads of a section — the same keys app.client_sections passes: id, title, a known kind, parentId */
const clientSection = (x: EstimateSection): EstimateSection => ({
  id: x.id,
  ...(cleanTitle(x.title) ? { title: cleanTitle(x.title) } : {}),
  ...(typeof x.kind === "string" && SECTION_KINDS.includes(x.kind) ? { kind: x.kind } : {}),
  ...(isSubsection(x) ? { parentId: x.parentId } : {}),
});

/**
 * A document as it may be counted and shown (spec 2026-11-12-estimate-editor Р3, Р4) — on every way in (the cloud, a
 * draft, a template, a module, the save): a line hidden from the client with a price is visible again (the founder: a
 * hidden line never changes the client's total) — its id in `unhidden` for the «Снова видна клиенту» mark; sections
 * past SECTIONS_MAX and a repeated id go (the engine's countedSections, the same order), a title is cleaned. A line whose
 * section is not there keeps its sectionId («без раздела» only where it is shown and counted). Unchanged — the same object.
 */
export function normalizeDoc(doc: EstimateDoc): { doc: EstimateDoc; unhidden: string[] } {
  const unhidden: string[] = [];
  let changed = false;
  const options = doc.options.map((o) => {
    // a broken option (an older or damaged copy) is left as it is: one estimate never stops the phone's start
    if (!o || typeof o !== "object" || !Array.isArray(o.lines)) return o;
    let oc = false;
    const lines = o.lines.map((l) => {
      if (markedHidden(l) && l.unitPriceCents !== 0) {
        unhidden.push(l.id);
        oc = true;
        const { clientVisible: _v, ...rest } = l;
        return rest;
      }
      return l;
    });
    let sections = o.sections;
    // not a list (a broken copy, another version): no sections — one estimate never stops the company's load
    if (o.sections !== undefined && !Array.isArray(o.sections)) {
      sections = undefined;
      oc = true;
    } else if (o.sections) {
      const seen = new Set<string>();
      // the engine's order (countedSections): the first 40, then the broken ones and a repeated id go
      const kept = o.sections
        .slice(0, SECTIONS_MAX)
        .filter((x) => !!x && typeof x === "object" && sectionIdOk(x.id))
        .filter((x) => !seen.has(x.id) && !!seen.add(x.id))
        .map((x) => {
          const title = cleanTitle(x.title);
          if (title === x.title) return x;
          const { title: _t, ...rest } = x;
          return title === undefined ? rest : { ...rest, title };
        });
      if (kept.length !== o.sections.length || kept.some((x, i) => x !== o.sections![i])) {
        sections = kept;
        oc = true;
      }
    }
    if (!oc) return o;
    changed = true;
    const { sections: _s, ...rest } = o;
    return { ...rest, lines, ...(sections ? { sections } : {}) };
  });
  return { doc: changed ? { ...doc, options } : doc, unhidden };
}

/** Unit price of a catalog item (materials: purchase + supplier tax + markup). */
export function catalogUnitPrice(it: CatalogItem): number {
  if (it.kind === "material" && it.costCents !== undefined) return catalogPrice(it.costCents, it.vendorTaxBps ?? 0, it.markupBps ?? 0);
  return it.priceCents;
}
/** Our cost per unit incl. supplier tax (hidden from the client). */
export function catalogUnitCost(it: CatalogItem): number | undefined {
  if (it.costCents === undefined) return undefined;
  return catalogPrice(it.costCents, it.vendorTaxBps ?? 0, 0);
}

/** Lines from a catalog item; a kit expands into its components (each lands in its own group). */
export function linesFromCatalog(it: CatalogItem, catalog: CatalogItem[], qty = "1"): CustomLine[] {
  if (it.kind === "kit") {
    return (it.components ?? []).flatMap((c) => {
      const sub = catalog.find((x) => x.id === c.itemId);
      if (!sub || sub.kind === "kit") return [];
      return linesFromCatalog(sub, catalog, c.qty);
    });
  }
  return [
    newLine(it.kind, {
      name: it.name,
      description: it.description,
      unit: it.unit,
      quantity: qty,
      unitPriceCents: catalogUnitPrice(it),
      unitCostCents: catalogUnitCost(it),
      catalogItemId: it.id,
    }),
  ];
}

/**
 * Catalog card tiles «Cost» and «Margin %» (list-cards chat, catalog list): our cost per unit incl. supplier tax,
 * the client price, the margin. A kit: Σ component cost × qty; unknown if any component has no cost or is missing.
 * Unknown cost → null (the card shows «—»), never a guess. All money math in @octo/estimating-engine.
 */
export function catalogItemEconomics(it: CatalogItem, catalog: CatalogItem[]): { costCents: number | null; priceCents: number; marginPct: string | null } {
  const priceCents = it.kind === "kit" ? kitPrice(it, catalog) : catalogUnitPrice(it);
  const costCents =
    it.kind === "kit"
      ? partsCost(
          (it.components ?? []).map((c) => {
            const sub = catalog.find((x) => x.id === c.itemId);
            return { unitCostCents: sub && sub.kind !== "kit" ? catalogUnitCost(sub) : undefined, qty: c.qty };
          }),
        )
      : (catalogUnitCost(it) ?? null);
  return { costCents, priceCents, marginPct: marginPctOf(priceCents, costCents) };
}

/** Kit price = Σ component price × qty (shown in the catalog). */
export function kitPrice(it: CatalogItem, catalog: CatalogItem[]): number {
  const o = { id: "k", name: it.name, lines: linesFromCatalog(it, catalog) };
  return computeCustomOption(o, { ...DEFAULT_SETTINGS, deposit: { kind: "none" } }).subtotal;
}

export const optionTotals = (doc: EstimateDoc, o: CustomOption): CustomTotals => computeCustomOption(o, doc.settings);

/** Margin is meaningful only when every counted line has a cost (typed lines often have none). */
export const costComplete = (o: CustomOption): boolean =>
  activeLines(o.lines).filter((l) => !l.optional || l.selected).every((l) => l.unitCostCents !== undefined);

/** Option shown by default: recommended, else the first. */
export const mainOption = (doc: EstimateDoc): CustomOption => doc.options.find((o) => o.recommended) ?? doc.options[0]!;

/** Apply the client's choice of add-ons to an option. */
export const withAddons = (o: CustomOption, addonIds: string[]): CustomOption => ({
  ...o,
  lines: o.lines.map((l) => (l.optional ? { ...l, selected: addonIds.includes(l.id) } : l)),
});

/**
 * Remove costs and what a module wrote (`source`: its price, name, «test price») before anything leaves for the client
 * from the app (the page /p/ on this device, PDF, letters). The server cuts the same on its side (app.client_doc).
 */
export function clientDoc(doc: EstimateDoc): EstimateDoc {
  const { pages: raw, ...rest } = doc;
  // pages the server would refuse never go (ops.ts withSendablePages): the client's PDF shows them neither
  const pages = pagesProblem(raw) === null ? clientPages(raw) : [];
  return {
    ...rest,
    // the attached pages as app.client_doc passes them (spec 33 П24.7): a broken shape or page never reaches the client
    ...(pages.length ? { pages } : {}),
    // a line with quantity 0 bills nothing and is how a part is left out (spec 33 П23.8а №4, П23.9): never shown as a $0 row
    // a line hidden from the client (only at $0 — the engine the same, Р3; the server's app.client_doc the same from РС-6)
    // goes whole; a section keeps only what the client reads (a module's key stays the company's)
    options: doc.options.map((o) => ({
      ...o,
      // a sectionId longer than an id may be (64) is no link: not passed (the server the same)
      lines: o.lines
        .filter((l) => !zeroQty(l) && !(markedHidden(l) && l.unitPriceCents === 0))
        .map(({ unitCostCents: _c, source: _s, sectionId, ...l }) => (sectionIdOk(sectionId) ? { ...l, sectionId } : l)),
      // sections that are not a list (a broken copy) never reach the client (as app.client_sections)
      sections: Array.isArray(o.sections) ? countedSections(o).map(clientSection) : undefined,
    })),
  };
}

/** The quantity people see (page /p/, PDF, the estimate screens): the one the engine and the server count — numeric(14,4),
 *  half away from zero, no trailing zeros ("1.23455" → "1.2346", "2.50" → "2.5"). Debt 1 of «Сметы» №1: the page showed
 *  the raw number while the sum counted the rounded one. A quantity that is not a number is shown as typed. */
export function shownQty(q: CustomLine["quantity"]): string {
  try {
    return jobLineQty(q);
  } catch {
    return String(q);
  }
}

/** quantity is a plain decimal zero ("0", "-0", "0.", "00", "0.00", " .0 ") — the same pattern as the server's app.client_doc
 *  (migration 20261108170000), so the demo page, the PDF and the real /p/ agree; a blank, broken or "0e5" quantity is not */
const ZERO_QTY = /^\s*[+-]?(0+(\.0*)?|\.0+)\s*$/;
export function zeroQty(l: Pick<CustomLine, "quantity">): boolean {
  return ZERO_QTY.test(String(l.quantity));
}

/**
 * The document kept in estimate_versions.calc_inputs: without costs (they live in estimate_line_costs, hidden from the
 * tech) but WITH `source` — «Обновить смету» needs it after a reload and on another phone (C4, spec 33 П23.7). The
 * client page never gets it: app.client_doc (20261106180000) passes only the listed fields of a line (core_rls T60, T97).
 */
export function storedDoc(doc: EstimateDoc): EstimateDoc {
  return {
    ...doc,
    options: doc.options.map((o) => ({ ...o, lines: o.lines.map(({ unitCostCents: _c, ...l }) => l) })),
  };
}

const isSource = (v: unknown): v is LineSource =>
  !!v && typeof v === "object" && !Array.isArray(v) && typeof (v as LineSource).module === "string" && typeof (v as LineSource).key === "string";

/** The marks of a line on the company's estimate screen (C4): from a module; no price yet; a test price still there;
 *  no longer in the module's data. The same words the check before sending uses (C5). */
export type LineMark = "module" | "noPrice" | "testPrice" | "gone";
export function lineMarks(l: CustomLine): LineMark[] {
  const s = l.source;
  if (!isSource(s)) return [];
  const out: LineMark[] = ["module"];
  if (s.gone) out.push("gone");
  if (s.noPrice && l.unitPriceCents === 0) out.push("noPrice");
  // a $0 TEST price is both: the card says what the check before sending will (review C4 №2)
  if (s.testPrice && l.unitPriceCents === s.priceCents) out.push("testPrice");
  return out;
}

/**
 * The check before sending (C5, spec 33 П23.9): lines of EVERY option and add-on (the client sees them all) that still
 * have no price, a test price, or are no longer in the module's data. Reads only the core flags (lineMarks) — the core
 * never asks a module. A line with quantity 0 never reaches the client, so it never stops a send.
 */
export type SendIssueKind = "noPrice" | "testPrice" | "gone";
export const SEND_ISSUE_KINDS: SendIssueKind[] = ["noPrice", "testPrice", "gone"];
export type SendIssueLine = { lineId: string; optionId: string; name: string };
export type SendIssues = Record<SendIssueKind, SendIssueLine[]>;
export function sendIssues(doc: EstimateDoc): SendIssues {
  const out: SendIssues = { noPrice: [], testPrice: [], gone: [] };
  for (const o of doc.options)
    for (const l of activeLines(o.lines)) {
      if (zeroQty(l)) continue;
      const marks = lineMarks(l);
      for (const k of SEND_ISSUE_KINDS) if (marks.includes(k)) out[k].push({ lineId: l.id, optionId: o.id, name: l.name.trim() || "—" });
    }
  return out;
}
export const issueCount = (i: SendIssues) => SEND_ISSUE_KINDS.reduce((n, k) => n + i[k].length, 0);

/**
 * The margin the office sees on the estimate screen (debt 5 of «Сметы» №1). The server's margin is gone after a tech
 * changed prices or lines (spec 19 §9.1: only who sees costs writes it): the office counts it from its own copy of the
 * document — the lines keep their costs (migration 20261108180000). A line without a cost → «not counted» with how many,
 * never an empty place. Lines with quantity 0 and add-ons the client did not take do not count. null: nothing to count.
 */
export type MarginView = { kind: "pct"; pct: string } | { kind: "missing"; lines: number };
export function marginView(e: { marginPct?: string | null; doc?: EstimateDoc; approval?: { optionId: string; addonIds: string[] } }): MarginView | null {
  if (e.marginPct) return { kind: "pct", pct: e.marginPct };
  if (!e.doc?.options.length) return null;
  const base = (e.approval && e.doc.options.find((o) => o.id === e.approval!.optionId)) || mainOption(e.doc);
  const o = e.approval ? withAddons(base, e.approval.addonIds) : base;
  const counted = activeLines(o.lines).filter((l) => (!l.optional || l.selected) && !zeroQty(l));
  const missing = counted.filter((l) => l.unitCostCents === undefined).length;
  if (missing) return { kind: "missing", lines: missing };
  const pct = counted.length ? optionTotals(e.doc, o).marginPct : null;
  return pct ? { kind: "pct", pct } : null;
}

/**
 * Fresh ids for options/lines when a sent estimate is edited (the sent version stays immutable in the database);
 * `from`: new line id → the sent line it was copied from — the server copies its cost for who cannot write costs
 * (debt 4 of «Сметы» №1, migration 20261108200000, core_rls T110–T111). Pure: test/reIdDoc.test.ts.
 */
export function reIdDoc(doc: EstimateDoc, newId: () => string): { doc: EstimateDoc; from: Record<string, string> } {
  const from: Record<string, string> = {};
  const options = doc.options.map((o) => ({
    ...o,
    id: newId(),
    lines: o.lines.map((l) => {
      const id = newId();
      from[id] = l.id;
      return { ...l, id };
    }),
  }));
  return { doc: { ...doc, options }, from };
}

/** What saveEstimate stores and sends: a sent (not draft) estimate gets new ids and the map to its sent lines; a new
 *  estimate or a draft keeps its ids and sends no map (director's review #420 №2). Pure: test/reIdDoc.test.ts. */
export function docForSave(prevStatus: string | undefined, doc: EstimateDoc, newId: () => string): { doc: EstimateDoc; linesFrom?: Record<string, string> } {
  if (!prevStatus || prevStatus === "draft") return { doc };
  const r = reIdDoc(doc, newId);
  return { doc: r.doc, linesFrom: r.from };
}

/** Summary fields kept on Estimate for lists (total, deposit, visible lines of the main option). */
export function summarize(doc: EstimateDoc, approved?: { optionId: string; addonIds: string[] }) {
  const base = (approved && doc.options.find((o) => o.id === approved.optionId)) || mainOption(doc);
  const o = approved ? withAddons(base, approved.addonIds) : base;
  const t = optionTotals(doc, o);
  return {
    totalCents: t.total,
    depositCents: t.deposit,
    marginPct: costComplete(o) ? t.marginPct : null,
    lines: activeLines(o.lines).map((l, i) => ({ name: l.name.trim() || "—", qty: shownQty(l.quantity), totalCents: t.lineTotals[i] ?? 0, optional: l.optional })),
  };
}

export const hasContent = (doc: EstimateDoc) => doc.options.some((o) => o.lines.some((l) => l.name.trim() && l.unitPriceCents >= 0));

/** Long random secret for the client link (not guessable). */
export function newToken(): string {
  return uid().replace(/-/g, "") + uid().replace(/-/g, "").slice(0, 8);
}

export function estimateTitle(doc: EstimateDoc, fallback: string): string {
  const names = mainOption(doc).lines.filter((l) => l.name.trim() && !l.optional).map((l) => l.name.trim());
  if (!names.length) return fallback;
  const s = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${s} +${names.length - 3}` : s;
}

export const isUniversal = (e: Estimate): e is Estimate & { doc: EstimateDoc } => !!e.doc?.options?.length;

/**
 * The amount on an estimate's list card (agreed with the list-cards chat, 05.11):
 * signed by the client (awaiting the company or approved) → what the client signed, with the chosen option's name;
 * not signed, several options → «from» the cheapest option; otherwise → the estimate total. Money through the engine.
 */
export function estimateListAmount(e: Pick<Estimate, "status" | "doc" | "approval" | "totalCents">): { cents: number; from: boolean; option?: string } {
  if ((e.status === "awaiting_countersign" || e.status === "approved") && e.approval) {
    return { cents: e.approval.totalCents, from: false, option: e.doc?.options.find((o) => o.id === e.approval!.optionId)?.name };
  }
  if (e.doc && e.doc.options.length > 1) {
    return { cents: Math.min(...e.doc.options.map((o) => optionTotals(e.doc!, o).total)), from: true };
  }
  return { cents: e.totalCents, from: false };
}

/**
 * The estimate of a tax-exempt client (wave П-2a, customers.tax_exempt): no sales tax. The server refuses an open version
 * with tax for such a client (22023), so the phone turns the tax off before it counts and saves; the rate and the
 * groups stay, so the tax comes back if the client stops being exempt. A signed (locked) version never changes.
 */
export function exemptDoc(doc: EstimateDoc, taxExempt: boolean | undefined): EstimateDoc {
  if (taxModeFor(taxExempt) !== "exempt" || !doc.settings.tax.enabled) return doc;
  return { ...doc, settings: { ...doc.settings, tax: { ...doc.settings.tax, enabled: false } } };
}
