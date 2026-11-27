/**
 * «Приём заявок» settings (docs/specs/34 §3в, PR 3): the top line never says «taking requests» without the server's
 * IP secret (director 08.11), the site code is a safe link (no iframe, nothing to break the contractor's page), held
 * requests come first, the rows of the journal keep only what the screen shows.
 */
import { describe, expect, it } from "vitest";
import { endpointFromRow, eventFromRow, formLink, formPreview, heldFirst, heldReasonKey, readiness, READINESS_TONE, siteSnippet, type IntakeEndpoint } from "../src/features/intakeSettings";

const form = (enabled: boolean): IntakeEndpoint => ({ id: "e1", kind: "form", publicToken: "f".padEnd(33, "a"), tokenHint: "aaaa", sourceId: "s1", enabled, smsConsent: false, captcha: false, dailyLimit: 100 });

describe("intake settings", () => {
  it("readiness: no secret beats everything; then no form / off / on; no answer — unknown", () => {
    expect(readiness({ ipSecret: false }, form(true))).toBe("noSecret");
    expect(readiness({ ipSecret: true }, undefined)).toBe("none");
    expect(readiness({ ipSecret: true }, form(false))).toBe("off");
    expect(readiness({ ipSecret: true }, form(true))).toBe("on");
    expect(readiness(null, form(true))).toBe("unknown");
    expect(readiness(undefined, form(true))).toBe("checking"); // before the answer: not «no connection»
    // the office reads no ways in: never «no form» for them, but a missing secret is still said
    expect(readiness({ ipSecret: true }, undefined, false)).toBe("notMine");
    expect(readiness({ ipSecret: false }, undefined, false)).toBe("noSecret");
    expect(READINESS_TONE.noSecret).toBe("bad");
    expect(READINESS_TONE.on).toBe("ok");
  });
  // #2012, С4: ДАНО у формы включена капча, а виджета на странице нет (В3); КОГДА директор открывает «Приём заявок»;
  // ТОГДА видит «Заявки ждут проверки» (warn), а не «Принимает заявки»
  it("С4: a form that asks for a captcha is «requests wait for review», never a silent «on»", () => {
    const cap = { ...form(true), captcha: true };
    expect(readiness({ ipSecret: true }, cap)).toBe("held");
    expect(READINESS_TONE.held).toBe("warn");
    expect(readiness({ ipSecret: true }, { ...cap, enabled: false })).toBe("off"); // switched off says so first
    expect(readiness({ ipSecret: false }, cap)).toBe("noSecret"); // no secret still beats everything
  });
  it("a held request's reason: known ones have words, an unknown one (a newer server) says «отложена», never its key", () => {
    expect(heldReasonKey("no_captcha")).toBe("intake.set.reason.no_captcha");
    expect(heldReasonKey("ip_limit")).toBe("intake.set.reason.ip_limit");
    expect(heldReasonKey("something_new")).toBe("intake.set.reason.other");
    expect(heldReasonKey(null)).toBe("intake.set.reason.other");
  });
  it("the form link and the site code: a plain link in a new tab, escaped", () => {
    const link = formLink("https://gorix.expo.app/", "fabc");
    expect(link).toBe("https://gorix.expo.app/f/fabc");
    expect(siteSnippet(link, "Request a quote")).toBe('<a href="https://gorix.expo.app/f/fabc" target="_blank" rel="noopener">Request a quote</a>');
    expect(siteSnippet('x" onclick="evil', "<b>")).toBe('<a href="x&quot; onclick=&quot;evil" target="_blank" rel="noopener">&lt;b&gt;</a>');
    expect(siteSnippet(link, "x")).not.toMatch(/iframe|script/);
  });
  it("held requests first, then the newest", () => {
    const ev = (id: string, status: "held" | "accepted", at: string) => ({ id, endpointId: "e", at, status });
    expect(heldFirst([ev("a", "accepted", "2026-11-08T10:00Z"), ev("b", "held", "2026-11-07T10:00Z"), ev("c", "accepted", "2026-11-08T11:00Z")]).map((e) => e.id)).toEqual(["b", "c", "a"]);
  });
  it("rows: the person from the kept fields; a cleared payload is just no name", () => {
    expect(eventFromRow({ id: 1, endpoint_id: "e", received_at: "t", status: "held", reason: "ip_limit", name: "Ann", phone: "626" }))
      .toMatchObject({ id: "1", status: "held", reason: "ip_limit", name: "Ann", phone: "626", email: undefined });
    expect(eventFromRow({ id: 2, endpoint_id: "e", received_at: "t", status: "accepted", name: null }).name).toBeUndefined();
    expect(endpointFromRow({ id: "x", kind: "webhook", token_hint: "beef", source_id: "s", enabled: true, sms_consent_enabled: false, captcha_required: false, daily_limit: 50 }))
      .toEqual({ id: "x", kind: "webhook", publicToken: undefined, tokenHint: "beef", sourceId: "s", enabled: true, smsConsent: false, captcha: false, dailyLimit: 50, rotatedAt: undefined });
  });
});

describe("#3074 formPreview — «Открыть форму ›» and «Поделиться» by the form's state", () => {
  const token = "f0123456789abcdef0123456789abcdef";
  it("on: opens the page here in preview (nothing sent from it), sharing allowed", () => {
    expect(formPreview({ enabled: true, publicToken: token })).toEqual({ href: `/f/${token}?preview=1`, off: false });
  });
  it("off: said, nothing opens, sharing warns (no dead link handed out)", () => {
    expect(formPreview({ enabled: false, publicToken: token })).toEqual({ href: null, off: true });
  });
  it("no form or no link yet: nothing to open, nothing to warn about", () => {
    expect(formPreview(undefined)).toEqual({ href: null, off: false });
    expect(formPreview({ enabled: true, publicToken: null })).toEqual({ href: null, off: false });
  });
});
