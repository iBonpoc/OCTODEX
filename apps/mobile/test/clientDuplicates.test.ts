/** Duplicate clients and their merge (docs/specs/04 §13, map S3d) — the same rule as public.merge_customers (db T134). */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { Customer, DB, Lead } from "../src/data/types";
import {
  addressKey, canMarkNotDuplicate, canMergeClients, clientDuplicates, defaultKeep, duplicatesOf, markNotDuplicateDb,
  mergeCustomersDb, mergedTarget, mergeSummary,
} from "../src/features/clientDuplicates";
import { findDuplicates, leadDuplicatesFor } from "../src/features/leads";
import { peopleOf } from "../src/data/people";

const base = makeSeed();
const twin = (over: Partial<Customer> = {}): Customer => ({ id: "cx", number: "CLT-0099", name: "Sarah M.", phone: "+1 626 555 0142", sourceId: "src-yelp", balanceCents: 0, ...over });
const withTwin = (over: Partial<Customer> = {}, more: Partial<DB> = {}): DB => ({ ...base, customers: [twin(over), ...base.customers], ...more });

describe("what is a duplicate", () => {
  it("the seed has none (the list shows no mark by itself)", () => {
    expect(clientDuplicates(base).size).toBe(0);
  });
  it("the same phone written another way — both sides see each other", () => {
    const db = withTwin();
    expect(duplicatesOf(db, "cx").map((d) => [d.customer.id, d.reasons])).toEqual([["c1", ["phone"]]]);
    expect(duplicatesOf(db, "c1").map((d) => d.customer.id)).toEqual(["cx"]);
  });
  it("an email in another case; any person's phone counts, not only the main one", () => {
    expect(duplicatesOf(withTwin({ phone: "", email: "SARAH.M@example.com " }), "cx")[0]!.reasons).toEqual(["email"]);
    const db = withTwin({ phone: "", people: [{ id: "p1", name: "A", role: "main", phones: [], emails: [] }, { id: "p2", name: "Wife", role: "spouse", phones: [{ number: "626-555-0142", label: "mobile" }], emails: [] }] });
    expect(duplicatesOf(db, "cx")[0]!.reasons).toEqual(["phone"]);
  });
  it("the address: «Street» = «St.», the unit and the zip count; no street number or no zip / city — no key", () => {
    expect(addressKey({ address: "123 Main Street", unit: "Apt 4", city: "Pasadena, CA 91101" })).toBe(addressKey({ address: "123 main st.", unit: "4", place: { city: "Pasadena", zip: "91101" } }));
    expect(addressKey({ address: "123 Main St", unit: "4", city: "Pasadena, CA 91101" })).not.toBe(addressKey({ address: "123 Main St", unit: "5", city: "Pasadena, CA 91101" }));
    expect(addressKey({ address: "Main Street", city: "Pasadena" })).toBe("");
    expect(addressKey({ address: "123 Main St", city: "" })).toBe("");
    const p = base.properties.find((x) => x.customerId === "c1")!;
    const db = withTwin({ phone: "(999) 555-0000" }, { properties: [...base.properties, { ...p, id: "px", customerId: "cx", address: p.address.toUpperCase() + "." }] });
    expect(duplicatesOf(db, "cx").map((d) => [d.customer.id, d.reasons])).toEqual([["c1", ["address"]]]);
  });
  it("archived, merged and «not a duplicate» pairs are not shown", () => {
    expect(duplicatesOf(withTwin({ status: "archived" }), "c1")).toEqual([]);
    expect(duplicatesOf(withTwin({ mergedIntoId: "c1" }), "c1")).toEqual([]);
    expect(duplicatesOf(withTwin({ notDuplicateIds: ["c1"] }), "c1")).toEqual([]);
    expect(duplicatesOf(markNotDuplicateDb(withTwin(), "c1", "cx"), "cx")).toEqual([]);
  });
  it("only the owner / admin merge; the office may say «not a duplicate»; a tech and sales — neither", () => {
    expect([canMergeClients("director"), canMergeClients("dispatcher"), canMergeClients("sales"), canMergeClients("tech")]).toEqual([true, false, false, false]);
    expect([canMarkNotDuplicate("director"), canMarkNotDuplicate("dispatcher"), canMarkNotDuplicate("sales"), canMarkNotDuplicate("tech")]).toEqual([true, true, false, false]);
  });
  it("the older card stays by default (the smaller CLT number)", () => {
    const db = withTwin();
    expect(defaultKeep(db, "cx", "c1")).toBe("c1");
    expect(defaultKeep(db, "c1", "cx")).toBe("c1");
  });
});

describe("the merge", () => {
  const db = withTwin({ firstName: "Sarah", billing: { line1: "1 Billing Rd", city: "Glendale" }, tagIds: ["tag-late"], status: "do_not_service", statusReason: "unpaid" });
  const c2 = base.customers.find((c) => c.id === "c2")!;
  // the twin's own things: a property, an estimate and an invoice of David moved to the twin for the test
  const before: DB = {
    ...db,
    properties: db.properties.map((p) => (p.customerId === "c2" ? { ...p, customerId: "cx" } : p)),
    estimates: db.estimates.map((e) => (e.customerId === "c2" ? { ...e, customerId: "cx" } : e)),
    invoices: db.invoices.map((i) => (i.customerId === "c2" ? { ...i, customerId: "cx" } : i)),
    payments: db.payments.map((p) => (p.customerId === "c2" ? { ...p, customerId: "cx" } : p)),
    notes: [...db.notes, { id: "nx", subjectType: "customer", subjectId: "cx", body: "gate", at: new Date().toISOString(), authorId: "m-alex" } as DB["notes"][number]],
  };
  const moved = { props: before.properties.filter((p) => p.customerId === "cx").length, est: before.estimates.filter((e) => e.customerId === "cx").length, inv: before.invoices.filter((i) => i.customerId === "cx").length };
  const owed = (d: DB, id: string) => d.invoices.filter((i) => i.customerId === id).reduce((s, i) => s + i.totalCents, 0);
  const after = mergeCustomersDb(before, "c1", "cx");
  const kept = after.customers.find((c) => c.id === "c1")!;

  it("the summary counts what moves", () => {
    const s = mergeSummary(before, "cx");
    expect([s.properties, s.estimates, s.invoices]).toEqual([moved.props, moved.est, moved.inv]);
    expect(moved.props + moved.est + moved.inv).toBeGreaterThan(0);
  });
  it("everything of the second card is on the kept one; the second is archived and merged", () => {
    expect(after.properties.filter((p) => p.customerId === "c1").length).toBe(before.properties.filter((p) => p.customerId === "c1").length + moved.props);
    expect(after.estimates.some((e) => e.customerId === "cx") || after.invoices.some((i) => i.customerId === "cx") || after.properties.some((p) => p.customerId === "cx")).toBe(false);
    expect(after.notes.find((n) => n.id === "nx")!.subjectId).toBe("c1");
    expect(after.customers.find((c) => c.id === "cx")).toMatchObject({ status: "archived", mergedIntoId: "c1" });
    expect(mergedTarget(after, "cx")?.id).toBe("c1");
  });
  it("the money is the same — now on one card; numbers do not change", () => {
    expect(owed(after, "c1")).toBe(owed(before, "c1") + owed(before, "cx"));
    expect(after.invoices.map((i) => i.number).sort()).toEqual(before.invoices.map((i) => i.number).sort());
  });
  it("the same person is one (her phone already there), tags are both sets, the empty fields come from the second", () => {
    expect(peopleOf(kept).length).toBe(peopleOf(before.customers.find((c) => c.id === "c1")!).length);
    expect(kept.tagIds).toEqual(["tag-vip", "tag-regular", "tag-late"]);
    expect(kept.firstName).toBe("Sarah");
    expect(kept.billing?.line1).toBe("1 Billing Rd");
    expect(kept.sourceId).toBe("src-google"); // the kept one's own value stays
  });
  it("«do not service» of either stays on the kept card, with its reason", () => {
    expect(kept).toMatchObject({ status: "do_not_service", statusReason: "unpaid" });
  });
  it("a repeat, into itself, or of a merged card — changes nothing", () => {
    expect(mergeCustomersDb(after, "c1", "cx")).toBe(after);
    expect(mergeCustomersDb(before, "c1", "c1")).toBe(before);
    expect(mergeCustomersDb(after, "cx", "c2")).toBe(after);
    expect(mergeCustomersDb(after, "c2", "cx")).toBe(after);
    expect(c2.id).toBe("c2");
  });
  it("a new lead with the phone finds the kept card, not the merged one", () => {
    expect(findDuplicates(after, { phone: "(626) 555-0142" }).customers.map((c) => c.id)).toEqual(["c1"]);
  });
});

describe("duplicates on the lead card, for a tech (review #442)", () => {
  const mk = (id: string, over: Partial<Lead>): Lead => ({ ...base.leads[0]!, id, number: `LEA-9${id}`, people: undefined, contacts: undefined, phone: "(818) 555-7777", email: undefined, customerId: undefined, ...over });
  const mine = mk("1", { assigneeId: "m-me", createdBy: undefined });
  const office = mk("2", { assigneeId: "m-alex", createdBy: "m-alex" });
  const made = mk("3", { assigneeId: "m-alex", createdBy: "m-me" });
  const db: DB = { ...base, me: "m-me", leads: [mine, office, made, ...base.leads] };

  it("the office sees every lead with the same phone", () => {
    expect(leadDuplicatesFor(db, "director", mine).leads.map((l) => l.id).sort()).toEqual(["2", "3"]);
  });
  it("a tech sees only the leads he may see (his own or made by him), never the office's", () => {
    expect(leadDuplicatesFor(db, "tech", mine).leads.map((l) => l.id)).toEqual(["3"]);
  });
});
