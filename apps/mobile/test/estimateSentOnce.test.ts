/**
 * #3058: an estimate that went out remembers it after an edit — «Изменена после отправки», «Отправить изменения», the price reminder
 * only on the first send. One rule (features/estimateStatus): sentOnceAt = the later of lastSentAt / sentAt.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { changedAfterSend, estimateView, laterIso, sentOnceAt } from "../src/features/estimateStatus";
import { normalizeDB } from "../src/data/normalize";
import { makeSeed } from "../src/data/seed";

const SENT = "2026-11-25T18:00:00.000Z";
const EDIT = "2026-11-27T09:00:00.000Z";

describe("an estimate that went out (#3058)", () => {
  it("laterIso / sentOnceAt — the later moment, either may be missing", () => {
    expect(laterIso(undefined, undefined)).toBeUndefined();
    expect(laterIso(SENT, undefined)).toBe(SENT);
    expect(laterIso(SENT, EDIT)).toBe(EDIT);
    expect(sentOnceAt({ lastSentAt: SENT })).toBe(SENT);
    expect(sentOnceAt({})).toBeUndefined();
  });
  it("a draft that went out and was saved since: changed after sending, the warn chip", () => {
    const e = { status: "draft" as const, lastSentAt: SENT, savedAt: EDIT };
    expect(changedAfterSend(e)).toBe(true);
    expect(estimateView(e)).toEqual({ s: "warn", l: "oc.est.changedAfterSend" });
  });
  it("a draft never sent, or a sent one not saved since — its own status", () => {
    expect(changedAfterSend({ status: "draft", savedAt: EDIT })).toBe(false);
    expect(estimateView({ status: "draft", savedAt: EDIT }).l).toBe("st.draft");
    expect(changedAfterSend({ status: "sent", sentAt: EDIT, savedAt: SENT })).toBe(false);
    expect(changedAfterSend({ status: "sent", sentAt: SENT, savedAt: EDIT })).toBe(true);
    expect(estimateView({ status: "sent", sentAt: SENT, savedAt: EDIT }).l).toBe("st.sent");
  });
  it("the store keeps it on save, the cloud reads it from the sent version, the editor and the price reminder use it", () => {
    const store = readFileSync(new URL("../src/data/store.tsx", import.meta.url), "utf8");
    expect(store).toContain("lastSentAt: laterIso(prev?.lastSentAt, prev?.sentAt)");
    const repo = readFileSync(new URL("../src/cloud/repo.ts", import.meta.url), "utf8");
    expect(repo).toContain("lastSentAt: (versionOf.get(s(e.sent_version_id))?.sent_at");
    const editor = readFileSync(new URL("../src/app/estimate/new.tsx", import.meta.url), "utf8");
    expect(editor).toContain('const sentBefore = !!existing && (existing.status !== "draft" || !!sentOnceAt(existing));');
    const send = readFileSync(new URL("../src/features/sendEstimate.ts", import.meta.url), "utf8");
    expect(send).toContain('firstSend: e.status === "draft" && !sentOnceAt(e)');
  });
  it("old data without lastSentAt (a phone of an older version, the demo seed) loads as before: sentOnceAt falls back to sentAt", () => {
    const seed = makeSeed();
    const e6 = seed.estimates.find((e) => e.id === "e6")!;
    expect(e6.lastSentAt).toBeUndefined();
    const db = normalizeDB(seed, "demo");
    const n6 = db.estimates.find((e) => e.id === "e6")!;
    expect(n6.lastSentAt).toBeUndefined();
    expect(sentOnceAt(n6)).toBe(n6.sentAt);
    expect(n6.status).toBe(e6.status);
  });
});
