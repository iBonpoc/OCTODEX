/**
 * #760 (audit Q-01): the estimate being built is kept on the phone. The pure rules of the draft list; the screen —
 * e2e 246-estimate-draft.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
import { DRAFT_DAYS, MAX_DRAFTS, cleanDraft, cleanDrafts, draftConflict, draftCtx, draftSnapshot, draftWorthKeeping, draftsKey, findDraft, isEditCtx, nextDrafts, removeDraft, upsertDraft, type EstimateDraft } from "../src/features/estimateDraft";
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
  it("a new estimate has a place; a saved one's edit too (#2381); a template's lines have none", () => {
    expect(draftCtx({ customerId: "c1", propertyId: "p1" })).toBe("new||c1|p1|");
    expect(draftCtx({ leadId: "l1" })).toBe("new|l1|||");
    expect(draftCtx({})).toBe("new||||");
    // #2381: a saved estimate's edit has its own place — the edits live on the phone until «Готово»
    expect(draftCtx({ id: "e1" })).toBe("edit|e1");
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

describe("unit:estimateDraft — #2381 the edit of a saved estimate («Готово / Отменить»)", () => {
  const edit = (id: string, over: Partial<EstimateDraft> = {}) => draft(`edit|${id}`, { estimateId: id, baseSavedAt: "2026-11-10T10:00:00.000Z", ...over });
  it("its draft is found though the estimate is saved (a new one's is not)", () => {
    const list = [edit("e1")];
    expect(isEditCtx("edit|e1")).toBe(true);
    expect(isEditCtx("new||c1|p1|")).toBe(false);
    expect(findDraft(list, "edit|e1", NOW, () => true)?.estimateId).toBe("e1");
  });
  it("never too old: an edit's draft is kept past DRAFT_DAYS", () => {
    const old = edit("e1", { at: new Date(NOW - (DRAFT_DAYS + 5) * 86_400_000).toISOString() });
    expect(findDraft([old], "edit|e1", NOW, () => true)).toBeDefined();
    expect(upsertDraft([old], draft("new|a|||"), NOW).some((d) => d.ctx === "edit|e1")).toBe(true);
  });
  it("never pushed out by the limit: MAX_DRAFTS counts the new estimates only", () => {
    const edits = Array.from({ length: 3 }, (_, i) => edit(`e${i}`));
    const news = Array.from({ length: MAX_DRAFTS + 2 }, (_, i) => draft(`new|l${i}|||`));
    let list: EstimateDraft[] = edits;
    for (const n of news) list = upsertDraft(list, n, NOW);
    expect(list.filter((d) => isEditCtx(d.ctx))).toHaveLength(3);
    expect(list.filter((d) => !isEditCtx(d.ctx))).toHaveLength(MAX_DRAFTS);
  });
  it("the conflict: the estimate saved since the draft began (another phone) — by «≠», never «>» (phones' clocks differ)", () => {
    const d = edit("e1");
    expect(draftConflict(d, "2026-11-10T10:00:00.000Z")).toBe(false);
    expect(draftConflict(d, "2026-11-10T10:05:00.000Z")).toBe(true);
    expect(draftConflict(d, "2026-11-10T09:55:00.000Z")).toBe(true);
  });
  it("an older estimate with no savedAt: its base is \"\" — not a conflict by itself", () => {
    expect(draftConflict(edit("e1", { baseSavedAt: "" }), undefined)).toBe(false);
    expect(draftConflict(edit("e1", { baseSavedAt: "" }), "2026-11-10T10:00:00.000Z")).toBe(true);
  });
  it("an edit's draft without its base (an older build dropped it, rule 16): a conflict — asked, never overwritten", () => {
    expect(draftConflict(edit("e1", { baseSavedAt: undefined }), "2026-11-10T10:00:00.000Z")).toBe(true);
  });
  it("the base survives the store: cleanDraft keeps baseSavedAt; an old draft without it reads as before", () => {
    expect(cleanDraft(JSON.parse(JSON.stringify(edit("e1"))))?.baseSavedAt).toBe("2026-11-10T10:00:00.000Z");
    const old = cleanDraft(JSON.parse(JSON.stringify(draft("new||c1|p1|"))));
    expect(old?.ctx).toBe("new||c1|p1|");
    expect(old?.baseSavedAt).toBeUndefined();
  });
  it("no sums in a draft: the engine counts them from the doc (rule 8) — the stored shape itself (interface EstimateDraft) has none", () => {
    const src = readFileSync(join(__dirname, "..", "src", "features", "estimateDraft.ts"), "utf8");
    const shape = src.slice(src.indexOf("export interface EstimateDraft"), src.indexOf("}", src.indexOf("export interface EstimateDraft")));
    expect(shape.length).toBeGreaterThan(100);
    for (const field of shape.matchAll(/^\s+(\w+)\??:/gm)) expect(/total|sum|cents|deposit|tax/i.test(field[1]!), field[1]).toBe(false);
  });
});
