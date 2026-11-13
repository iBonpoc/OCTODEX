import { describe, expect, it } from "vitest";
import { DEFAULT_TAX, computeCustomOption, type CustomLine, type CustomOption } from "@octo/estimating-engine";
import type { EstimateDoc } from "@/data/types";
import { newDoc } from "@/features/estimateDoc";
import { appendTemplate, fromTemplate, removeAppended } from "@/features/estimateTemplate";

// «Из шаблона…» / «Добавить из шаблона…» (DS §8.13, spec 39 §11.9): only adds; the tax never comes; «Вернуть» takes out only what came
const line = (o: Partial<CustomLine> & { id: string }): CustomLine => ({ name: o.id, group: "material", quantity: "1", unit: "ea", unitPriceCents: 1000, ...o });
const opt = (id: string, name: string, over: Partial<CustomOption> = {}): CustomOption => ({ id, name, lines: [], ...over });
const taxed = { ...newDoc().settings, tax: { enabled: true, rateBps: 1025, groups: { service: true, labor: true, material: true } } };
const tpl = (options: CustomOption[], note?: string): EstimateDoc => ({ options, settings: taxed, ...(note ? { note } : {}) });

describe("an estimate from a template: no tax (К1: the client's total)", () => {
  it("a template with a 10.25 % tax → a new estimate without tax, the client's total = the sum of the lines", () => {
    const t = tpl([opt("o", "Good", { lines: [line({ id: "a", unitPriceCents: 12000 }), line({ id: "b", quantity: "2", unitPriceCents: 4550 })] })]);
    const { doc } = fromTemplate(t, [], {}, false);
    expect(doc.settings.tax.enabled).toBe(false);
    const got = computeCustomOption(doc.options[0]!, doc.settings);
    expect(got.tax).toBe(0);
    expect(got.total).toBe(12000 + 2 * 4550);
    // with the template's tax it would have been more — that is what no longer reaches the client
    expect(computeCustomOption(doc.options[0]!, taxed).total).toBeGreaterThan(got.total);
  });
  it("the template keeps its own tax (the template itself is not changed)", () => {
    const t = tpl([opt("o", "Good", { lines: [line({ id: "a" })] })]);
    fromTemplate(t, [], {}, false);
    expect(t.settings.tax.enabled).toBe(true);
  });
  it("adding a template to a typed estimate: the estimate's own tax and discount stay", () => {
    const doc: EstimateDoc = { ...newDoc(), settings: { ...newDoc().settings, tax: DEFAULT_TAX } };
    doc.options[0] = { ...doc.options[0]!, lines: [line({ id: "x" })] };
    const add = fromTemplate(tpl([opt("o", "Good", { lines: [line({ id: "a" })] })]), [], {}, false).doc;
    expect(appendTemplate(doc, add, 0).doc.settings).toBe(doc.settings);
  });
});

describe("«Добавить из шаблона…»: only adds", () => {
  const typed = (): EstimateDoc => {
    const d = newDoc();
    d.options[0] = { ...d.options[0]!, lines: [line({ id: "x", sectionId: "s0" })], sections: [{ id: "s0", title: "Mine" }] };
    return d;
  };
  it("one option in the template: its lines at the end of the option being edited; its sections under new ids", () => {
    const d = typed();
    d.options.push(opt("o2", "Better", { lines: [line({ id: "y" })] }));
    const add = fromTemplate(tpl([opt("t", "Good", { sections: [{ id: "s0", title: "Roof" }], lines: [line({ id: "a", sectionId: "s0" }), line({ id: "b" })] })]), [], {}, false).doc;
    const r = appendTemplate(d, add, 1);
    const better = r.doc.options[1]!;
    expect(better.lines.map((l) => l.id).slice(0, 1)).toEqual(["y"]);
    expect(better.lines).toHaveLength(3);
    expect(r.doc.options[0]).toBe(d.options[0]);
    // the template's section «s0» does not clash with the estimate's «s0»: a new id, the line follows it
    const roof = better.sections!.find((x) => x.title === "Roof")!;
    expect(roof.id).not.toBe("s0");
    expect(better.lines[1]!.sectionId).toBe(roof.id);
    expect(r.added.chain).toEqual([better.lines[1]!.id, better.lines[2]!.id]);
    // the lines keep fromTemplate's ids («проверьте цену» points at them)
    expect(better.lines.slice(1).map((l) => l.id)).toEqual(add.options[0]!.lines.map((l) => l.id));
  });
  it("the same template twice: no id is repeated", () => {
    const t = tpl([opt("t", "Good", { sections: [{ id: "s1", title: "Roof" }], lines: [line({ id: "a", sectionId: "s1" })] })]);
    const once = appendTemplate(typed(), fromTemplate(t, [], {}, false).doc, 0).doc;
    const twice = appendTemplate(once, fromTemplate(t, [], {}, false).doc, 0).doc;
    const o = twice.options[0]!;
    expect(new Set(o.lines.map((l) => l.id)).size).toBe(o.lines.length);
    expect(new Set(o.sections!.map((x) => x.id)).size).toBe(o.sections!.length);
  });
  it("several options: by number; those past the estimate's become options while fewer than three; the rest are named", () => {
    const four = [0, 1, 2, 3].map((i) => opt(`t${i}`, ["Good", "Better", "Best", "Extra"][i]!, { lines: [line({ id: `l${i}` })] }));
    const add = fromTemplate(tpl(four), [], {}, false).doc;
    const r = appendTemplate(typed(), add, 0);
    expect(r.doc.options.map((o) => o.name)).toEqual(["Good", "Better", "Best"]);
    expect(r.doc.options[0]!.lines).toHaveLength(2);
    expect(r.added.optionIds).toHaveLength(2);
    expect(r.added.skipped).toEqual(["Extra"]);
  });
  it("a new option whose name is taken gets the next free one", () => {
    const d = typed();
    d.options[0] = { ...d.options[0]!, name: "Better" };
    const add = fromTemplate(tpl([opt("a", "Good", { lines: [line({ id: "1" })] }), opt("b", "Better", { lines: [line({ id: "2" })] })]), [], {}, false).doc;
    expect(appendTemplate(d, add, 0).doc.options.map((o) => o.name)).toEqual(["Better", "Good"]);
  });
  it("the note: the template's only where the estimate's is empty — what is typed stays", () => {
    const add = fromTemplate(tpl([opt("t", "Good", { lines: [line({ id: "a" })] })], "Template note"), [], {}, false).doc;
    expect(appendTemplate(typed(), add, 0).doc.note).toBe("Template note");
    expect(appendTemplate({ ...typed(), note: "Mine" }, add, 0).doc.note).toBe("Mine");
  });
});

describe("«Вернуть»: only what came", () => {
  it("the arrived lines, sections and options go; an edit made since stays", () => {
    const d = newDoc();
    d.options[0] = { ...d.options[0]!, lines: [line({ id: "x" })] };
    const add = fromTemplate(tpl([opt("a", "Good", { sections: [{ id: "s", title: "Roof" }], lines: [line({ id: "1", sectionId: "s" })] }), opt("b", "Better", { lines: [line({ id: "2" })] })]), [], {}, false).doc;
    const r = appendTemplate(d, add, 0);
    // an edit after the add: the price of the typed line
    const edited: EstimateDoc = { ...r.doc, options: r.doc.options.map((o, i) => (i === 0 ? { ...o, lines: o.lines.map((l) => (l.id === "x" ? { ...l, unitPriceCents: 777 } : l)) } : o)) };
    const back = removeAppended(edited, r.added);
    expect(back.options).toHaveLength(1);
    expect(back.options[0]!.lines.map((l) => [l.id, l.unitPriceCents])).toEqual([["x", 777]]);
    expect(back.options[0]!.sections ?? []).toEqual([]);
  });
});
