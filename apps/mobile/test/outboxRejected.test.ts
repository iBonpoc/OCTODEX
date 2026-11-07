/** A money change the server refused stays visible (docs/specs/23 §3): what is kept, where it opens, «Требует внимания». */
import { describe, expect, it } from "vitest";
import type { Op } from "../src/cloud/ops";
import { freshRejected, REJECTED_KEEP_MS, REJECTED_KEY, rejectedMine, rejectedOf, rejectedOthers, type RejectedOp } from "../src/data/outboxRejected";
import { wipedOnDelete } from "../src/data/outboxOwner";
import type { DB } from "../src/data/types";
import { MONEY_KINDS } from "../src/data/syncLink";
import type { OwnedItem } from "../src/data/outboxOwner";
import { attentionHref, buildAttention } from "../src/features/attention";
import { isDeviceKey } from "../src/features/deleteAccount";
import { makeSeed } from "../src/data/seed";

const me = { userId: "u1", companyId: "c1" };
const item = (op: Op, extra: Partial<OwnedItem> = {}): OwnedItem => ({ id: "q1", op, at: "2026-11-07T10:00:00.000Z", tries: 4, owner: me, ...extra });
const NOW = Date.parse("2026-11-07T12:00:00Z");

describe("unit:outboxRejected — what is kept of a refused money change", () => {
  it("the deposit: the estimate, its amount, the server's words, whose", () => {
    const op = { k: "estimate.deposit", id: "e1", jobId: "j1", invoiceId: "i1", paymentId: "p1", method: "cash", customerId: "c", propertyId: "p", title: "T", totalCents: 100000, depositCents: 10000 } as Op;
    expect(rejectedOf(item(op), "P0001: deposit not recorded", NOW, me)).toEqual({
      id: "q1", owner: me, kind: "estimate.deposit", what: "deposit", href: "/estimate/e1", amountCents: 10000, error: "P0001: deposit not recorded", at: new Date(NOW).toISOString(),
    });
  });
  it("an invoice opens its job (the invoice was never written); a payment its invoice; a visit's payment the visit; an expense its job", () => {
    const of = (op: object) => rejectedOf(item(op as Op), "no", NOW, me)!;
    expect(of({ k: "invoice.issue", id: "i1", jobId: "j1", customerId: "c", kind: "final", title: "F", totalCents: 500 })).toMatchObject({ what: "invoice", href: "/job/j1", amountCents: 500 });
    expect(of({ k: "invoice.pay", invoiceId: "i1", paymentId: "p", customerId: "c", amountCents: 300, method: "cash" })).toMatchObject({ what: "payment", href: "/invoice/i1", amountCents: 300 });
    expect(of({ k: "payment.record", id: "p", invoiceId: "i2", customerId: "c", amountCents: 200, method: "check" })).toMatchObject({ what: "payment", href: "/invoice/i2" });
    expect(of({ k: "visit.pay", visitId: "v1", jobId: "j", customerId: "c", invoiceId: "i", paymentId: "p", amountCents: 100, method: "card" })).toMatchObject({ what: "payment", href: "/visit/v1" });
    expect(of({ k: "expense.add", id: "x", jobId: "j9", vendor: "HD", category: "materials", amountCents: 50 })).toMatchObject({ what: "expense", href: "/job/j9" });
    expect(of({ k: "expense.add", id: "x", jobId: null, vendor: "HD", category: "materials", amountCents: 50 })).toMatchObject({ href: "/settings/profile" });
  });
  it("the client's approval / the company's countersign that makes the deposit invoice is money: its estimate (review #259 круг 3)", () => {
    const of = (op: object) => rejectedOf(item(op as Op), "no", NOW, me);
    const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    expect(of({ k: "estimate.approve", id: U(2), token: "t", optionId: U(3), addonIds: [], signer: "S", svg: "", channel: "on_site", jobId: U(4), invoiceId: U(5) })).toMatchObject({ what: "deposit", href: `/estimate/${U(2)}` });
    expect(of({ k: "estimate.countersign", id: U(6), jobId: U(7), invoiceId: U(8) })).toMatchObject({ what: "deposit", href: `/estimate/${U(6)}` });
    // without an invoice it makes no money: dropped as before
    expect(of({ k: "estimate.countersign", id: "e3", svg: "x" })).toBeNull();
  });
  it("not money: nothing is kept (as before: the change is dropped, the server's data comes back)", () => {
    expect(rejectedOf(item({ k: "customer.update", id: "c1", name: "A" } as Op), "no", NOW, me)).toBeNull();
    expect(MONEY_KINDS.has("customer.update")).toBe(false);
  });
  it("only the signed-in person's, in this company; an old one without an owner counts as theirs", () => {
    const list = [{ id: "a", owner: me }, { id: "b", owner: { userId: "u2", companyId: "c1" } }, { id: "c", owner: { userId: "u1", companyId: "c2" } }, { id: "d" }] as RejectedOp[];
    expect(rejectedMine(list, me).map((r) => r.id)).toEqual(["a", "d"]);
    expect(rejectedMine(list, null)).toEqual([]);
  });
  it("company data: a device key — but the account deletion filters it by owner, like the outbox (review #263 №2)", () => {
    expect(isDeviceKey(REJECTED_KEY)).toBe(true);
    expect(wipedOnDelete(REJECTED_KEY)).toBe(false);
    const list = [{ id: "a", owner: me }, { id: "b", owner: { userId: "u2", companyId: "c1" } }, { id: "c" }] as RejectedOp[];
    expect(rejectedOthers(list, "u1").map((r) => r.id)).toEqual(["b"]);
  });
  it("whose: the op's owner, else the person signed in when it was refused (review #263 №6)", () => {
    const op = { k: "expense.add", id: "x", jobId: null, vendor: "HD", category: "materials", amountCents: 50 } as Op;
    expect(rejectedOf(item(op, { owner: undefined }), "no", NOW, me)?.owner).toEqual(me);
    expect(rejectedOf(item(op), "no", NOW, { userId: "u9", companyId: "c9" })?.owner).toEqual(me);
  });
  it("older than 30 days: gone by itself (review #263 №10)", () => {
    const at = (ms: number) => new Date(NOW - ms).toISOString();
    const list = [{ id: "new", owner: me, at: at(REJECTED_KEEP_MS - 60_000) }, { id: "old", owner: me, at: at(REJECTED_KEEP_MS + 60_000) }] as RejectedOp[];
    expect(freshRejected(list, NOW).map((r) => r.id)).toEqual(["new"]);
    expect(rejectedMine(list, me, NOW).map((r) => r.id)).toEqual(["new"]);
  });
});

describe("unit:outboxRejected — «Требует внимания»", () => {
  const r: RejectedOp = { id: "q1", owner: me, kind: "estimate.deposit", what: "deposit", href: "/estimate/e1", amountCents: 10000, error: "no", at: "2026-11-07T12:00:00.000Z" };
  it("first, bad, with the amount, and it opens the record it was about", () => {
    const items = buildAttention(makeSeed(), "director", Date.now(), { rejected: [r] });
    const it0 = [...items].sort((a, b) => b.score - a.score)[0]!;
    expect(it0).toMatchObject({ kind: "rejected", status: "bad", label: "att.rejected.deposit", chip: "att.rejectedChip", amountCents: 10000 });
    expect(attentionHref(it0)).toBe("/estimate/e1");
  });
  it("always first: above a lead that waits for hours (1000 + minutes, review #263 №1)", () => {
    const d = makeSeed();
    const l = d.leads[0]!;
    const waiting: DB = { ...d, leads: [{ ...l, status: "new", receivedAt: new Date(Date.now() - 10 * 3600_000).toISOString(), lastActivityAt: undefined }, ...d.leads.slice(1)] };
    const items = buildAttention(waiting, "director", Date.now(), { rejected: [r] });
    expect(items.some((x) => x.kind === "lead" && x.score > 1500)).toBe(true); // the case of the review
    expect([...items].sort((a, b) => b.score - a.score)[0]!.kind).toBe("rejected");
  });
  it("without the list: as before", () => {
    const d = makeSeed();
    expect(buildAttention(d, "director", 0)).toEqual(buildAttention(d, "director", 0, {}));
    expect(buildAttention(d, "director", 0).some((x) => x.kind === "rejected")).toBe(false);
  });
});
