import { describe, it, expect } from "vitest";
import { computeGutterParts, type MeasuredRun, type MeasuredDownspout, type PartQty } from "../src/gutterParts.js";
import { DEFAULT_GUARD_KITS, DEFAULT_HANGER_KITS, DEFAULT_SPIKE_LENGTH_IN } from "../src/gutterKits.js";

/**
 * docs/specs/33-gutters-parts.md П18.15 — the supplier's list (VGS) against the engine, without any price or brand:
 * spike length by gutter size, the kits' wood screw and anchor, speed-screw hidden hangers, a lock-on guard,
 * sealant by the joint's color. Every case fails before V1.
 */
const run = (o: Partial<MeasuredRun> & { id: string; lengthIn: number }): MeasuredRun => ({
  profile: "k", size: "6", material: "alu_032", color: "white", story: 1, hanger: "hidden",
  ends: [{ kind: "cap" }, { kind: "cap" }], houseSide: "R", ...o,
});
const ds = (o: Partial<MeasuredDownspout> & { id: string; runId: string }): MeasuredDownspout => ({
  shape: "rect", size: "3x4", material: "alu", color: "white", bottom: { kind: "extension" }, ...o,
});
const one = (r: Partial<MeasuredRun>, d: Partial<MeasuredDownspout>[] = [], over?: Parameters<typeof computeGutterParts>[1]) =>
  computeGutterParts({ runs: [run({ id: "1", lengthIn: 480, ...r })], corners: [], downspouts: d.map((x, i) => ds({ id: `d${i}`, runId: "1", ...x })) }, over);
const find = (parts: PartQty[], f: (p: PartQty) => boolean) => parts.filter(f);
const part = (parts: PartQty[], name: string) => find(parts, (p) => p.attrs.part === name);

describe("spike length by gutter size (a company setting, «проверить»)", () => {
  it("defaults: K 5″ → 7″, 6″ → 8″, 7″ → 9″; the length is an attribute and a key segment", () => {
    for (const [size, len] of [["5", "7"], ["6", "8"], ["7", "9"]]) {
      const s = part(one({ size, hanger: "spike" }).parts, "spike");
      expect(s.map((p) => [p.attrs.lengthIn, p.qty])).toEqual([[len, "20"]]);
      expect(s[0]!.key).toBe(`spike.${len}.aluminum.k.${size}`);
    }
    expect(DEFAULT_SPIKE_LENGTH_IN["8"]).toBe("10");
  });
  it("the company's table wins; a size not in it has no length (the old key)", () => {
    expect(part(one({ size: "6", hanger: "spike" }, [], { kitLengthIn: { spike: { "6": "7.5" } } }).parts, "spike")[0]!.attrs.lengthIn).toBe("7.5");
    const none = part(one({ size: "6", hanger: "spike" }, [], { kitLengthIn: { spike: {} } }).parts, "spike")[0]!;
    expect(none.attrs.lengthIn).toBeUndefined();
    expect(none.key).toBe("spike.aluminum.k.6");
  });
  it("ferrules have no length", () => {
    expect(part(one({ hanger: "spike" }).parts, "ferrule").every((p) => p.attrs.lengthIn === undefined)).toBe(true);
  });
});

describe("the kits' wood screw and anchor (company choice)", () => {
  it("default #10 × 1½″, no washer; masonry anchor of any size", () => {
    const { parts } = one({}, [{ wall: "stucco" }]);
    expect(part(parts, "screw").filter((p) => p.attrs.screw === "10x1.5").map((p) => [p.key, p.attrs.washer])).toEqual([["screw.10x15", undefined]]);
    expect(part(parts, "anchor").map((p) => p.attrs.anchor)).toEqual(["masonry"]);
  });
  it("#10 × 2″ with a washer and a ¼ × 1 anchor: every kit's wood screw follows; #8 screws do not", () => {
    const { parts } = one({ hanger: "fascia_strap" }, [{ wall: "stucco" }], { woodScrew: { screw: "10x2", washer: true }, anchor: "1/4x1" });
    const screws = part(parts, "screw");
    expect(screws.some((p) => p.attrs.screw === "10x1.5")).toBe(false);
    const wood = screws.filter((p) => p.attrs.screw === "10x2");
    expect(wood.length).toBe(1);
    expect(wood[0]!.attrs.washer).toBe("washer");
    expect(Number(wood[0]!.qty)).toBe(20 * 2 + 2 * 2 + 0); // 20 straps × 2 + the wall straps' 2 × 2
    expect(screws.find((p) => p.attrs.screw === "8x0.5")!.attrs.washer).toBeUndefined();
    expect(part(parts, "anchor").map((p) => p.attrs.anchor)).toEqual(["1/4x1"]);
  });
  it("a blank choice keeps the default", () => {
    const { parts } = one({ hanger: "fascia_strap" }, [], { woodScrew: { screw: " ", washer: false }, anchor: "" });
    expect(part(parts, "screw").map((p) => p.attrs.screw)).toEqual(["10x1.5"]);
  });
});

describe("speed-screw hidden hangers and the lock-on guard", () => {
  it("hidden_speed and hidden_speed_clip are their own price items", () => {
    expect(Object.keys(DEFAULT_HANGER_KITS)).toEqual(expect.arrayContaining(["hidden_speed", "hidden_speed_clip"]));
    for (const id of ["hidden_speed", "hidden_speed_clip"]) expect(part(one({ hanger: id }).parts, "hanger").map((p) => [p.attrs.hanger, p.qty])).toEqual([[id, "20"]]);
  });
  it("lock_screen: 4 ft pieces, 2 screws a piece", () => {
    expect(DEFAULT_GUARD_KITS.lock_screen!.pieceIn).toBe(48);
    const { parts } = one({ guardsIn: 480, guardType: "lock_screen" });
    expect(find(parts, (p) => p.key === "guardpiece.lock_screen.k.6").map((p) => p.qty)).toEqual(["10"]);
    expect(find(parts, (p) => p.key === "guard.lock_screen.k.6").map((p) => p.qty)).toEqual(["40"]);
    expect(part(parts, "screw").find((p) => p.attrs.screw === "8x0.5")!.qty).toBe("20");
  });
});

describe("sealant by the joint's color", () => {
  it("two painted colors → a tube line each; mill → plain sealant", () => {
    const input = {
      runs: [run({ id: "1", lengthIn: 120 }), run({ id: "2", lengthIn: 120, color: "brown" }), run({ id: "3", lengthIn: 120, color: undefined, material: "aluminum", finish: "mill" as const })],
      corners: [],
      downspouts: [],
    };
    const s = part(computeGutterParts(input, { sealantByColor: true }).parts, "sealant").map((p) => [p.key, p.attrs.color, p.qty]);
    expect(s).toEqual([["sealant", undefined, "1"], ["sealant.brown", "brown", "1"], ["sealant.white", "white", "1"]]);
  });
  it("off by default: one plain sealant (an item priced before keeps its price)", () => {
    const { parts } = one({ color: "brown" });
    expect(part(parts, "sealant").map((p) => [p.key, p.attrs.color])).toEqual([["sealant", undefined]]);
  });
  it("tubes round up per color; the company may keep one plain sealant", () => {
    const runs = [0, 1, 2, 3, 4].map((i) => run({ id: `r${i}`, lengthIn: 120, color: i % 2 ? "brown" : "white" }));
    // 10 caps: white 6 points, brown 4 points — 8 a tube → 1 + 1; one plain line: 10 → 2
    expect(part(computeGutterParts({ runs, corners: [], downspouts: [] }, { sealantByColor: true }).parts, "sealant").map((p) => [p.key, p.qty])).toEqual([["sealant.brown", "1"], ["sealant.white", "1"]]);
    expect(part(computeGutterParts({ runs, corners: [], downspouts: [] }, { sealantByColor: false }).parts, "sealant").map((p) => [p.key, p.qty])).toEqual([["sealant", "2"]]);
  });
});
