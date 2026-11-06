/** The client form (docs/specs/13-app-structure.md §3.3 «Изменить», wave 4). */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { Customer } from "../src/data/types";
import { applyCustomerPatch } from "../src/data/customerPatch";
import { billingLine, billingOk, displayName, mainEmailOf, mainPhonesOf, nameOk, namePartsOf, phoneOk, withMainContacts } from "../src/features/clientForm";

const db = makeSeed();
const c1 = db.customers.find((c) => c.id === "c1")!;
const old: Customer = { id: "x", name: "Ana Maria Lopez", phone: "(323) 555-0101", email: "ana@example.com", sourceId: "s", balanceCents: 0 };

describe("name parts", () => {
  it("an old client with only a name: first word, the rest", () => {
    expect(namePartsOf(old)).toEqual({ first: "Ana", last: "Maria Lopez", company: "" });
  });
  it("saved parts win over the shown name", () => {
    expect(namePartsOf({ ...old, firstName: "Ana", lastName: "Lopez", companyName: "Lopez LLC" })).toEqual({ first: "Ana", last: "Lopez", company: "Lopez LLC" });
  });
  it("the shown name is the person's; a business without a person shows the company", () => {
    expect(displayName({ first: " Ana ", last: "Lopez", company: "Lopez LLC" })).toBe("Ana Lopez");
    expect(displayName({ first: "", last: "", company: "Acme Property Mgmt" })).toBe("Acme Property Mgmt");
    expect(nameOk({ first: "", last: "", company: "" })).toBe(false);
    expect(nameOk({ first: "", last: "", company: "Acme" })).toBe(true);
  });
  it("a phone needs 7 digits", () => {
    expect(phoneOk("555-01")).toBe(false);
    expect(phoneOk("(626) 555-0142")).toBe(true);
  });
});

describe("main person's phones and email", () => {
  const two: Customer = {
    ...old,
    people: [{ id: "x-main", name: "Ana", role: "main", phones: [{ number: "(323) 555-0102", label: "home" }, { number: "(323) 555-0101", label: "mobile", primary: true }], emails: [{ address: "ana@example.com", primary: true }] }],
  };
  it("an old client: one phone and the email become the main person's", () => {
    expect(mainPhonesOf(old)).toEqual([{ number: "(323) 555-0101", label: "mobile" }]);
    expect(mainEmailOf(old)).toBe("ana@example.com");
  });
  it("primary first, each line with its own label", () => {
    expect(mainPhonesOf(two)).toEqual([{ number: "(323) 555-0101", label: "mobile" }, { number: "(323) 555-0102", label: "home" }]);
  });
  it("+ number keeps every label in place (review 4a: labels went by index of the unsorted list)", () => {
    const people = withMainContacts(two, [...mainPhonesOf(two), { number: "(323) 555-0177", label: "mobile" }], "ana@example.com");
    expect(people[0]!.phones).toEqual([
      { number: "(323) 555-0101", label: "mobile", primary: true },
      { number: "(323) 555-0102", label: "home", primary: undefined },
      { number: "(323) 555-0177", label: "mobile", primary: undefined },
    ]);
  });
  it("removing a middle line does not move labels onto the next one", () => {
    const three = [...mainPhonesOf(two), { number: "(323) 555-0177", label: "work" as const }];
    const people = withMainContacts(two, [three[0]!, three[2]!], "ana@example.com");
    expect(people[0]!.phones.map((p) => p.label)).toEqual(["mobile", "work"]);
  });
  it("+ phone on Sarah: the first stays primary; other people untouched", () => {
    const people = withMainContacts(c1, [...mainPhonesOf(c1), { number: "(626) 555-0177", label: "mobile" }], mainEmailOf(c1));
    expect(people[0]!.phones.filter((p) => p.primary)).toHaveLength(1);
    expect(people[0]!.phones[0]!.primary).toBe(true);
    expect(people.slice(1)).toEqual(c1.people!.slice(1));
  });
  it("an empty line is dropped; a new email becomes primary", () => {
    const people = withMainContacts(old, [{ number: "(323) 555-0101", label: "mobile" }, { number: "  ", label: "mobile" }], "new@example.com");
    expect(people[0]!.phones).toHaveLength(1);
    expect(people[0]!.emails[0]).toEqual({ address: "new@example.com", primary: true });
  });
  it("clearing the email removes the primary address; no other address is made primary here", () => {
    const people = withMainContacts({ ...old, people: [{ id: "m", name: "Ana", role: "main", phones: [], emails: [{ address: "a@x.com", primary: true }, { address: "b@x.com" }] }] }, [], "");
    expect(people[0]!.emails).toEqual([{ address: "b@x.com" }]);
  });
});

describe("the phone's copy of a client change (customerPatch)", () => {
  it("source and «tax exempt» with its note; turning it off clears the note", () => {
    const on = applyCustomerPatch(old, { sourceId: "src-google", taxExempt: true, taxExemptNote: " RC-123 " });
    expect(on).toMatchObject({ sourceId: "src-google", taxExempt: true, taxExemptNote: "RC-123" });
    expect(applyCustomerPatch(on, { taxExempt: false, taxExemptNote: "" })).toMatchObject({ taxExempt: undefined, taxExemptNote: undefined });
  });
});

describe("billing address", () => {
  it("needs a street and a city", () => {
    expect(billingOk({ line1: "", city: "Pasadena" })).toBe(false);
    expect(billingOk({ line1: "PO Box 12", city: "Pasadena" })).toBe(true);
  });
  it("one line for the row", () => {
    expect(billingLine({ line1: "100 Main St", unit: "4", city: "Pasadena", state: "CA", zip: "91101" })).toBe("100 Main St, #4, Pasadena, CA 91101");
  });
});
