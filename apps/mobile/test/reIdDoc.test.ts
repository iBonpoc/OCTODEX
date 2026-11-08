/** Debt 4 of «Сметы» №1: a sent estimate edited → new ids, and the map new line → sent line (the server copies costs). */
import { describe, expect, it } from "vitest";
import { docForSave, reIdDoc } from "../src/features/estimateDoc";
import type { EstimateDoc } from "../src/data/types";

describe("reIdDoc", () => {
  it("every option and line gets a new id; `from` maps each new line to its sent line; the content stays", () => {
    let n = 0;
    const doc = { options: [{ id: "o1", name: "A", lines: [{ id: "l1", name: "Gutter", unitCostCents: 400 }, { id: "l2", name: "Cap" }] }, { id: "o2", name: "B", lines: [{ id: "l3", name: "Guard" }] }], settings: {} } as unknown as EstimateDoc;
    const r = reIdDoc(doc, () => `n${++n}`);
    const ids = r.doc.options.flatMap((o) => [o.id, ...o.lines.map((l) => l.id)]);
    expect(ids.some((i) => ["o1", "o2", "l1", "l2", "l3"].includes(i))).toBe(false);
    expect(new Set(ids).size).toBe(ids.length);
    const lineIds = r.doc.options.flatMap((o) => o.lines.map((l) => l.id));
    expect(lineIds.map((i) => r.from[i])).toEqual(["l1", "l2", "l3"]);
    expect(Object.keys(r.from)).toHaveLength(3);
    expect(r.doc.options[0]!.lines[0]).toMatchObject({ name: "Gutter", unitCostCents: 400 });
    expect(doc.options[0]!.id).toBe("o1");
  });
  it("docForSave: the map only for a sent estimate — not for a new one or a draft", () => {
    const doc = { options: [{ id: "o1", name: "A", lines: [{ id: "l1", name: "Gutter" }] }], settings: {} } as unknown as EstimateDoc;
    let n = 0;
    const id = () => `n${++n}`;
    for (const st of [undefined, "draft"]) {
      const r = docForSave(st, doc, id);
      expect(r.linesFrom).toBeUndefined();
      expect(r.doc).toBe(doc);
    }
    for (const st of ["sent", "viewed", "declined", "awaiting_countersign"]) {
      const r = docForSave(st, doc, id);
      expect(Object.values(r.linesFrom!)).toEqual(["l1"]);
      expect(r.doc.options[0]!.lines[0]!.id).not.toBe("l1");
    }
  });
});
