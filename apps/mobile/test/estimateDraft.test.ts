/**
 * #760 (audit Q-01): the estimate being built is kept on the phone. The pure rules of the draft list; the screen —
 * e2e 246-estimate-draft.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
import { DRAFT_DAYS, MAX_DRAFTS, draftCtx, draftWorthKeeping, draftsKey, findDraft, removeDraft, upsertDraft, type EstimateDraft } from "../src/features/estimateDraft";
import { newDoc } from "../src/features/estimateDoc";
import { isDeviceKey } from "../src/features/deleteAccount";
import type { EstimateDoc } from "../src/data/types";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const withLine = (): EstimateDoc => {
  const d = newDoc();
  d.options[0]!.lines.push({ id: "l1", name: "Gutter clean", group: "service", quantity: "1", unit: "ea", unitPriceCents: 15000 });
  return d;
};
const draft = (ctx: string, over: Partial<EstimateDraft> = {}): EstimateDraft => ({
  ctx, at: new Date(NOW).toISOString(), estimateId: `e-${ctx}`, title: "", doc: withLine(), checkPrice: [], ...over,
});
const none = () => false;

describe("unit:estimateDraft — where a draft belongs", () => {
  it("a new estimate has a place; a saved one's edit and a template's lines have none", () => {
    expect(draftCtx({ customerId: "c1", propertyId: "p1" })).toBe("new||c1|p1|");
    expect(draftCtx({ leadId: "l1" })).toBe("new|l1|||");
    expect(draftCtx({})).toBe("new||||");
    expect(draftCtx({ id: "e1" })).toBeNull();
    expect(draftCtx({ editTemplate: "t1" })).toBeNull();
  });
  it("one list per person and company; the demo has its own; all are wiped with the account", () => {
    expect(draftsKey(true, "co1", "u1")).toBe("octo.drafts.v1.co1.u1");
    expect(draftsKey(true, "co1", "u2")).not.toBe(draftsKey(true, "co1", "u1"));
    expect(draftsKey(false, "co1", "u1")).toBe("octo.drafts.v1.demo");
    expect(isDeviceKey(draftsKey(true, "co1", "u1"))).toBe(true);
  });
  it("worth keeping: a line or a title; an untouched builder is not", () => {
    expect(draftWorthKeeping({ doc: newDoc(), title: "" })).toBe(false);
    expect(draftWorthKeeping({ doc: newDoc(), title: " Roof " })).toBe(true);
    expect(draftWorthKeeping({ doc: withLine(), title: "" })).toBe(true);
  });
});

describe("unit:estimateDraft — found again, kept, dropped", () => {
  it("found from the same place; not from another; not a saved estimate's; not when too old", () => {
    const list = [draft("new||c1|p1|")];
    expect(findDraft(list, "new||c1|p1|", NOW, none)?.estimateId).toBe("e-new||c1|p1|");
    expect(findDraft(list, "new||c2|p2|", NOW, none)).toBeUndefined();
    expect(findDraft(list, null, NOW, none)).toBeUndefined();
    expect(findDraft(list, "new||c1|p1|", NOW, (id) => id === "e-new||c1|p1|")).toBeUndefined();
    expect(findDraft(list, "new||c1|p1|", NOW + (DRAFT_DAYS + 1) * 86_400_000, none)).toBeUndefined();
  });
  it("upsert: this place's draft first and once; old ones go; at most MAX_DRAFTS", () => {
    let list: EstimateDraft[] = [draft("a"), draft("old", { at: new Date(NOW - (DRAFT_DAYS + 1) * 86_400_000).toISOString() })];
    list = upsertDraft(list, draft("b"), NOW);
    expect(list.map((d) => d.ctx)).toEqual(["b", "a"]);
    list = upsertDraft(list, draft("a", { title: "changed" }), NOW);
    expect(list.map((d) => [d.ctx, d.title])).toEqual([["a", "changed"], ["b", ""]]);
    for (let i = 0; i < 15; i++) list = upsertDraft(list, draft(`x${i}`), NOW);
    expect(list).toHaveLength(MAX_DRAFTS);
    expect(list[0]!.ctx).toBe("x14");
  });
  it("remove: only this place's; nothing to remove → the same list (no write)", () => {
    const list = [draft("a"), draft("b")];
    expect(removeDraft(list, "a").map((d) => d.ctx)).toEqual(["b"]);
    expect(removeDraft(list, "zzz")).toBe(list);
    expect(removeDraft(list, null)).toBe(list);
  });
});
