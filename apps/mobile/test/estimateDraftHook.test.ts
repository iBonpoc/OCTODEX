/**
 * #859 second review: the drafts hook writes from the cleaned list (a stored [null, good] must not throw), and
 * «Отменить» after the builder is gone puts the draft back straight in storage. React's hooks run in miniReact.
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
import { putDraftBack, removeDraft, useEstimateDrafts, type EstimateDraft } from "../src/features/estimateDraft";
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
  it("putDraftBack: the draft goes back first, the others stay, a broken item or value does not stop it", async () => {
    storage.set(KEY, JSON.stringify([null, draft("other")]));
    await putDraftBack(KEY, draft("back"));
    expect(JSON.parse(storage.get(KEY)!).map((d: EstimateDraft) => d.ctx)).toEqual(["back", "other"]);
    storage.set(KEY, "{broken");
    await putDraftBack(KEY, draft("back"));
    expect(JSON.parse(storage.get(KEY)!).map((d: EstimateDraft) => d.ctx)).toEqual(["back"]);
  });
});
