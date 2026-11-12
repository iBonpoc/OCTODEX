/**
 * Estimate editor (spec docs/audit/2026-11-12-estimate-editor-spec.md Р3, Р4, Р8): a document as it may be counted and
 * shown — on every way in. A priced line marked hidden is visible again (the founder's #1100: a hidden line never changes
 * the client's total); sections within the limits; a line whose section is not there keeps it (only shown «без раздела»).
 * What leaves for the client (clientDoc), the rows the server keeps (versionRows), a copied option. Test prices.
 */
import { describe, expect, it } from "vitest";
import { SECTIONS_MAX, type CustomLine } from "@octo/estimating-engine";
import { clientDoc, cloneOption, newDoc, normalizeDoc } from "../src/features/estimateDoc";
import { cleanDraft } from "../src/features/estimateDraft";
import { versionRows } from "../src/cloud/estimateRows";
import type { EstimateDoc } from "../src/data/types";

const line = (x: Partial<CustomLine> & { id: string }): CustomLine => ({ name: x.id, group: "labor", quantity: "1", unit: "ea", unitPriceCents: 10000, ...x });
const docOf = (lines: CustomLine[], sections?: NonNullable<EstimateDoc["options"][number]["sections"]>): EstimateDoc => {
  const d = newDoc();
  d.options[0] = { ...d.options[0]!, lines, ...(sections ? { sections } : {}) };
  return d;
};

describe("normalizeDoc", () => {
  it("a priced line marked hidden is visible again (its id for the mark); a hidden $0 stays hidden", () => {
    const d = docOf([line({ id: "a", clientVisible: false }), line({ id: "b", unitPriceCents: 0, clientVisible: false })]);
    const r = normalizeDoc(d);
    expect(r.unhidden).toEqual(["a"]);
    expect(r.doc.options[0]!.lines.map((l) => l.clientVisible)).toEqual([undefined, false]);
    expect(d.options[0]!.lines[0]!.clientVisible).toBe(false); // the given one is not changed
  });
  it("nothing to change: the same document, the same object", () => {
    const d = docOf([line({ id: "a", sectionId: "s1" })], [{ id: "s1", title: "Roof" }]);
    expect(normalizeDoc(d).doc).toBe(d);
  });
  it("sections: the first 40, then a repeated id once (the engine's order); a title cleaned and cut to 60", () => {
    const many = Array.from({ length: SECTIONS_MAX + 2 }, (_, i) => ({ id: i === 1 ? "s0" : `s${i}`, title: `T${i}` }));
    const r = normalizeDoc(docOf([], many)).doc.options[0]!.sections!;
    expect(r).toHaveLength(SECTIONS_MAX - 1); // 40 kept, the repeated s0 once
    expect(r[0]).toEqual({ id: "s0", title: "T0" });
    const t = normalizeDoc(docOf([], [{ id: "x", title: "Roof\u0007\n" + "y".repeat(80) }, { id: "z", title: "   " }])).doc.options[0]!.sections!;
    expect(t[0]!.title).toBe("Roof" + "y".repeat(56));
    expect(t[1]).toEqual({ id: "z" }); // a blank title is no title: the screen says «Раздел N»
  });
  it("a line whose section is not there keeps its sectionId (the data is not rewritten)", () => {
    const d = docOf([line({ id: "a", sectionId: "gone" })], [{ id: "s1" }]);
    expect(normalizeDoc(d).doc.options[0]!.lines[0]!.sectionId).toBe("gone");
  });
});

describe("the ways in and out", () => {
  it("a draft is read normalized", () => {
    const d = docOf([line({ id: "a", clientVisible: false })]);
    const r = cleanDraft({ ctx: "c", at: "2026-11-12", estimateId: "e", doc: d });
    expect(r?.doc.options[0]!.lines[0]!.clientVisible).toBeUndefined();
  });
  it("clientDoc: a hidden $0 line goes whole; a section without its module key; a priced «hidden» line stays (it is visible)", () => {
    const d = docOf([line({ id: "a", unitPriceCents: 0, clientVisible: false }), line({ id: "b", clientVisible: false }), line({ id: "c" })], [{ id: "m", kind: "module", module: "gutters", title: "Gutters" }]);
    const o = clientDoc(d).options[0]!;
    expect(o.lines.map((l) => l.id)).toEqual(["b", "c"]);
    expect(o.sections).toEqual([{ id: "m", kind: "module", title: "Gutters" }]);
  });
  it("versionRows: client_visible false only for a $0 line (the server's check)", () => {
    const d = docOf([line({ id: "a", unitPriceCents: 0, clientVisible: false }), line({ id: "b", clientVisible: false })]);
    expect(versionRows(d).lines.map((l) => l.clientVisible)).toEqual([false, undefined]);
  });
  it("«Добавить вариант» keeps the sections (the lines keep their sectionId)", () => {
    const o = docOf([line({ id: "a", sectionId: "s1" })], [{ id: "s1", title: "Roof" }]).options[0]!;
    const c = cloneOption(o, 1);
    expect(c.sections).toEqual([{ id: "s1", title: "Roof" }]);
    expect(c.sections).not.toBe(o.sections);
    expect(c.lines[0]!.sectionId).toBe("s1");
  });
});
