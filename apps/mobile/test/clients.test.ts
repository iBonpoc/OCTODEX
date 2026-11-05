/** Client card logic (docs/specs/04 §4, §7, §8): status label, tags, money, search, history, who sees what. */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { canSeeClientMoney, clientHistory, clientMoneyOf, clientStatusChip, matchClient, statusOf, tagLabel, tagsOf, visibleClients } from "../src/features/clients";
import { CUSTOMER_STATUSES } from "../src/data/types";

const db = makeSeed();
const c1 = db.customers.find((c) => c.id === "c1")!;
const t = (k: string) => `«${k}»`;

describe("status label", () => {
  it("every client status has a colour + word; old clients without status are active", () => {
    for (const s of CUSTOMER_STATUSES) expect(clientStatusChip[s].l).toMatch(/^client\.st\./);
    expect(statusOf({ ...c1, status: undefined })).toBe("active");
    expect(clientStatusChip.do_not_service.s).toBe("bad");
  });
});

describe("tags", () => {
  it("client tags in the company's order; system tags are translated, own tags shown as typed", () => {
    expect(tagsOf(db, c1).map((x) => x.id)).toEqual(["tag-vip", "tag-regular"]);
    expect(tagLabel(db.tags.find((x) => x.id === "tag-late")!, t)).toBe("«tag.noLateCalls»");
    expect(tagLabel({ id: "x", name: "Pool", active: true, position: 9 }, t)).toBe("Pool");
    expect(tagLabel({ id: "y", name: "VIP", active: true, position: 9 }, t)).toBe("VIP");
  });
});

describe("money on the card", () => {
  it("Sarah owes nothing and paid $582 in total (deposit $342 + final $240)", () => {
    expect(clientMoneyOf(db, "c1")).toEqual({ owesCents: 0, paidTotalCents: 58200, invoicedCents: 58200 });
  });
  it("David owes $1,840 and paid nothing", () => {
    expect(clientMoneyOf(db, "c2")).toEqual({ owesCents: 184000, paidTotalCents: 0, invoicedCents: 184000 });
  });
  it("only office roles see money", () => {
    expect(canSeeClientMoney("director")).toBe(true);
    expect(canSeeClientMoney("dispatcher")).toBe(true);
    expect(canSeeClientMoney("tech")).toBe(false);
  });
});

describe("search", () => {
  it("by name, number, second phone of any person, email, address, document number", () => {
    expect(matchClient(db, c1, "mitch")).toBe(true);
    expect(matchClient(db, c1, "CLT-0001")).toBe(true);
    expect(matchClient(db, c1, "555-0144")).toBe(true); // Tom, the spouse
    expect(matchClient(db, c1, "6265550143")).toBe(true); // Sarah's work phone, digits only
    expect(matchClient(db, c1, "sarah.m@")).toBe(true);
    expect(matchClient(db, c1, "rosemont")).toBe(true); // second property
    expect(matchClient(db, c1, "INV-0105")).toBe(true);
    expect(matchClient(db, c1, "RCT-0102")).toBe(true);
    expect(matchClient(db, c1, "55")).toBe(false); // fewer than 3 digits: no phone match
    expect(matchClient(db, c1, "kim")).toBe(false);
  });
});

describe("who sees which clients", () => {
  it("office sees everyone; a tech only clients of own visits", () => {
    expect(visibleClients(db, "director")).toHaveLength(db.customers.length);
    const mine = visibleClients({ ...db, me: "m-ivan" }, "tech").map((c) => c.id);
    const ivanJobs = db.visits.filter((v) => v.techId === "m-ivan").map((v) => v.jobId);
    const expected = new Set(ivanJobs.map((j) => db.properties.find((p) => p.id === db.jobs.find((x) => x.id === j)!.propertyId)!.customerId));
    expect(new Set(mine)).toEqual(expected);
    expect(mine.length).toBeLessThan(db.customers.length);
  });
});

describe("history", () => {
  it("newest first; estimate sent and signed, visits, invoices and payments for the office", () => {
    const h = clientHistory(db, "c1", "director");
    expect(h.map((x) => x.at)).toEqual([...h.map((x) => x.at)].sort().reverse());
    const titles = new Set(h.map((x) => x.title));
    for (const k of ["client.h.estimateSent", "client.h.estimateSigned", "client.h.visit", "client.h.invoice", "client.h.payment"]) expect(titles.has(k as never)).toBe(true);
  });
  it("a tech sees no money lines and no amounts", () => {
    const h = clientHistory(db, "c1", "tech");
    expect(h.some((x) => x.kind === "money")).toBe(false);
    expect(h.every((x) => x.cents === undefined)).toBe(true);
  });
  it("a private note of someone else is not in the history", () => {
    const d = { ...db, notes: [{ id: "n-x", subjectType: "customer" as const, subjectId: "c1", body: "secret", visibility: "private" as const, pinned: false, authorId: "m-ivan", at: new Date().toISOString() }] };
    expect(clientHistory(d, "c1", "director").some((x) => x.detail === "secret")).toBe(false);
    expect(clientHistory({ ...d, me: "m-ivan" }, "c1", "director").some((x) => x.detail === "secret")).toBe(true);
  });
});
