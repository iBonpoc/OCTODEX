/** spec 52 §6 — «Может, gmail.com?»: a known typo of a big mailbox domain is caught before the code goes */
import { describe, it, expect } from "vitest";
import { emailTypoFix } from "@/features/emailTypo";

describe("emailTypoFix", () => {
  it.each([
    ["ivan@gmial.com", "ivan@gmail.com"],
    ["Ivan.Petrov@GMAL.com", "Ivan.Petrov@gmail.com"],
    [" bob@yahooo.com ", "bob@yahoo.com"],
    ["a@hotmial.com", "a@hotmail.com"],
    ["a@outlok.com", "a@outlook.com"],
    ["a@icloud.co", "a@icloud.com"],
  ])("%s → %s", (typed, fixed) => expect(emailTypoFix(typed)).toBe(fixed));
  it.each(["ivan@gmail.com", "owner@acme-gutters.com", "x@company.co", "no-at-sign", "@gmial.com", ""])("%s → nothing", (typed) =>
    expect(emailTypoFix(typed)).toBeNull(),
  );
});
