/**
 * #2887: the new client made from an estimate's client sheet comes back to THAT estimate, once.
 * С1 ДАНО форма открыта из сметы КОГДА клиент создан ТОГДА смета берёт его (и его объект) при возврате.
 * С2 взял один раз: второй возврат на смету ничего не берёт.
 * С3 клиент для одной сметы не достаётся другой.
 * С4 форма открыта сама (без ключа) — ничего не оставляет.
 */
import { describe, expect, it } from "vitest";
import { handoffKey, offerNewClient, splitTyped, takeNewClient } from "../src/features/estimate/newClientHandoff";

describe("newClientHandoff (#2887)", () => {
  it("С1: the estimate takes the client made for it, with its property", () => {
    const k = handoffKey("est-1");
    expect(offerNewClient(k, { customerId: "c9", propertyId: "p9" })).toBe(true);
    expect(takeNewClient(k)).toEqual({ customerId: "c9", propertyId: "p9" });
  });
  it("С2: once — a second return takes nothing", () => {
    const k = handoffKey("est-2");
    offerNewClient(k, { customerId: "c9", propertyId: "p9" });
    takeNewClient(k);
    expect(takeNewClient(k)).toBeNull();
  });
  it("С3: another estimate never takes it", () => {
    offerNewClient(handoffKey("est-3"), { customerId: "c3", propertyId: "p3" });
    expect(takeNewClient(handoffKey("est-4"))).toBeNull();
    expect(takeNewClient(handoffKey("est-3"))?.customerId).toBe("c3");
  });
  it("С4: a form opened on its own (no key) leaves nothing", () => {
    expect(offerNewClient(undefined, { customerId: "c5", propertyId: "p5" })).toBe(false);
    expect(offerNewClient("", { customerId: "c5", propertyId: "p5" })).toBe(false);
  });
  it("the key is the estimate's own", () => {
    expect(handoffKey("abc")).toBe("estimate:abc");
  });
});

describe("splitTyped — the sheet's search goes into the new client's form (#2887, crm-reviewer №2)", () => {
  it("a name: the first word the first name, the rest the last name", () => {
    expect(splitTyped("Linda Alv")).toEqual({ first: "Linda", last: "Alv", phone: "", email: "", street: "" });
    expect(splitTyped("  Mary  Ann  Lee ")).toEqual({ first: "Mary", last: "Ann Lee", phone: "", email: "", street: "" });
    expect(splitTyped("Kim")).toEqual({ first: "Kim", last: "", phone: "", email: "", street: "" });
  });
  it("digits: the phone", () => {
    expect(splitTyped("(818) 555-0177")).toEqual({ first: "", last: "", phone: "(818) 555-0177", email: "", street: "" });
    expect(splitTyped("8185550177")).toEqual({ first: "", last: "", phone: "8185550177", email: "", street: "" });
  });
  it("nothing typed: an empty form", () => {
    expect(splitTyped("")).toEqual({ first: "", last: "", phone: "", email: "", street: "" });
    expect(splitTyped(undefined)).toEqual({ first: "", last: "", phone: "", email: "", street: "" });
  });
  it("a street number with words is a name search, not a phone", () => {
    expect(splitTyped("12 Oak").phone).toBe("");
  });
  it("an address goes to the street, never to the name (review of #2931)", () => {
    expect(splitTyped("12 Oak St")).toEqual({ first: "", last: "", phone: "", email: "", street: "12 Oak St" });
    expect(splitTyped(" 551  Elm ")).toEqual({ first: "", last: "", phone: "", email: "", street: "551 Elm" });
  });
  it("an e-mail goes to the e-mail, never to the name (review of #2931)", () => {
    expect(splitTyped("nora@park.com")).toEqual({ first: "", last: "", phone: "", email: "nora@park.com", street: "" });
  });
});
