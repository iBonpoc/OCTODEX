/**
 * Wave 4b-1 «Do not service» (docs/specs/04 §12): nothing new for the client — canServe on the screens, the red mark
 * for a lead with the same phone, the estimate send guard; and the old taxed draft of a client who became «Без налога».
 * The server refuses the same (db T44).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" }, Linking: {}, Share: {} }));
vi.mock("expo-clipboard", () => ({}));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));

import { canMarkNoService, canServe, notServed, statusChoices } from "../src/features/clients";
import { findDuplicates } from "../src/features/leads";
import { beforeSend } from "../src/features/sendEstimate";
import { newDoc, optionTotals } from "../src/features/estimateDoc";
import { makeSeed } from "../src/data/seed";
import type { Customer, DB, EstimateDoc } from "../src/data/types";

const cust = (id: string, x: Partial<Customer> = {}): Customer => ({ id, name: `C ${id}`, phone: "", ...x }) as Customer;
const taxed = (): EstimateDoc => {
  const d = newDoc();
  d.settings.tax = { ...d.settings.tax, enabled: true, rateBps: 950, groups: { ...d.settings.tax.groups, material: true } };
  d.options[0]!.lines = [{ id: "a", group: "material", name: "Pipe", quantity: "2", unitPriceCents: 10000 } as never];
  return d;
};

describe("canServe", () => {
  const db = { customers: [cust("a"), cust("b", { status: "do_not_service", statusReason: "rude" }), cust("c", { status: "archived" }), cust("d", { status: "prospect" })] };
  it("only «do not service» closes new work; archive and prospect do not", () => {
    expect(canServe(db, "a")).toBe(true);
    expect(canServe(db, "b")).toBe(false);
    expect(canServe(db, "c")).toBe(true);
    expect(canServe(db, "d")).toBe(true);
  });
  it("no client yet (a new lead) or an unknown id: can serve — the server decides on the real row", () => {
    expect(canServe(db, undefined)).toBe(true);
    expect(canServe(db, null)).toBe(true);
    expect(canServe(db, "zzz")).toBe(true);
  });
  it("notServed picks only the marked clients", () => {
    expect(notServed(db.customers).map((c) => c.id)).toEqual(["b"]);
  });
});

describe("a new lead with the phone of a «do not service» client gets the red mark (04 §4)", () => {
  it("found by any phone of the client, the format does not matter", () => {
    const seed = makeSeed();
    const c = seed.customers[0]!;
    const db: DB = { ...seed, customers: seed.customers.map((x) => (x.id === c.id ? { ...x, status: "do_not_service", statusReason: "rude", phone: "+1 (323) 555-0144", people: undefined } : x)) };
    const dup = findDuplicates(db, { phone: "323.555.0144" });
    expect(notServed(dup.customers).map((x) => x.id)).toEqual([c.id]);
    expect(notServed(findDuplicates(db, { phone: "323 555 0999" }).customers)).toEqual([]);
  });
});

describe("beforeSend", () => {
  it("a «do not service» client: an old draft is not sent", () => {
    const db = { customers: [cust("b", { status: "do_not_service" })] };
    expect(beforeSend(db, { customerId: "b", status: "draft", doc: taxed() })).toEqual({ ok: false, reason: "no_service" });
    expect(beforeSend(db, { customerId: "b", status: "sent", doc: taxed() })).toEqual({ ok: false, reason: "no_service" });
  });
  // the bug from wave 4a: the draft was saved with tax, the client became «Без налога», the send locked the taxed version
  // and the server refused it (22023) — the send was dropped. Before the fix the send went out as it was.
  it("a draft with tax of a client who became «Без налога»: saved again without tax before the send", () => {
    const doc = taxed();
    const r = beforeSend({ customers: [cust("x", { taxExempt: true })] }, { customerId: "x", status: "draft", doc });
    expect(r.ok).toBe(true);
    const resave = r.ok ? r.resave : undefined;
    expect(resave).toBeDefined();
    expect(resave!.settings.tax.enabled).toBe(false);
    expect(optionTotals(resave!, resave!.options[0]!).tax).toBe(0);
    expect(doc.settings.tax.enabled).toBe(true); // the document it got is not changed
  });
  it("an ordinary client, a draft already without tax, or a sent (locked) version: nothing to re-save", () => {
    expect(beforeSend({ customers: [cust("a")] }, { customerId: "a", status: "draft", doc: taxed() })).toEqual({ ok: true });
    const off = beforeSend({ customers: [cust("x", { taxExempt: true })] }, { customerId: "x", status: "draft", doc: newDoc() });
    expect(off).toEqual({ ok: true });
    expect(beforeSend({ customers: [cust("x", { taxExempt: true })] }, { customerId: "x", status: "sent", doc: taxed() })).toEqual({ ok: true });
  });
});

describe("who marks «do not service» (04 §12.8, db T58)", () => {
  it("the director and the office do; sales and the tech do not", () => {
    expect(canMarkNoService("director")).toBe(true);
    expect(canMarkNoService("dispatcher")).toBe(true);
    expect(canMarkNoService("sales")).toBe(false);
    expect(canMarkNoService("tech")).toBe(false);
  });
  it("the status menu: sales get archive only, and a marked client cannot be moved by them", () => {
    expect(statusChoices("active", "director")).toEqual(["active", "archived", "do_not_service"]);
    expect(statusChoices("prospect", "dispatcher")).toEqual(["prospect", "archived", "do_not_service"]);
    expect(statusChoices("do_not_service", "director")).toEqual(["active", "archived", "do_not_service"]);
    expect(statusChoices("active", "sales")).toEqual(["active", "archived"]);
    expect(statusChoices("prospect", "sales")).toEqual(["prospect", "archived"]);
    expect(statusChoices("archived", "sales")).toEqual(["active", "archived"]);
    expect(statusChoices("do_not_service", "sales")).toEqual([]);
  });
});
