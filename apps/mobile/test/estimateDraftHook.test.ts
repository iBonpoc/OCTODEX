/**
 * #859 second review: the drafts hook writes from the cleaned list (a stored [null, good] must not throw). React's hooks
 * run in miniReact.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", () => import("./support/miniReact"));
const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
    removeItem: async (k: string) => void storage.delete(k),
  },
}));
import { render, settle } from "./support/miniReact";
import { removeDraft, useEstimateDrafts, type EstimateDraft } from "../src/features/estimateDraft";
import { newDoc } from "../src/features/estimateDoc";

const KEY = "octo.drafts.v1.demo";
const draft = (ctx: string): EstimateDraft => {
  const doc = newDoc();
  doc.options[0]!.lines.push({ id: "l1", name: "Gutter clean", group: "service", quantity: "1", unit: "ea", unitPriceCents: 15000 });
  return { ctx, at: new Date().toISOString(), estimateId: `e-${ctx}`, title: "", doc, checkPrice: [] };
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
beforeEach(() => storage.clear());

describe("unit:estimateDraftHook — second review of #859", () => {
  it("a stored [null, good]: the list shows the good one and a write does not throw (it starts from the cleaned list)", async () => {
    storage.set(KEY, JSON.stringify([null, draft("good"), draft("other")]));
    type Out = ReturnType<typeof useEstimateDrafts>;
    const root = render(({ k }: { k: string }) => useEstimateDrafts(k), { k: KEY });
    await settle();
    expect((root.out as Out).list.map((d) => d.ctx)).toEqual(["good", "other"]);
    (root.out as Out).setList((list) => removeDraft(list, "good"), KEY); // before: x.ctx of null → TypeError
    await settle();
    await wait(300);
    expect(JSON.parse(storage.get(KEY)!).map((d: EstimateDraft) => d.ctx)).toEqual(["other"]);
    root.unmount();
  });
});
