/**
 * #871 (X-07): a round downspout without elbows of its own gets 45° ones, not «A». The app's panel and the engine say the
 * same default; an estimate made before keeps its lines until «Обновить» (a snapshot), and «Обновить» brings the 45°.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import { computeGutterParts, ENGINE_VERSION, type MeasuredRun, type MeasurementInput, type PartQty } from "@octo/estimating-engine";
import { DS_SHAPES, ELBOW_STYLES, DEFAULT_ELBOWS, elbowsOf } from "../src/modules/gutters/canvas/attrs";
import { linesFromParts, resyncLines } from "../src/modules/gutters/estimate";
import { partName } from "../src/modules/gutters/prices";
import { tFor } from "../src/i18n/translate";

const run = (id: string): MeasuredRun => ({ id, profile: "k" as const, size: "6", material: "alu_032", color: "white", story: 1, hanger: "hidden", ends: [{ kind: "cap" }, { kind: "cap" }], houseSide: "R" as const, lengthIn: 240 });
const job = (shape: "rect" | "round"): MeasurementInput => ({
  runs: [run("1")],
  corners: [],
  downspouts: [{ id: "d", runId: "1", shape, size: shape === "round" ? "3" : "3x4", material: "alu", color: "white", bottom: { kind: "extension" } }],
});
const elbows = (ps: readonly PartQty[]) => ps.filter((p) => p.attrs.part === "elbow");

describe("the panel and the engine say the same default (#871)", () => {
  it("what a downspout with no elbows of its own shows is what the engine counts: style and number", () => {
    for (const shape of DS_SHAPES) {
      const shown = elbowsOf({ shape, elbows: undefined });
      const counted = elbows(computeGutterParts(job(shape)).parts);
      expect(counted).toHaveLength(1);
      expect(counted[0]!.attrs.style).toBe(shown.style);
      expect(Number(counted[0]!.qty)).toBe(shown.qty);
      expect(shown.style).toBe(ELBOW_STYLES[shape][0]);
      expect(shown.qty).toBe(DEFAULT_ELBOWS);
    }
  });
  it("the engine's round default is a style a round downspout offers", () => {
    expect(ELBOW_STYLES.round).toContain(String(elbows(computeGutterParts(job("round")).parts)[0]!.attrs.style));
  });
});

describe("an estimate made before keeps its lines until «Обновить» (snapshot, #871)", () => {
  const name = (p: PartQty) => partName(tFor("en"), p);
  let n = 0;
  const uid = () => `l${++n}`;
  // the parts of an old revision: the round downspout's elbows were «A»
  const fresh = computeGutterParts(job("round")).parts;
  const old = fresh.map((p) => (p.attrs.part === "elbow" ? { ...p, key: p.key.replace("elbow.45.", "elbow.A."), attrs: { ...p.attrs, style: "A" } } : p));
  const lineOf = (ls: { name: string; source?: { key?: string } }[], style: string) => ls.find((l) => l.source?.key?.includes("part=elbow") && l.source.key.includes(`style=${style}`));
  it("the stored lines are plain data: the engine's change does not touch them", () => {
    const stored = linesFromParts(old, [], name, uid, "r1", "m1");
    expect(lineOf(stored, "A")).toBeTruthy();
    expect(lineOf(stored, "45")).toBeUndefined();
    expect(ENGINE_VERSION).toBe("0.1.3");
  });
  it("«Обновить»: the 45° line comes, the «A» line goes, a price set by hand on another line stays", () => {
    const stored = linesFromParts(old, [], name, uid, "r1", "m1").map((l) => (l.source?.key?.includes("part=outlet") ? { ...l, unitPriceCents: 4321 } : l));
    const next = linesFromParts(fresh, [], name, uid, "r2", "m1");
    const after = resyncLines(stored, next);
    expect(lineOf(after, "45")).toBeTruthy();
    expect(lineOf(after, "A")).toBeUndefined();
    expect(after.find((l) => l.source?.key?.includes("part=outlet"))!.unitPriceCents).toBe(4321);
  });
  it("the new line says 45° in the name", () => {
    const l = lineOf(linesFromParts(fresh, [], name, uid, "r2", "m1"), "45")!;
    expect(l.name).toContain("45");
  });
});
