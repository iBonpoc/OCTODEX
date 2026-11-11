/**
 * #760 (audit Q-01): the estimate being built is kept on the phone. The pure rules of the draft list; the screen —
 * e2e 246-estimate-draft.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
import { DRAFT_DAYS, MAX_DRAFTS, cleanDrafts, draftCtx, draftSnapshot, draftWorthKeeping, draftsKey, findDraft, nextDrafts, removeDraft, upsertDraft, type EstimateDraft } from "../src/features/estimateDraft";
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
    expect(isDeviceKey(draftsKey(true, "co1", "u1")!)).toBe(true);
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

describe("unit:estimateDraft — review of #859", () => {
  it("№3: the cloud without a company or a person yet — no key (the builder waits); never a shared «none» list", () => {
    expect(draftsKey(true, undefined, "u1")).toBeNull();
    expect(draftsKey(true, "co1", null)).toBeNull();
    expect(draftsKey(true, "co-a", "u1")).not.toBe(draftsKey(true, "co-b", "u1"));
  });
  it("№1: a template opened and left untouched leaves no draft (its name and lines are not a change)", () => {
    const d = draft("new||c1|p1|tpl1", { title: "Gutter cleaning" }); // worth keeping by itself: a title and a line
    const opened = { snapshot: draftSnapshot(d), restored: false };
    expect(nextDrafts([], d, opened, NOW)).toEqual([]);
    expect(nextDrafts([draft("x")], d, opened, NOW).map((x) => x.ctx)).toEqual(["x"]);
    // changed: kept
    const changed = { ...d, title: "Gutter cleaning, 2 stories" };
    expect(nextDrafts([], changed, opened, NOW).map((x) => x.title)).toEqual(["Gutter cleaning, 2 stories"]);
    // changed back to how it opened: nothing to keep
    expect(nextDrafts([changed], d, opened, NOW)).toEqual([]);
  });
  it("a continued draft opened again is left as it was — its time is its last change, not this opening", () => {
    const old = draft("new||c1|p1|", { at: new Date(NOW - 20 * 86_400_000).toISOString(), title: "Roof" });
    const list = [old];
    const reopened = { ...old, at: new Date(NOW).toISOString() };
    expect(nextDrafts(list, reopened, { snapshot: draftSnapshot(old), restored: true }, NOW)).toBe(list);
  });
  it("a broken stored draft is dropped alone; an older shape is brought to the current one", () => {
    const good = draft("good");
    const older = { ...draft("older"), doc: { options: [{ id: "o1", name: "A", lines: [] }] }, checkPrice: undefined };
    const out = cleanDrafts([good, { ctx: 1 }, null, { ...draft("no-options"), doc: { options: "x" } }, older]);
    expect(out.map((d) => d.ctx)).toEqual(["good", "older"]); // before: one bad item threw the whole list away
    expect(out[1]!.doc.settings).toEqual(newDoc().settings);
    expect(out[1]!.checkPrice).toEqual([]);
    expect(cleanDrafts("not a list")).toEqual([]);
  });
});
