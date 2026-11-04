import { describe, expect, it } from "vitest";
import { formatDateUS, formatCard, formatCardExp, formatEIN, formatPhoneUS, formatState, formatZip } from "../src/ui/inputFormat";

describe("input formatting (US)", () => {
  it("phone", () => {
    expect(formatPhoneUS("")).toBe("");
    expect(formatPhoneUS("5")).toBe("(5");
    expect(formatPhoneUS("5555")).toBe("(555) 5");
    expect(formatPhoneUS("5555550100")).toBe("(555) 555-0100");
    expect(formatPhoneUS("+1 (555) 555-0100")).toBe("(555) 555-0100");
    expect(formatPhoneUS("555.555.0100 ext")).toBe("(555) 555-0100");
    expect(formatPhoneUS("55555501009999")).toBe("(555) 555-0100");
    // formatting is idempotent (re-typing over formatted text)
    expect(formatPhoneUS(formatPhoneUS("6265550199"))).toBe("(626) 555-0199");
  });
  it("EIN, ZIP, card, expiry, state", () => {
    expect(formatEIN("123456789")).toBe("12-3456789");
    expect(formatEIN("12")).toBe("12");
    expect(formatZip("911031234")).toBe("91103-1234");
    expect(formatZip("9110a")).toBe("9110");
    expect(formatCard("4242424242424242")).toBe("4242 4242 4242 4242");
    expect(formatCard("42424")).toBe("4242 4");
    expect(formatCardExp("1228")).toBe("12/28");
    expect(formatState("ca1")).toBe("CA");
    expect(formatDateUS("12312027")).toBe("12/31/2027");
    expect(formatDateUS("123")).toBe("12/3");
  });
});

import { fieldSpec, type FieldType } from "../src/ui/fieldTypes";
describe("field types → keyboard and autofill", () => {
  const kb = (t: FieldType) => fieldSpec(t).kb ?? "default";
  it("numbers and money never get the letter keyboard", () => {
    for (const t of ["money", "number", "percent"] as const) expect(kb(t)).toBe("decimal-pad");
    for (const t of ["integer", "zip", "ein", "code", "cardNumber", "cardExp", "cardCvc", "date"] as const) expect(kb(t)).toBe("number-pad");
  });
  it("contacts get their keyboards and autofill", () => {
    expect(fieldSpec("phone")).toMatchObject({ kb: "phone-pad", ac: "tel", tc: "telephoneNumber" });
    expect(fieldSpec("email")).toMatchObject({ kb: "email-address", ac: "email", cap: "none", correct: false });
    expect(fieldSpec("url")).toMatchObject({ kb: "url", cap: "none" });
    expect(fieldSpec("name")).toMatchObject({ cap: "words", ac: "name" });
    expect(fieldSpec("street")).toMatchObject({ cap: "words", tc: "streetAddressLine1" });
    expect(fieldSpec("code")).toMatchObject({ ac: "one-time-code", tc: "oneTimeCode" });
    expect(fieldSpec("password").secure).toBe(true);
    expect(fieldSpec("newPassword")).toMatchObject({ secure: true, ac: "new-password" });
  });
});
