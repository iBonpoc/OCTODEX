/** «Требует внимания» as people: grouping by client, a lead without a client is its own card, any reason kind. */
import { describe, expect, it } from "vitest";
import { buildAttention, type AttentionItem } from "../src/features/attention";
import { attentionPeople, subjectOf } from "../src/features/attentionPeople";
import { makeSeed } from "../src/data/seed";

const db = makeSeed();
const items = buildAttention(db);
const people = attentionPeople(db, items);

describe("attention by people", () => {
  it("every reason lands in exactly one card", () => {
    expect(people.flatMap((p) => p.items).length).toBe(items.length);
  });
  it("a lead without a client is its own card; a client's reasons share one card", () => {
    for (const p of people) {
      if (p.leadId) expect(db.leads.find((l) => l.id === p.leadId)?.customerId).toBeUndefined();
      if (p.customerId) for (const it of p.items) expect(subjectOf(db, it).customerId).toBe(p.customerId);
    }
    expect(new Set(people.map((p) => p.key)).size).toBe(people.length);
  });
  it("a «late» reason goes to the visit's client, not to the tech it is named after", () => {
    const late = items.find((i) => i.kind === "late");
    if (!late) return;
    const p = people.find((x) => x.items.includes(late))!;
    expect(p.customerId).toBeTruthy();
    expect(db.customers.find((c) => c.id === p.customerId)?.name).not.toBe(late.name);
  });
  it("people are ordered by their most urgent reason; reasons inside by urgency", () => {
    for (let i = 1; i < people.length; i++) expect(people[i - 1]!.score).toBeGreaterThanOrEqual(people[i]!.score);
    for (const p of people) for (let i = 1; i < p.items.length; i++) expect(p.items[i - 1]!.score).toBeGreaterThanOrEqual(p.items[i]!.score);
  });
  it("debt counts only overdue invoices (estimate amounts are not added)", () => {
    for (const p of people) {
      const overdue = p.items.filter((i) => i.kind === "overdue");
      const want = overdue.reduce((s, i) => { const inv = db.invoices.find((x) => x.id === i.refId)!; return s + Math.max(0, inv.totalCents - inv.paidCents); }, 0);
      expect(p.debtCents).toBe(want);
    }
  });
  it("works with an unknown reason kind (new reasons from other chats): own card by the item when nothing is found", () => {
    const odd = { id: "x-1", kind: "contractToSign", refId: "nope", status: "warn", label: "att.lead", params: {}, chip: "st.late", name: "?", score: 5000 } as unknown as AttentionItem;
    const est = db.estimates[0]!;
    const known = { ...odd, id: "x-2", refId: est.id } as AttentionItem;
    const ps = attentionPeople(db, [odd, known]);
    expect(ps[0]!.key).toBe("item:x-1");
    expect(ps.find((p) => p.items.includes(known))!.customerId).toBe(est.customerId);
  });
});
