/** Свой размер желоба и водостока (#2981): целые дюймы; держится, пока профиль / форма те же; в смете — «нет цены», сумма не врёт. */
import { describe, expect, it } from "vitest";
import { computeGutterParts } from "@octo/estimating-engine";
import type { CatalogItem } from "../src/data/types";
import { changeDs, changeRun } from "../src/modules/gutters/canvas/attrs";
import { DEFAULT_DS_ATTRS, DEFAULT_RUN_ATTRS } from "../src/modules/gutters/canvas/model";
import { isOwnDsSize, isOwnRunSize, readOwnDsSize, readOwnRunSize } from "../src/modules/gutters/canvas/ownSize";
import { linesFromParts, noPriceLines } from "../src/modules/gutters/estimate";
import { laborRows, materialRows, missingItems, sampleJob } from "../src/modules/gutters/prices";

describe("С3 (spec 33-windows #2978): reading a size of its own", () => {
  it("gutter: whole inches 3–12", () => {
    expect(readOwnRunSize("9")).toBe("9");
    expect(readOwnRunSize(" 10″ ")).toBe("10");
    for (const bad of ["", "2", "13", "5.5", "abc", "05x"]) expect(readOwnRunSize(bad)).toBeNull();
  });
  it("rectangular downspout: A x B, 1–8 each; round: 2–8", () => {
    expect(readOwnDsSize("rect", "3x5")).toBe("3x5");
    expect(readOwnDsSize("rect", "3 × 5")).toBe("3x5");
    expect(readOwnDsSize("rect", "3 X 5″")).toBe("3x5");
    for (const bad of ["3", "0x4", "9x2", "3.5x4", "x4"]) expect(readOwnDsSize("rect", bad)).toBeNull();
    expect(readOwnDsSize("round", "5")).toBe("5");
    for (const bad of ["1", "9", "3x4"]) expect(readOwnDsSize("round", bad)).toBeNull();
  });
  it("stored sizes read back as themselves (no point in the price key)", () => {
    expect(isOwnRunSize("9")).toBe(true);
    expect(isOwnRunSize("5.5")).toBe(false);
    expect(isOwnDsSize("rect", "3x5")).toBe(true);
    expect(isOwnDsSize("round", "3x5")).toBe(false);
  });
});

describe("С3: a size of its own in the attributes", () => {
  it("a gutter keeps it while the profile stays; a new profile puts a size of the list", () => {
    const a = changeRun({ ...DEFAULT_RUN_ATTRS }, { size: "9" });
    expect(a.size).toBe("9");
    expect(changeRun(a, { material: "steel" }).size).toBe("9");
    expect(changeRun(a, { profile: "half_round" }).size).toBe("5");
    expect(changeRun({ ...DEFAULT_RUN_ATTRS }, { size: "5.5" }).size).toBe("5"); // no size: the list's
  });
  it("a downspout keeps it while the shape stays", () => {
    const d = changeDs({ ...DEFAULT_DS_ATTRS }, { size: "3x5" });
    expect(d.size).toBe("3x5");
    expect(changeDs(d, { dsStyle: "corrugated" }).size).toBe("3x5");
    expect(changeDs(d, { shape: "round" }).size).toBe("3");
  });
});

describe("С3: a size of its own in the estimate (answer in #2981: not in the price list — $0, «нет цены»)", () => {
  const C = "11111111-1111-4111-8111-111111111111";
  const name = (p: { key: string; attrs: Record<string, string> }) => `${p.attrs.part ?? p.attrs.work ?? p.key}`;
  let n = 0;
  const uid = () => `o${++n}`;
  // the price list of the sample, at real prices: every part of the module's sizes is priced
  const list: CatalogItem[] = missingItems(C, [...materialRows({}), ...laborRows()], [], name).map((it) => ({ ...it, placeholder: false, priceCents: 1000, ...(it.kind === "material" ? { costCents: 800 } : {}) }));
  it("the parts of the custom size go out as «нет цены» lines at $0; the rest keep their prices", () => {
    const job = sampleJob({});
    const own = { ...job, runs: job.runs.map((r) => ({ ...r, size: "9" })), corners: job.corners.map((c) => ({ ...c, size: "9" })) };
    const base = linesFromParts(computeGutterParts(job).parts, list, name, uid);
    expect(noPriceLines(base)).toEqual([]);
    const parts = computeGutterParts(own).parts;
    const g = parts.filter((p) => p.attrs.size === "9" && p.attrs.part !== undefined);
    expect(g.length).toBeGreaterThan(0); // the engine counts them as for any size
    const lines = linesFromParts(parts, list, name, uid);
    const none = noPriceLines(lines);
    expect(none.length).toBeGreaterThan(0);
    expect(none.every((l) => l.unitPriceCents === 0)).toBe(true);
    // a part of no size (labor, the downspout) keeps its price: the sum is the priced lines, never a wrong price
    expect(lines.some((l) => l.unitPriceCents === 1000)).toBe(true);
  });
  it("a downspout of its own size: its pipe is «нет цены»", () => {
    const job = sampleJob({});
    const own = { ...job, downspouts: job.downspouts.map((d) => ({ ...d, size: "3x5" })) };
    const parts = computeGutterParts(own).parts;
    expect(parts.some((p) => p.attrs.size === "3x5")).toBe(true);
    const lines = linesFromParts(parts, list, name, uid);
    expect(noPriceLines(lines).length).toBeGreaterThan(0);
  });
});
