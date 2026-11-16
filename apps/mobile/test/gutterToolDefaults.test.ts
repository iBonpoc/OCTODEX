/**
 * #1563 PR B (spec 33-gutters-canvas-ui «Двойное нажатие на инструмент»; founder 14.11): the properties of NEW gutters and downspouts of one
 * drawing. None set — the company's defaults; set — every new one takes them (its story the one drawn now); what is drawn is not touched;
 * «Как в настройках компании» drops them; the entries of measurements that are gone are pruned.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
const mem = new Map<string, string>();
let writes = 0;
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async (k: string) => mem.get(k) ?? null, setItem: async (k: string, v: string) => { writes++; mem.set(k, v); } } }));
import { MODULE_CHOICES as ch, newDsAttrs, newRunAttrs } from "../src/modules/gutters/settings";
import { adopt, dsFor, loadDefaults, NEW_DEFAULTS_KEY, patchDs, patchRun, prune, pruneStored, putDefaults, readDefaults, resetKind, runFor, storeDefaults, type NewDefaults } from "../src/modules/gutters/canvas/toolDefaults";

describe("new objects of one drawing", () => {
  it("none set: the company's defaults, the story drawn now", () => {
    expect(runFor(ch, 3)).toEqual(newRunAttrs(ch, 3));
    expect(dsFor(ch)).toEqual(newDsAttrs(ch));
  });
  it("a colour set for new gutters: every new one takes it, on the story drawn now; the rest as the company's", () => {
    const nd = patchRun(ch, {}, { color: "brown" });
    const a = runFor(ch, 2, nd);
    expect(a.color).toBe("brown");
    expect(a.story).toBe(2);
    expect(a.size).toBe(newRunAttrs(ch, 2).size);
    expect(runFor(ch, 1, nd).story).toBe(1);
  });
  it("the story is never kept in them (it is the «Эт» button's)", () => {
    const nd = patchRun(ch, {}, { story: 4, size: "6" } as never);
    expect(runFor(ch, 1, nd).story).toBe(1);
    expect(runFor(ch, 1, nd).size).toBe("6");
  });
  it("the same rules as a gutter's own rows: a new profile takes a size it is made in", () => {
    const nd = patchRun(ch, {}, { profile: "half_round" });
    const a = runFor(ch, 1, nd);
    expect(a.profile).toBe("half_round");
    expect(a.size).toBeTruthy();
  });
  it("downspouts on their own: a size for new downspouts does not touch new gutters", () => {
    const nd = patchDs(ch, {}, { size: "3x4" });
    expect(dsFor(ch, nd).size).toBe("3x4");
    expect(runFor(ch, 1, nd)).toEqual(newRunAttrs(ch, 1));
  });
  it("«Как в настройках компании»: that kind goes back to the company's, the other stays", () => {
    let nd: NewDefaults = patchRun(ch, {}, { color: "brown" });
    nd = patchDs(ch, nd, { size: "3x4" });
    nd = resetKind(nd, "run");
    expect(runFor(ch, 1, nd)).toEqual(newRunAttrs(ch, 1));
    expect(dsFor(ch, nd).size).toBe("3x4");
  });
  it("per measurement: an empty entry is removed, the others kept; measurements that are gone are pruned", () => {
    const one = patchRun(ch, {}, { color: "brown" });
    let map = putDefaults({}, "m1", one);
    map = putDefaults(map, "m2", patchDs(ch, {}, { size: "3x4" }));
    expect(Object.keys(map).sort()).toEqual(["m1", "m2"]);
    expect(Object.keys(putDefaults(map, "m1", {}))).toEqual(["m2"]);
    expect(Object.keys(prune(map, new Set(["m2"])))).toEqual(["m2"]);
    expect(prune(map, new Set(["m1", "m2"]))).toBe(map); // nothing gone: the same map (no write)
  });
});

describe("kept on the phone (code-reviewer #1563 PR B)", () => {
  const brown = patchRun(ch, {}, { color: "brown" });
  it("putDefaults: nothing changed — the same map (no write)", () => {
    const map = putDefaults({}, "m1", brown);
    expect(putDefaults(map, "m1", patchRun(ch, {}, { color: "brown" }))).toBe(map);
    expect(putDefaults({}, "m1", {})).toEqual({});
  });
  it("adopt: a choice made before the read wins and is written; none — the stored one, nothing written", () => {
    expect(adopt(brown, patchDs(ch, {}, { size: "3x4" }))).toEqual({ nd: brown, write: true });
    expect(adopt({}, brown)).toEqual({ nd: brown, write: false });
    expect(adopt({}, undefined)).toEqual({ nd: {}, write: false });
  });
  it("two drawing screens write their own entries: neither is lost (every write re-reads the map)", async () => {
    mem.clear();
    await Promise.all([storeDefaults("A", brown), storeDefaults("B", patchDs(ch, {}, { size: "3x4" }))]);
    expect(Object.keys(await loadDefaults()).sort()).toEqual(["A", "B"]);
    expect((await readDefaults("A"))?.run?.color).toBe("brown");
  });
  it("an empty choice removes the entry; writing the same again writes nothing", async () => {
    mem.clear();
    await storeDefaults("A", brown);
    const n = writes;
    await storeDefaults("A", patchRun(ch, {}, { color: "brown" }));
    expect(writes).toBe(n);
    await storeDefaults("A", {});
    expect(await loadDefaults()).toEqual({});
  });
  it("prune keeps the open measurement and the live ones, drops the rest", async () => {
    mem.clear();
    mem.set(NEW_DEFAULTS_KEY, JSON.stringify({ open: brown, live: brown, gone: brown }));
    await pruneStored(new Set(["open", "live"]));
    expect(Object.keys(await loadDefaults()).sort()).toEqual(["live", "open"]);
  });
});
