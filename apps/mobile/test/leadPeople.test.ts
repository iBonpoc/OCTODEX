/** People of a lead (wave L2 part 2, docs/14-leads-spec.md §2, Р12) and their move to the client (story map S3). */
import { describe, expect, it } from "vitest";
import { cleanPeople, fullPhoneKey, leadPeopleOf, mainContact, mergePeople, peopleByCustomer, peopleForLead } from "../src/data/people";
import { findDuplicates } from "../src/features/leads";
import { makeSeed } from "../src/data/seed";
import type { Lead, Person } from "../src/data/types";

const lead = (p: Partial<Lead>): Lead =>
  ({ id: "L9", name: "Maria Gomez", phone: "(818) 555-0101", city: "Pasadena", sourceId: "s", receivedAt: "2026-11-05T10:00:00Z", message: "", status: "new", ...p }) as Lead;

describe("leadPeopleOf: a lead from before L2 part 2", () => {
  it("phone, second phone and email become the main person; extra contacts become people (owner → other)", () => {
    const ps = leadPeopleOf(
      lead({ phone2: "(818) 555-0102", phone2Label: "work", email: "m@example.com", contacts: [{ id: "c1", name: "Owner Pat", role: "owner", phone: "(818) 555-0103" }] }),
    );
    expect(ps).toEqual([
      {
        id: "L9-main", name: "Maria Gomez", role: "main", language: undefined,
        phones: [{ number: "(818) 555-0101", label: "mobile", primary: true }, { number: "(818) 555-0102", label: "work", primary: undefined }],
        emails: [{ address: "m@example.com", primary: true }],
      },
      { id: "c1", name: "Owner Pat", role: "other", phones: [{ number: "(818) 555-0103", label: "mobile", primary: true }], emails: [] },
    ]);
  });
  it("the same number twice is one phone; an email-only lead has no phone row", () => {
    expect(leadPeopleOf(lead({ phone2: "818-555-0101" }))[0].phones).toHaveLength(1);
    const p = leadPeopleOf(lead({ phone: "", email: "only@example.com" }))[0];
    expect(p.phones).toEqual([]);
    expect(p.emails).toEqual([{ address: "only@example.com", primary: true }]);
  });
  it("saved people win over the old columns", () => {
    const people: Person[] = [{ id: "p1", name: "Maria Gomez", role: "main", phones: [], emails: [] }];
    expect(leadPeopleOf(lead({ people, phone2: "(818) 555-0102" }))).toBe(people);
  });
});

describe("peopleForLead", () => {
  it("once the lead has a client, the card shows the client's people", () => {
    const db = makeSeed();
    const c = db.customers.find((x) => x.id === "c1")!;
    expect(peopleForLead(db, lead({ customerId: c.id })).map((p) => p.name)).toEqual(["Sarah Mitchell", "Tom Mitchell"]);
    expect(peopleForLead(db, lead({})).map((p) => p.name)).toEqual(["Maria Gomez"]);
  });
});

describe("mergePeople (same rule as app.move_lead_people)", () => {
  const client: Person[] = [{ id: "k1", name: "Maria Gomez", role: "main", phones: [{ number: "818.555.0101", label: "mobile", primary: true }], emails: [] }];
  const fromLead: Person[] = [
    { id: "x1", name: "Maria Gomez", role: "main", phones: [{ number: "(818) 555-0101", label: "mobile", primary: true }, { number: "(818) 555-0102", label: "work" }], emails: [{ address: "m@example.com", primary: true }] },
    { id: "x2", name: "Pat Gomez", role: "spouse", phones: [{ number: "(818) 555-0103", label: "mobile", primary: true }], emails: [] },
  ];
  it("same phone: missing phones and emails join that person, no duplicate; others join as extra people", () => {
    const out = mergePeople(client, fromLead);
    expect(out.map((p) => p.id)).toEqual(["k1", "x2"]);
    expect(out[0].phones.map((p) => [p.number, !!p.primary])).toEqual([["818.555.0101", true], ["(818) 555-0102", false]]);
    expect(out[0].emails).toEqual([{ address: "m@example.com", primary: true }]);
    expect(client[0].phones).toHaveLength(1); // the input is not changed
  });
  it("a client without people takes the lead's as they are; a second main person becomes other", () => {
    expect(mergePeople([], fromLead).map((p) => p.role)).toEqual(["main", "spouse"]);
    const stranger: Person = { id: "x3", name: "Someone", role: "main", phones: [{ number: "(818) 555-0199", label: "mobile" }], emails: [] };
    expect(mergePeople(client, [stranger]).map((p) => p.role)).toEqual(["main", "other"]);
  });
  it("same email (any case) also means the same person", () => {
    const c2: Person[] = [{ id: "k2", name: "M", role: "main", phones: [], emails: [{ address: "M@Example.com", primary: true }] }];
    expect(mergePeople(c2, [fromLead[0]])).toHaveLength(1);
  });
});

describe("lead people from the database", () => {
  it("contacts without a client are grouped by lead; a lead's person that moved to a client is the client's", () => {
    const contacts = [
      { id: "a", lead_id: "L1", customer_id: null, name: "Lead Main", role: "main", is_primary: true, created_at: "1" },
      { id: "b", lead_id: "L1", customer_id: "C1", name: "Moved", role: "spouse", created_at: "2" },
    ];
    const phones = [{ contact_id: "a", number: "(818) 555-0101", label: "mobile", is_primary: true, position: 0 }, { contact_id: "a", number: "(818) 555-0102", label: "work", position: 1 }];
    const byLead = peopleByCustomer(contacts, phones, [], "lead_id");
    expect(byLead.get("L1")!.map((p) => [p.name, p.phones.length])).toEqual([["Lead Main", 2]]);
    const byClient = peopleByCustomer(contacts, phones, []);
    expect([...byClient.keys()]).toEqual(["C1"]);
  });
  it("the lead keeps the main person's primary phone and email", () => {
    const clean = cleanPeople(leadPeopleOf(lead({ phone: "  ", email: "x@example.com" })), () => "00000000-0000-4000-8000-000000000001");
    expect(mainContact(clean)).toEqual({ phone: "", email: "x@example.com" });
    expect(mainContact([{ id: "1", name: "a", role: "main", phones: [{ number: "1", label: "home" }, { number: "2", label: "mobile", primary: true }], emails: [] }]).phone).toBe("2");
  });
  it("phone key: last 10 digits, nothing for short numbers", () => {
    expect(fullPhoneKey("+1 (818) 555-0101")).toBe("8185550101");
    expect(fullPhoneKey("555-0101")).toBe("");
  });
});

describe("duplicates see every phone of every person", () => {
  it("a new lead with the spouse's second phone finds the open lead", () => {
    const db = makeSeed();
    const open = lead({
      id: "Lx",
      people: [
        { id: "p1", name: "Maria Gomez", role: "main", phones: [{ number: "(818) 555-0101", label: "mobile", primary: true }], emails: [] },
        { id: "p2", name: "Pat Gomez", role: "spouse", phones: [{ number: "(818) 555-0177", label: "work" }], emails: [] },
      ],
    });
    db.leads = [...db.leads, open];
    expect(findDuplicates(db, { phone: "818 555 0177" }, undefined, Date.parse("2026-11-05T12:00:00Z")).leads.map((l) => l.id)).toEqual(["Lx"]);
    expect(findDuplicates(db, { phones: ["(818) 555-0177"] }, "Lx", Date.parse("2026-11-05T12:00:00Z")).leads).toEqual([]);
  });
});
