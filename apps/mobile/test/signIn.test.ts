/**
 * #1756 — sign-in by the email code: Supabase Auth refusals in the app's words, the «send again» timer.
 * The messages are GoTrue's own (they reach the screen as error.message).
 */
import { describe, it, expect } from "vitest";
import { codeAfterFail, codeDigits, CODE_LENGTH, errPlace, needsSupport, nextReadyAt, RESEND_S, resendLeft, signInError } from "@/features/signIn";
import { en } from "@/i18n/en";
import { ru } from "@/i18n/ru";
import { es } from "@/i18n/es";

describe("signInError", () => {
  const cases: [string, string][] = [
    ['Email address "a@b.co" cannot be used as it is not authorized', "auth.err.notAllowed"],
    ["email rate limit exceeded", "auth.err.mailLimit"],
    ["Request rate limit reached", "auth.err.tooMany"],
    // new accounts switched off in the project: never «the code is wrong» before a code was typed
    ["Signups not allowed for otp", "auth.err.notAllowed"],
    // a wrong code and an old code are the same answer in GoTrue (otp_expired): one key
    ["Token has expired or is invalid", "auth.err.code"],
    ["Invalid login credentials", "auth.err.password"],
    ["Email not confirmed", "auth.err.notConfirmed"],
    ['Email address "x@y" is invalid', "auth.err.badEmail"],
    ["Failed to fetch", "auth.err.network"],
    ["Network request failed", "auth.err.network"],
    ["Load failed", "auth.err.network"],
    ["Error sending magic link email", "auth.err.mailDown"],
    ["Error sending confirmation email", "auth.err.mailDown"],
    ["User is banned", "auth.err.blocked"],
    ["Database error saving new user", "auth.err.other"],
    ["", "auth.err.other"],
  ];
  it.each(cases)("%s → %s", (msg, key) => expect(signInError(msg).key).toBe(key));

  it("the server's own wait keeps its seconds", () => {
    expect(signInError("For security purposes, you can only request this after 42 seconds.")).toEqual({ key: "auth.err.wait", seconds: 42 });
  });

  it("every key has words in RU, EN, ES — and none says «ошибка / не удалось / сбой»", () => {
    const keys = [...cases.map((c) => c[1]), "auth.err.wait"];
    for (const dict of [ru, en, es] as Record<string, string>[])
      for (const k of keys) {
        expect(dict[k], k).toBeTruthy();
        expect(dict[k]).not.toMatch(/ошибк|не удалось|сбой|error|failed/i);
      }
    // spec 102 finds the wrong-password words by «неверн»
    expect(ru["auth.err.password"]).toMatch(/неверн/i);
  });
});

describe("send again", () => {
  it("is off for RESEND_S after a code, then on", () => {
    const t0 = 1_000_000;
    const ready = nextReadyAt(t0);
    expect(resendLeft(ready, t0)).toBe(RESEND_S);
    expect(resendLeft(ready, t0 + 59_001)).toBe(1);
    expect(resendLeft(ready, t0 + 60_000)).toBe(0);
    expect(resendLeft(ready, t0 + 999_999)).toBe(0);
    expect(resendLeft(0, t0)).toBe(0);
  });
  it("the server's wait moves it; other refusals keep RESEND_S", () => {
    expect(nextReadyAt(0, { key: "auth.err.wait", seconds: 17 })).toBe(17_000);
    expect(nextReadyAt(0, { key: "auth.err.network" })).toBe(RESEND_S * 1000);
  });
});

describe("where a refusal stands", () => {
  it("a wrong code under the code field, a bad address under the email field, the rest under the button", () => {
    expect(errPlace("auth.err.code")).toBe("code");
    expect(errPlace("auth.err.badEmail")).toBe("email");
    expect(errPlace("auth.err.notAllowed")).toBe("email");
    expect(errPlace("auth.err.mailLimit")).toBe("form");
  });
  it("dead ends get «Написать в поддержку»", () => {
    expect(needsSupport("auth.err.notAllowed")).toBe(true);
    expect(needsSupport("auth.err.mailDown")).toBe(true);
    expect(needsSupport("auth.err.blocked")).toBe(true);
    expect(needsSupport("auth.err.code")).toBe(false);
    expect(needsSupport("auth.err.network")).toBe(false);
  });
});

describe("the code as typed", () => {
  it("digits only, at most CODE_LENGTH", () => {
    expect(CODE_LENGTH).toBe(8);
    expect(codeDigits("1234 5678")).toBe("12345678");
    expect(codeDigits(" 12-34-56-78-9")).toBe("12345678");
    expect(codeDigits("abc")).toBe("");
  });
});

// spec 52 §6, С1: ДАНО код отправлен; КОГДА введён неверный или устаревший код; ТОГДА цифры остаются и выделены,
// новый код набирается поверх. Другие отказы (сеть, лимиты) цифры не трогают и не выделяют.
describe("С1: the code field after a refused check", () => {
  it("a wrong or old code stays selected", () => {
    expect(codeAfterFail(signInError("Token has expired or is invalid").key)).toBe("select");
    expect(codeAfterFail(signInError("otp_expired").key)).toBe("select");
  });
  it("other refusals keep the digits as they are", () => {
    for (const m of ["Failed to fetch", "Too many requests", "email rate limit exceeded", "Error sending magic link email", "something else"])
      expect(codeAfterFail(signInError(m).key)).toBe("keep");
  });
});
