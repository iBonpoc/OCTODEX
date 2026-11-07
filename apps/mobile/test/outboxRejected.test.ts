/** A money change the server refused stays visible (docs/specs/23 §3): what is kept, where it opens, «Требует внимания». */
import { describe, expect, it } from "vitest";
import type { Op } from "../src/cloud/ops";
import { MONEY_KINDS, REJECTED_KEY, rejectedMine, rejectedOf, type RejectedOp } from "../src/data/outboxRejected";
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
    expect(rejectedOf(item(op), "P0001: deposit not recorded", NOW)).toEqual({
      id: "q1", owner: me, kind: "estimate.deposit", what: "deposit", href: "/estimate/e1", amountCents: 10000, error: "P0001: deposit not recorded", at: new Date(NOW).toISOString(),
    });
  });
  it("an invoice opens its job (the invoice was never written); a payment its invoice; a visit's payment the visit; an expense its job", () => {
    const of = (op: object) => rejectedOf(item(op as Op), "no", NOW)!;
    expect(of({ k: "invoice.issue", id: "i1", jobId: "j1", customerId: "c", kind: "final", title: "F", totalCents: 500 })).toMatchObject({ what: "invoice", href: "/job/j1", amountCents: 500 });
    expect(of({ k: "invoice.pay", invoiceId: "i1", paymentId: "p", customerId: "c", amountCents: 300, method: "cash" })).toMatchObject({ what: "payment", href: "/invoice/i1", amountCents: 300 });
    expect(of({ k: "payment.record", id: "p", invoiceId: "i2", customerId: "c", amountCents: 200, method: "check" })).toMatchObject({ what: "payment", href: "/invoice/i2" });
    expect(of({ k: "visit.pay", visitId: "v1", jobId: "j", customerId: "c", invoiceId: "i", paymentId: "p", amountCents: 100, method: "card" })).toMatchObject({ what: "payment", href: "/visit/v1" });
    expect(of({ k: "expense.add", id: "x", jobId: "j9", vendor: "HD", category: "materials", amountCents: 50 })).toMatchObject({ what: "expense", href: "/job/j9" });
    expect(of({ k: "expense.add", id: "x", jobId: null, vendor: "HD", category: "materials", amountCents: 50 })).toMatchObject({ href: "/settings" });
  });
  it("not money: nothing is kept (as before: the change is dropped, the server's data comes back)", () => {
    expect(rejectedOf(item({ k: "customer.update", id: "c1", name: "A" } as Op), "no", NOW)).toBeNull();
    expect(MONEY_KINDS.has("customer.update")).toBe(false);
  });
  it("only the signed-in person's, in this company; an old one without an owner counts as theirs", () => {
    const list = [{ id: "a", owner: me }, { id: "b", owner: { userId: "u2", companyId: "c1" } }, { id: "c", owner: { userId: "u1", companyId: "c2" } }, { id: "d" }] as RejectedOp[];
    expect(rejectedMine(list, me).map((r) => r.id)).toEqual(["a", "d"]);
    expect(rejectedMine(list, null)).toEqual([]);
  });
  it("company data: the account deletion wipes the key with the caches", () => {
    expect(isDeviceKey(REJECTED_KEY)).toBe(true);
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
  it("without the list: as before", () => {
    const d = makeSeed();
    expect(buildAttention(d, "director", 0)).toEqual(buildAttention(d, "director", 0, {}));
    expect(buildAttention(d, "director", 0).some((x) => x.kind === "rejected")).toBe(false);
  });
});
