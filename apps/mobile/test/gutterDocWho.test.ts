/**
 * #2159 (founder 18.11: «нет адреса, кому принадлежит»; «если это черновик, то тоже нужно обозначить»): the head of every
 * Gutters document says whose and where — the lead's or the client's name and the job's address (the client's property,
 * else the lead's own) — and a measurement tied to nobody says «Черновик · без адреса».
 */
import { describe, expect, it } from "vitest";
import { docWho } from "../src/modules/gutters/docWho";
import type { DB } from "../src/data/types";

const db = {
  leads: [
    { id: "l1", name: "Linda Alvarez", address: "12 Oak St", city: "Fresno" },
    { id: "l2", name: "No Address Lead", city: "" },
  ],
  customers: [{ id: "c1", name: "Mark Cole" }],
  properties: [{ id: "p1", customerId: "c1", address: "5 Elm Ave", city: "Clovis" }],
} as unknown as Pick<DB, "leads" | "properties" | "customers">;
const DRAFT = "Черновик · без адреса";

describe("unit:gutterDocWho — whose and where on a Gutters document", () => {
  it("a lead's measurement: the lead's name and the lead's own address (it was missing)", () => {
    expect(docWho(db, { leadId: "l1", propertyId: null }, DRAFT)).toEqual({ who: "Linda Alvarez", address: "12 Oak St, Fresno", draft: false });
  });
  it("a client's property: the client's name and the property's address", () => {
    expect(docWho(db, { leadId: null, propertyId: "p1" }, DRAFT)).toEqual({ who: "Mark Cole", address: "5 Elm Ave, Clovis", draft: false });
  });
  it("a lead without an address: the name, no address line", () => {
    expect(docWho(db, { leadId: "l2", propertyId: null }, DRAFT)).toEqual({ who: "No Address Lead", draft: false });
  });
  it("tied to nobody: «Черновик · без адреса», never an empty head", () => {
    expect(docWho(db, { leadId: null, propertyId: null }, DRAFT)).toEqual({ who: DRAFT, draft: true });
    expect(docWho(db, { leadId: "gone", propertyId: null }, DRAFT)).toEqual({ who: DRAFT, draft: true });
  });
});
