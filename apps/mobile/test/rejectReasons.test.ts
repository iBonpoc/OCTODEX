/**
 * A refusal we can explain (Н1, spec 33 П23.9): the server's hint is a code from our list (REJECT_REASONS) → our own
 * words in RU/EN/ES; the server's text is never shown (review #259). The lock check of a version (migration
 * 20261108190000, T107) refuses a send with hint estimate_lines_mismatch.
 */
import { describe, expect, it } from "vitest";
import type { Op } from "../src/cloud/ops";
import { REJECT_REASONS, rejectReasonOf, rejectedOf } from "../src/data/outboxRejected";
import type { OwnedItem } from "../src/data/outboxOwner";
import { buildAttention, rejectedHint, rejectedLabel } from "../src/features/attention";
import { makeSeed } from "../src/data/seed";
import { ru } from "../src/i18n/ru";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";

const me = { userId: "u1", companyId: "c1" };
const send = { id: "q1", op: { k: "estimate.send", id: "e1", token: "t" } as Op, at: "2026-11-08T10:00:00.000Z", tries: 4, owner: me } as OwnedItem;
const NOW = Date.parse("2026-11-08T12:00:00Z");
const SERVER_TEXT = "estimate lines do not match its document (option o1, line l1, lines): save the estimate again";

describe("unit:rejectReasons — a refusal we can explain", () => {
  it("code → key: every known code has its words in RU, EN and ES", () => {
    expect(REJECT_REASONS).toEqual({
      estimate_lines_mismatch: "sync.stuck.reason.estimateLines",
      // step 17 C3: the merge of two clients (migration 20261109120000, db T134)
      merge_payment_in_flight: "clientDup.rej.inFlight",
      merge_already_merged: "clientDup.rej.merged",
      customer_merged: "clientDup.rej.cardMerged",
      // spec 37: purchase orders (migration 20261110090000, db T156, T157)
      po_receiving: "po.rej.receiving",
      po_cancelled: "po.rej.cancelled",
      po_stale: "po.rej.stale",
      po_received_office: "po.rej.officeOnly",
      po_not_open: "po.rej.notOpen",
    });
    for (const key of Object.values(REJECT_REASONS))
      for (const dict of [ru, en, es] as Record<string, string>[]) expect(dict[key], key).toMatch(/\S/);
    expect((ru as Record<string, string>)["sync.stuck.reason.estimateLines"]).toContain("сохраните");
    expect((en as Record<string, string>)["att.rejected.estimate"]).toBe("Estimate not sent");
  });
  it("only codes of the list; the server's text, an unknown hint or none — no reason", () => {
    expect(rejectReasonOf("estimate_lines_mismatch")).toBe("estimate_lines_mismatch");
    expect(rejectReasonOf(SERVER_TEXT)).toBeUndefined();
    expect(rejectReasonOf("toString")).toBeUndefined();
    expect(rejectReasonOf(undefined)).toBeUndefined();
    expect(rejectReasonOf(42)).toBeUndefined();
  });
  it("a refused send with the code: a card that opens the estimate and says why in our words", () => {
    const r = rejectedOf(send, SERVER_TEXT, NOW, me, "estimate_lines_mismatch")!;
    expect(r).toMatchObject({ what: "estimate", href: "/estimate/e1", reason: "estimate_lines_mismatch", kind: "estimate.send" });
    expect(rejectedLabel(r)).toBe("att.rejected.estimate");
    expect(rejectedHint(r, "director")).toBe("sync.stuck.reason.estimateLines");
    const att = buildAttention(makeSeed(), "director", NOW, { rejected: [r] }).find((x) => x.kind === "rejected")!;
    expect(att).toMatchObject({ label: "att.rejected.estimate", hint: "sync.stuck.reason.estimateLines", href: "/estimate/e1" });
  });
  it("a quick estimate signed on site sends first: its refusal is the same card", () => {
    const sign = { ...send, op: { k: "estimate.sign", id: "e2", signer: "Ann", svg: "M0 0" } as unknown as Op };
    const r = rejectedOf(sign, SERVER_TEXT, NOW, me, "estimate_lines_mismatch")!;
    expect(r).toMatchObject({ what: "estimate", href: "/estimate/e2", kind: "estimate.sign" });
    // review #415 №4: the card says the client's signature was not kept and must be taken again
    expect(rejectedHint(r, "director")).toBe("sync.stuck.reason.estimateLinesSigned");
    for (const [dict, word] of [[ru, "подпись клиента"], [en, "client's signature"], [es, "firma del cliente"]] as [Record<string, string>, string][])
      expect(dict["sync.stuck.reason.estimateLinesSigned"]).toContain(word);
  });
  it("review #415 №3: the client's approval sends first too — the same card, the signature words", () => {
    const approve = { ...send, op: { k: "estimate.approve", id: "e3", token: "t", optionId: "o", addonIds: [], signer: "Ann", svg: "M0 0", channel: "on_site" } as unknown as Op };
    const r = rejectedOf(approve, SERVER_TEXT, NOW, me, "estimate_lines_mismatch")!;
    expect(r).toMatchObject({ what: "estimate", href: "/estimate/e3", kind: "estimate.approve", reason: "estimate_lines_mismatch" });
    expect(rejectedHint(r, "director")).toBe("sync.stuck.reason.estimateLinesSigned");
  });
  it("a refused send without a known code: as before, not kept (not money)", () => {
    expect(rejectedOf(send, SERVER_TEXT, NOW, me)).toBeNull();
    expect(rejectedOf(send, SERVER_TEXT, NOW, me, "something_else")).toBeNull();
  });
});
