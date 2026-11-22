/** #2381 Ж1 (review 3): the edits of a deleted estimate are dropped once the store is loaded; the rest stays */
import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
vi.mock("@/cloud/auth", () => ({ useAuth: () => ({}) }));
vi.mock("@/data/store", () => ({ useStore: () => ({}) }));
import { dropOrphanEditDrafts, dropOrphanEdits } from "../src/features/estimateDraftCleanup";

const d = (ctx: string, estimateId: string) => ({ ctx, estimateId });
const mem = (v: Record<string, string>) => {
  const m = new Map(Object.entries(v));
  return { m, s: { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, x: string) => void m.set(k, x) } };
};

describe("unit:estimateDraftCleanup", () => {
  it("drops the edits of estimates not there; keeps a new estimate's draft and a live estimate's edit", () => {
    const list = [d("edit|gone", "gone"), d("edit|e1", "e1"), d("new|||", "x")];
    expect(dropOrphanEdits(list, (id) => id === "e1").map((x) => x.ctx)).toEqual(["edit|e1", "new|||"]);
  });
  it("nothing to drop: the same list (nothing written)", () => {
    const list = [d("edit|e1", "e1")];
    expect(dropOrphanEdits(list, () => true)).toBe(list);
  });
  it("on the device: written only when something goes; a broken list is left as it is", async () => {
    const { m, s } = mem({ k: JSON.stringify([d("edit|gone", "gone"), d("edit|e1", "e1")]), bad: "not json" });
    expect(await dropOrphanEditDrafts("k", (id) => id === "e1", s)).toBe(true);
    expect(JSON.parse(m.get("k")!).map((x: { ctx: string }) => x.ctx)).toEqual(["edit|e1"]);
    expect(await dropOrphanEditDrafts("k", (id) => id === "e1", s)).toBe(false);
    expect(await dropOrphanEditDrafts("bad", () => false, s)).toBe(false);
    expect(m.get("bad")).toBe("not json");
  });
});
