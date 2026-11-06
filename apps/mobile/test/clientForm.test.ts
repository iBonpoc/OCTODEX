/** The client form (docs/specs/13-app-structure.md §3.3 «Изменить», wave 4). */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { Customer } from "../src/data/types";
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
  it("an old client: one phone and the email become the main person's", () => {
    expect(mainPhonesOf(old)).toEqual(["(323) 555-0101"]);
    expect(mainEmailOf(old)).toBe("ana@example.com");
  });
  it("+ phone: the second phone is added, the first stays primary with its label; other people untouched", () => {
    const before = mainPhonesOf(c1);
    const people = withMainContacts(c1, [...before, "(626) 555-0177"], mainEmailOf(c1));
    expect(people[0]!.phones.map((p) => p.number)).toEqual([...before, "(626) 555-0177"]);
    expect(people[0]!.phones[0]!.primary).toBe(true);
    expect(people[0]!.phones.filter((p) => p.primary)).toHaveLength(1);
    expect(people.slice(1)).toEqual(c1.people!.slice(1));
  });
  it("an empty line is dropped; a new email becomes primary", () => {
    const people = withMainContacts(old, ["(323) 555-0101", "  "], "new@example.com");
    expect(people[0]!.phones).toHaveLength(1);
    expect(people[0]!.emails[0]).toEqual({ address: "new@example.com", primary: true });
  });
  it("clearing the email leaves no primary email of the old address", () => {
    const people = withMainContacts(old, ["(323) 555-0101"], "");
    expect(people[0]!.emails).toEqual([]);
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
