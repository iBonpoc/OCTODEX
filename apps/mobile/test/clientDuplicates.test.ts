/** Duplicate clients and their merge (docs/specs/04 §13, map S3d) — the same rule as public.merge_customers (db T134). */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { Customer, DB, Lead } from "../src/data/types";
import {
  addressKey, canMarkNotDuplicate, canMergeClients, canSeeClientDups, clientDuplicates, CROWD, defaultKeep, duplicatesOf, markNotDuplicateDb,
  mergeCustomersDb, mergedTarget, mergeSummary,
} from "../src/features/clientDuplicates";
import { findDuplicates, leadDuplicatesFor } from "../src/features/leads";
import { peopleOf } from "../src/data/people";
import { visibleClients } from "../src/features/clients";
import { rejectedOf } from "../src/data/outboxRejected";

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
  it("a phone shared by more than CROWD cards (an office's, a manager's) is not a sign of a duplicate", () => {
    const many: Customer[] = Array.from({ length: CROWD + 1 }, (_, i) => twin({ id: `m${i}`, number: `CLT-1${i}`, phone: "(213) 555-0001" }));
    expect(clientDuplicates({ ...base, customers: [...many, ...base.customers] }).size).toBe(0);
    expect(clientDuplicates({ ...base, customers: [...many.slice(0, CROWD), ...base.customers] }).get("m0")!.length).toBe(CROWD - 1);
  });
  it("the list's mark and the card's block — one rule: the owner / admin and the office, not sales or a tech", () => {
    expect([canSeeClientDups("director"), canSeeClientDups("dispatcher"), canSeeClientDups("sales"), canSeeClientDups("tech")]).toEqual([true, true, false, false]);
  });
  it("a merged card is not in the clients list, for anyone", () => {
    const db = withTwin({ mergedIntoId: "c1", status: "archived" });
    expect(visibleClients(db, "director").some((c) => c.id === "cx")).toBe(false);
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
  it("leads, jobs, tasks and history move; a property's person and a call point at the kept person", () => {
    const lead = { ...base.leads[0]!, id: "lx", customerId: "cx" };
    const sarahMain = peopleOf(base.customers.find((c) => c.id === "c1")!)[0]!;
    const twinPerson = { id: "tp", name: "Sarah M", role: "main" as const, phones: [{ number: "626.555.0142", label: "mobile" as const }], emails: [] };
    const d0: DB = {
      ...withTwin({ people: [twinPerson] }),
      leads: [lead, ...base.leads],
      tasks: [{ id: "tx", subjectType: "customer", subjectId: "cx", title: "call" } as DB["tasks"][number], ...base.tasks],
      activities: [{ id: "ax", subjectType: "customer", subjectId: "cx", kind: "call", at: new Date().toISOString(), actorId: "m-alex", contactId: "tp" } as DB["activities"][number], ...base.activities],
      properties: [{ ...base.properties[0]!, id: "ppx", customerId: "cx", contactIds: ["tp"] }, ...base.properties],
    };
    const d1 = mergeCustomersDb(d0, "c1", "cx");
    expect(d1.leads.find((l) => l.id === "lx")!.customerId).toBe("c1");
    expect(d1.tasks.find((x) => x.id === "tx")!.subjectId).toBe("c1");
    expect(d1.activities.find((x) => x.id === "ax")).toMatchObject({ subjectId: "c1", contactId: sarahMain.id });
    expect(d1.properties.find((x) => x.id === "ppx")).toMatchObject({ customerId: "c1", contactIds: [sarahMain.id] });
  });
  it("an archived kept card becomes active only when the other was not archived (as on the server)", () => {
    expect(mergeCustomersDb(withTwin({ status: "archived" }), "cx", "c1").customers.find((c) => c.id === "cx")!.status).toBe("active");
    const both = { ...withTwin({ status: "archived" }), customers: withTwin({ status: "archived" }).customers.map((c) => (c.id === "c1" ? { ...c, status: "archived" as const } : c)) };
    expect(mergeCustomersDb(both, "cx", "c1").customers.find((c) => c.id === "cx")!.status).toBe("archived");
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

describe("a merge the server refused", () => {
  const item = () => ({ id: "o1", op: { k: "customer.merge" as const, keepId: "c1", dropId: "cx" }, at: new Date().toISOString(), tries: 4 });
  it("is never dropped silently: a card that opens the kept client, with the reason in our words", () => {
    expect(rejectedOf(item(), "x", Date.now(), null, "merge_payment_in_flight")).toMatchObject({ what: "merge", href: "/client/c1", reason: "merge_payment_in_flight" });
    expect(rejectedOf(item(), "x", Date.now(), null, "merge_already_merged")?.reason).toBe("merge_already_merged");
    expect(rejectedOf(item(), "x", Date.now(), null)).toMatchObject({ what: "merge", href: "/client/c1" });
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
