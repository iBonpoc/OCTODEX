/**
 * «Приём заявок» settings (docs/specs/34 §3в, PR 3): the top line never says «taking requests» without the server's
 * IP secret (director 08.11), the site code is a safe link (no iframe, nothing to break the contractor's page), held
 * requests come first, the rows of the journal keep only what the screen shows.
 */
import { describe, expect, it } from "vitest";
import { endpointFromRow, eventFromRow, formLink, heldFirst, readiness, READINESS_TONE, siteSnippet, type IntakeEndpoint } from "../src/features/intakeSettings";

const form = (enabled: boolean): IntakeEndpoint => ({ id: "e1", kind: "form", publicToken: "f".padEnd(33, "a"), tokenHint: "aaaa", sourceId: "s1", enabled, smsConsent: false, captcha: false, dailyLimit: 100 });

describe("intake settings", () => {
  it("readiness: no secret beats everything; then no form / off / on; no answer — unknown", () => {
    expect(readiness({ ipSecret: false }, form(true))).toBe("noSecret");
    expect(readiness({ ipSecret: true }, undefined)).toBe("none");
    expect(readiness({ ipSecret: true }, form(false))).toBe("off");
    expect(readiness({ ipSecret: true }, form(true))).toBe("on");
    expect(readiness(null, form(true))).toBe("unknown");
    expect(readiness(undefined, form(true))).toBe("unknown");
    expect(READINESS_TONE.noSecret).toBe("bad");
    expect(READINESS_TONE.on).toBe("ok");
  });
  it("the form link and the site code: a plain link in a new tab, escaped", () => {
    const link = formLink("https://octodex.expo.app/", "fabc");
    expect(link).toBe("https://octodex.expo.app/f/fabc");
    expect(siteSnippet(link, "Request a quote")).toBe('<a href="https://octodex.expo.app/f/fabc" target="_blank" rel="noopener">Request a quote</a>');
    expect(siteSnippet('x" onclick="evil', "<b>")).toBe('<a href="x&quot; onclick=&quot;evil" target="_blank" rel="noopener">&lt;b&gt;</a>');
    expect(siteSnippet(link, "x")).not.toMatch(/iframe|script/);
  });
  it("held requests first, then the newest", () => {
    const ev = (id: string, status: "held" | "accepted", at: string) => ({ id, endpointId: "e", at, status });
    expect(heldFirst([ev("a", "accepted", "2026-11-08T10:00Z"), ev("b", "held", "2026-11-07T10:00Z"), ev("c", "accepted", "2026-11-08T11:00Z")]).map((e) => e.id)).toEqual(["b", "c", "a"]);
  });
  it("rows: the person from the kept fields; a cleared payload is just no name", () => {
    expect(eventFromRow({ id: 1, endpoint_id: "e", received_at: "t", status: "held", reason: "ip_limit", payload: { name: "Ann", phone: "626", utm: {} } }))
      .toMatchObject({ id: "1", status: "held", reason: "ip_limit", name: "Ann", phone: "626", email: undefined });
    expect(eventFromRow({ id: 2, endpoint_id: "e", received_at: "t", status: "accepted", payload: null }).name).toBeUndefined();
    expect(endpointFromRow({ id: "x", kind: "webhook", token_hint: "beef", source_id: "s", enabled: true, sms_consent_enabled: false, captcha_required: false, daily_limit: 50 }))
      .toEqual({ id: "x", kind: "webhook", publicToken: undefined, tokenHint: "beef", sourceId: "s", enabled: true, smsConsent: false, captcha: false, dailyLimit: 50, rotatedAt: undefined });
  });
});
