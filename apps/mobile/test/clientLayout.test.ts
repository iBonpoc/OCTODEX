/**
 * unit:clientLayout — what the client sees (PDF and /p/, РС-7b, spec §5): sections with their lines, subsections and subtotals, «Other
 * items», add-ons in their own place, the dictionary's words in the CLIENT's language, the money the engine's.
 */
import { describe, expect, it } from "vitest";
import type { CustomLine, CustomOption } from "@octo/estimating-engine";
import { computeCustomOption, DEFAULT_TAX } from "@octo/estimating-engine";
import { clientRows, sectionTitle } from "../src/features/clientLayout";
import { translate } from "../src/i18n/translate";

const L = (id: string, group: CustomLine["group"], cents: number, over: Partial<CustomLine> = {}): CustomLine => ({ id, name: id, group, quantity: "1", unit: "ea", unitPriceCents: cents, ...over });
const S = { discount: null, tax: { ...DEFAULT_TAX }, deposit: { kind: "none" as const } };
const en = (k: never, p?: Record<string, string | number>) => translate("en", k, p);
const es = (k: never, p?: Record<string, string | number>) => translate("es", k, p);
const tag = (rows: ReturnType<typeof clientRows>) =>
  rows.map((r) => (r.type === "line" ? `l${r.i}${r.depth ? "'" : ""}` : r.type === "section" ? `S:${r.title}${r.depth ? "'" : ""}` : r.type === "subtotal" ? `Σ${r.title}=${r.cents}` : r.type === "other" ? `O:${r.title}` : `G:${r.group}`));

describe("unit:clientLayout — no sections: the lines by kind, as before", () => {
  it("kinds in the order of the engine; an add-on in its kind, shown only if chosen (PDF) or always (page)", () => {
    const o: CustomOption = { id: "o", name: "Good", lines: [L("a", "labor", 100), L("b", "material", 200), L("c", "material", 300, { optional: true })] };
    expect(tag(clientRows(o, S, en as never, "all"))).toEqual(["G:labor", "l0", "G:material", "l1", "l2"]);
    expect(tag(clientRows(o, S, en as never, "selected"))).toEqual(["G:labor", "l0", "G:material", "l1"]);
    expect(tag(clientRows({ ...o, lines: o.lines.map((l) => (l.id === "c" ? { ...l, selected: true } : l)) }, S, en as never, "selected"))).toEqual(["G:labor", "l0", "G:material", "l1", "l2"]);
  });
});

describe("unit:clientLayout — sections", () => {
  const o: CustomOption = {
    id: "o", name: "Good",
    sections: [{ id: "R", title: "Roof" }, { id: "RM", kind: "material", parentId: "R" }, { id: "RL", kind: "labor", parentId: "R" }, { id: "Y", title: "Yard" }],
    lines: [
      L("g", "material", 10000, { sectionId: "RM" }),
      L("d", "material", 4000, { sectionId: "RM", optional: true }),
      L("i", "labor", 9000, { sectionId: "RL" }),
      L("own", "service", 1000, { sectionId: "R" }),
      L("y", "service", 5000, { sectionId: "Y" }),
      L("z", "service", 700),
    ],
  };
  it("each top section: its heading, own lines, subsections, then the subtotal; «Other items» last", () => {
    const r = tag(clientRows(o, S, en as never, "selected"));
    expect(r).toEqual(["S:Roof", "l3", "S:Materials'", "l0'", "S:Labor'", "l2'", "ΣRoof=20000", "S:Yard", "l4", "ΣYard=5000", "O:Other items", "l5"]);
  });
  it("an add-on stands in its own section; chosen it counts in the subtotal, unchosen it does not (the engine's)", () => {
    const withAddon = tag(clientRows(o, S, en as never, "all"));
    expect(withAddon).toContain("l1'");
    expect(withAddon.indexOf("l1'")).toBeGreaterThan(withAddon.indexOf("S:Materials'"));
    expect(withAddon.find((x) => x.startsWith("ΣRoof"))).toBe("ΣRoof=20000");
    const chosen = { ...o, lines: o.lines.map((l) => (l.id === "d" ? { ...l, selected: true } : l)) };
    expect(tag(clientRows(chosen, S, en as never, "selected")).find((x) => x.startsWith("ΣRoof"))).toBe("ΣRoof=24000");
  });
  it("Σ of the subtotals and the other items = the option's subtotal (the sections change no money)", () => {
    const rows = clientRows(o, S, en as never, "selected");
    const sum = rows.filter((r): r is Extract<typeof r, { type: "subtotal" }> => r.type === "subtotal").reduce((a, r) => a + r.cents, 0) + 700;
    expect(sum).toBe(computeCustomOption(o, S).subtotal);
  });
  it("the words are the CLIENT's language: the kind's name from the dictionary, own titles as written", () => {
    const rEs = tag(clientRows(o, S, es as never, "selected"));
    expect(rEs).toContain("S:Materiales'");
    expect(rEs).toContain("S:Roof"); // the person's title — as they typed it
    expect(rEs.some((x) => x.startsWith("O:Otros"))).toBe(true);
    expect(translate("en", "est.client.subtotal" as never, { title: "Roof" })).toBe("Roof subtotal");
  });
  it("a section with nothing to show is left out; a title is trimmed; no title and no kind: «Untitled»", () => {
    const empty: CustomOption = { id: "o", name: "x", sections: [{ id: "A", title: "Empty" }, { id: "B", title: "  Spaced  " }, { id: "C" }], lines: [L("b", "service", 100, { sectionId: "B" }), L("c", "service", 100, { sectionId: "C" })] };
    expect(tag(clientRows(empty, S, en as never, "selected"))).toEqual(["S:Spaced", "l0", "ΣSpaced=100", "S:Untitled", "l1", "ΣUntitled=100"]);
    expect(sectionTitle({ id: "x", kind: "module", title: "Gutters (по замеру)" }, en as never)).toBe("Gutters (по замеру)");
  });
  it("a line whose section is not there (an older clone, past the limit) is «Other items»", () => {
    const orphan: CustomOption = { id: "o", name: "x", sections: [{ id: "A", title: "A" }], lines: [L("a", "service", 100, { sectionId: "A" }), L("lost", "service", 100, { sectionId: "gone" })] };
    expect(tag(clientRows(orphan, S, en as never, "selected"))).toEqual(["S:A", "l0", "ΣA=100", "O:Other items", "l1"]);
  });
});
