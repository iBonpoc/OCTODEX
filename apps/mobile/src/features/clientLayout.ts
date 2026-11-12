/**
 * What the CLIENT sees of an option's lines (PDF and the client page /p/, spec 2026-11-12 §5, РС-7b): with sections — each top
 * section with its own lines, its subsections and its subtotal, then «Other items» (lines of no section); without sections —
 * the lines by kind, as before. The titles are in the CLIENT's language (`t` is `tFor(docLanguageFor…)`, never the app's): a
 * section made by «Разложить по видам» has only a kind and is named from the dictionary, the person's own title goes as written
 * (the caller escapes it: `esc()` in the PDF, React on the page). The money is the engine's (`sectionSubtotals`): a subtotal counts
 * the lines that count — an add-on only when chosen. Hidden lines never get here (the server's client document drops them).
 */
import { LINE_GROUPS, activeLines, countedSections, sectionIdOk, sectionSubtotals, type CustomLine, type CustomOption, type CustomSettings, type EstimateSection, type LineGroup } from "@octo/estimating-engine";
import type { DictKey } from "@/i18n";

export type ClientRow =
  /** the lines by kind (no sections in the option) */
  | { type: "group"; group: LineGroup }
  | { type: "section"; id: string; title: string; depth: 0 | 1 }
  /** `i` — the index among `activeLines(option.lines)` */
  | { type: "line"; i: number; depth: 0 | 1 }
  /** the total of a top section (its own lines and its subsections') */
  | { type: "subtotal"; id: string; title: string; cents: number }
  /** the heading over the lines that belong to no section, when there are sections */
  | { type: "other"; title: string };

/** which add-ons are shown: the PDF — the chosen ones; the page — all of them (with a switch) */
export type OptionalShown = "selected" | "all";

type Tr = (key: DictKey, params?: Record<string, string | number>) => string;

/** the words of a section for the client: the title as written, else the kind from the dictionary, else «Untitled» */
export function sectionTitle(s: EstimateSection, t: Tr): string {
  const own = typeof s.title === "string" ? s.title.trim() : "";
  if (own) return own;
  if (s.kind === "material" || s.kind === "labor" || s.kind === "service") return t(`est.sec.${s.kind}` as DictKey);
  return t("est.sec.untitled");
}

export function clientRows(option: CustomOption, settings: CustomSettings, t: Tr, shown: OptionalShown): ClientRow[] {
  const act = activeLines(option.lines);
  const show = (l: CustomLine) => !l.optional || shown === "all" || !!l.selected;
  const secs = countedSections(option);
  if (secs.length === 0) {
    const rows: ClientRow[] = [];
    for (const g of LINE_GROUPS) {
      const idx = act.map((l, i) => (l.group === g && show(l) ? i : -1)).filter((i) => i >= 0);
      if (!idx.length) continue;
      rows.push({ type: "group", group: g });
      for (const i of idx) rows.push({ type: "line", i, depth: 0 });
    }
    return rows;
  }
  const known = new Set(secs.map((x) => x.id));
  const inSection = (sid: string) => act.map((l, i) => (sectionIdOk(l.sectionId) && l.sectionId === sid && show(l) ? i : -1)).filter((i) => i >= 0);
  const subs = (top: string) => secs.filter((x) => x.parentId === top);
  const sub = sectionSubtotals(option, settings);
  const rows: ClientRow[] = [];
  for (const top of secs.filter((x) => !x.parentId)) {
    const own = inSection(top.id);
    const children = subs(top.id).map((c) => ({ c, idx: inSection(c.id) })).filter((x) => x.idx.length);
    if (!own.length && !children.length) continue; // nothing of it to show
    rows.push({ type: "section", id: top.id, title: sectionTitle(top, t), depth: 0 });
    for (const i of own) rows.push({ type: "line", i, depth: 0 });
    for (const { c, idx } of children) {
      rows.push({ type: "section", id: c.id, title: sectionTitle(c, t), depth: 1 });
      for (const i of idx) rows.push({ type: "line", i, depth: 1 });
    }
    rows.push({ type: "subtotal", id: top.id, title: sectionTitle(top, t), cents: sub.bySection[top.id] ?? 0 });
  }
  const loose = act.map((l, i) => (show(l) && !(sectionIdOk(l.sectionId) && known.has(l.sectionId)) ? i : -1)).filter((i) => i >= 0);
  if (loose.length) {
    rows.push({ type: "other", title: t("est.client.other") });
    for (const i of loose) rows.push({ type: "line", i, depth: 0 });
  }
  return rows;
}
