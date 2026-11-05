/** People of a client: shape from the database, cleaning before save, demo client numbers (docs/specs/04 §3). */
import { describe, expect, it } from "vitest";
import { cleanPeople, nextClientNumber, peopleByCustomer, peopleOf } from "../src/data/people";
import { makeSeed } from "../src/data/seed";
import type { Customer, Person } from "../src/data/types";

const UUID = /^[0-9a-f-]{36}$/;
let k = 0;
const newId = () => `00000000-0000-4000-8000-${String(++k).padStart(12, "0")}`;

describe("peopleOf", () => {
  it("an old client (one phone, one email) is one main person", () => {
    const c: Customer = { id: "c9", name: "Old Client", phone: "(818) 555-0100", email: "old@example.com", sourceId: "s", balanceCents: 0 };
    expect(peopleOf(c)).toEqual([
      { id: "c9-main", name: "Old Client", role: "main", phones: [{ number: "(818) 555-0100", label: "mobile", primary: true }], emails: [{ address: "old@example.com", primary: true }] },
    ]);
  });
  it("a client with people keeps them; no phone → no phone rows", () => {
    const seed = makeSeed();
    expect(peopleOf(seed.customers.find((c) => c.id === "c1")!).map((p) => p.name)).toEqual(["Sarah Mitchell", "Tom Mitchell"]);
    expect(peopleOf({ id: "x", name: "N", phone: "", sourceId: "s", balanceCents: 0 })[0]!.phones).toEqual([]);
  });
});

describe("cleanPeople (before save)", () => {
  const raw: Person[] = [
    { id: "c9-main", name: "  Anna  ", role: "main", phones: [{ number: " (818) 555-0101 ", label: "mobile" }, { number: "  ", label: "work" }, { number: "(818) 555-0102", label: "work", primary: true }], emails: [{ address: "", primary: true }] },
    { id: "11111111-1111-4111-8111-111111111111", name: "", role: "other", phones: [], emails: [] },
    { id: "22222222-2222-4222-8222-222222222222", name: "Bob", role: "assistant", phones: [{ number: "1", label: "mobile" }, { number: "2", label: "home" }], emails: [{ address: "b@x.com" }, { address: "not-an-email" }, { address: "c@x.com" }] },
  ];
  const out = cleanPeople(raw, newId);
  it("a derived person gets a real id; real ids are kept", () => {
    expect(out[0]!.id).toMatch(UUID);
    expect(out[0]!.id).not.toBe("c9-main");
    expect(out[1]!.id).toBe("22222222-2222-4222-8222-222222222222");
  });
  it("trims names and numbers, drops empty phones / emails and empty people", () => {
    expect(out.map((p) => p.name)).toEqual(["Anna", "Bob"]);
    expect(out[0]!.phones.map((p) => p.number)).toEqual(["(818) 555-0101", "(818) 555-0102"]);
    expect(out[0]!.emails).toEqual([]);
    expect(out[1]!.emails.map((e) => e.address)).toEqual(["b@x.com", "c@x.com"]);
  });
  it("exactly one primary phone and email per person (the marked one, else the first)", () => {
    expect(out[0]!.phones.map((p) => !!p.primary)).toEqual([false, true]);
    expect(out[1]!.phones.map((p) => !!p.primary)).toEqual([true, false]);
    expect(out[1]!.emails.map((p) => !!p.primary)).toEqual([true, false]);
  });
});

describe("peopleByCustomer (database rows → people)", () => {
  const contacts = [
    { id: "p2", customer_id: "c1", name: "Tom", role: "spouse", phone: "(626) 555-0144", is_primary: false, created_at: "2026-01-02" },
    { id: "p1", customer_id: "c1", name: "Sarah", role: "owner", phone: "(626) 555-0142", email: "s@x.com", is_primary: true, created_at: "2026-01-03" },
    { id: "p3", customer_id: "c2", name: "Dave", role: "cousin", phone: null, email: null, is_primary: true, created_at: "2026-01-01" },
  ];
  const phones = [
    { contact_id: "p1", number: "(626) 555-0143", label: "work", is_primary: false, position: 1 },
    { contact_id: "p1", number: "(626) 555-0142", label: "mobile", is_primary: true, position: 0 },
    { contact_id: "p3", number: "(818) 555-0187", label: "fax", is_primary: true, position: 0 },
  ];
  const map = peopleByCustomer(contacts, phones, [{ contact_id: "p1", address: "s@x.com", is_primary: true, position: 0 }]);
  it("primary person first; old role 'owner' reads as 'main'; unknown role → other", () => {
    expect(map.get("c1")!.map((p) => [p.name, p.role])).toEqual([["Sarah", "main"], ["Tom", "spouse"]]);
    expect(map.get("c2")![0]!.role).toBe("other");
  });
  it("phones from contact_phones, primary first; unknown label → other", () => {
    expect(map.get("c1")![0]!.phones).toEqual([{ number: "(626) 555-0142", label: "mobile", primary: true }, { number: "(626) 555-0143", label: "work", primary: undefined }]);
    expect(map.get("c2")![0]!.phones[0]!.label).toBe("other");
  });
  it("before the C1 migration: the contact's own phone / email become its primary ones", () => {
    expect(map.get("c1")![1]!.phones).toEqual([{ number: "(626) 555-0144", label: "mobile", primary: true }]);
    expect(map.get("c2")![0]!.emails).toEqual([]);
  });
});

describe("nextClientNumber (demo; the server numbers clients in the cloud)", () => {
  it("next after the highest CLT number", () => {
    expect(nextClientNumber(makeSeed())).toBe("CLT-0008");
    expect(nextClientNumber({ ...makeSeed(), customers: [] })).toBe("CLT-0001");
  });
});
