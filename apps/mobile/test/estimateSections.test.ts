/**
 * unit:estimateSections — an estimate with sections sends the same money as without them (#1241, review: «без 22023»).
 * The server signs and sends by the lines' sums (estimate_total_mismatch, 22023): sections are only a way to show them, so the
 * total of an option is the same with the sections, laid out by kind, deleted, or undone — and the document keeps them.
 */
import { describe, expect, it } from "vitest";
import type { CustomLine, CustomOption } from "@octo/estimating-engine";
import { newDoc, normalizeDoc, optionTotals } from "../src/features/estimateDoc";
import type { EstimateDoc } from "../src/data/types";
import { addSection, deleteSection, layoutByKind, layoutUndo, moveLine } from "../src/features/sectionLayout";

const L = (id: string, group: CustomLine["group"], cents: number, over: Partial<CustomLine> = {}): CustomLine => ({ id, name: id, group, quantity: "2", unit: "ea", unitPriceCents: cents, ...over });
const base = (): CustomOption => ({ id: "o", name: "Good", lines: [L("a", "material", 1050), L("b", "labor", 2500), L("c", "service", 999)] });
const docWith = (o: CustomOption): EstimateDoc => ({ ...newDoc(), options: [o] });

describe("unit:estimateSections — the money does not depend on the sections", () => {
  it("the total is the same with sections, laid out, a line moved, a section deleted, and after «Вернуть»", () => {
    const o = base();
    const d = docWith(o);
    const total = optionTotals(d, o).total;
    const laid = layoutByKind(o)!;
    expect(optionTotals(docWith(laid), laid).total).toBe(total);
    const a = addSection(laid, { title: "Двор" }, () => "Y")!.option;
    const moved = (moveLine(a, "a", { sectionId: "Y" }) as { option: CustomOption }).option;
    expect(optionTotals(docWith(moved), moved).total).toBe(total);
    const gone = deleteSection(moved, "Y");
    expect(optionTotals(docWith(gone), gone).total).toBe(total);
    const back = layoutUndo(moved, gone)(gone);
    expect(optionTotals(docWith(back), back).total).toBe(total);
  });
  it("the document read back keeps the sections and the lines' places (nothing is dropped on the way to the server)", () => {
    const laid = layoutByKind(base())!;
    const d = normalizeDoc(docWith(laid)).doc;
    expect(d.options[0]!.sections?.length).toBe(laid.sections!.length);
    expect(d.options[0]!.lines.map((l) => l.sectionId)).toEqual(laid.lines.map((l) => l.sectionId));
    expect(JSON.parse(JSON.stringify(d)).options[0].sections).toEqual(JSON.parse(JSON.stringify(laid.sections)));
  });
});
