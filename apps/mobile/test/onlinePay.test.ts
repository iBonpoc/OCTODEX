/**
 * unit:onlinePay — what the state of the company's Stripe account means on «Онлайн-оплата» (docs/specs/35, 20b).
 */
import { describe, expect, it } from "vitest";
import { action, fromAnswer, readiness, READINESS_TONE, stateFromRow } from "../src/features/onlinePay";

const row = (o: Record<string, unknown>) => stateFromRow({ charges_enabled: false, payouts_enabled: false, details_submitted: false, requirements_due: 0, ...o });

describe("unit:onlinePay", () => {
  it("not asked, no answer, not set up, no account", () => {
    expect(readiness(undefined)).toBe("checking");
    expect(readiness("unknown")).toBe("unknown");
    expect(readiness("notSet")).toBe("notSet");
    expect(readiness(null)).toBe("off");
  });
  it("charges on = ready, even while Stripe still asks for something", () => {
    expect(readiness(row({ charges_enabled: true, requirements_due: 2 }))).toBe("ready");
  });
  it("details not sent yet: pending; sent and disabled by Stripe: restricted", () => {
    expect(readiness(row({}))).toBe("pending");
    expect(readiness(row({ disabled_reason: "requirements.past_due" }))).toBe("pending");
    expect(readiness(row({ details_submitted: true, disabled_reason: "rejected.fraud" }))).toBe("restricted");
  });
  it("the button: connect when off, continue when Stripe waits, nothing when ready or not set up", () => {
    expect(action("off")).toBe("connect");
    expect(action("pending")).toBe("continue");
    expect(action("restricted")).toBe("continue");
    expect(action("ready")).toBeNull();
    expect(action("notSet")).toBeNull();
    expect(action("unknown")).toBeNull();
  });
  it("colour only for status: ready ok, pending warn, restricted bad", () => {
    expect(READINESS_TONE.ready).toBe("ok");
    expect(READINESS_TONE.pending).toBe("warn");
    expect(READINESS_TONE.restricted).toBe("bad");
  });
  it("a row from the server: only what it says, bad values are «no»", () => {
    expect(stateFromRow({ requirements_due: -3, disabled_reason: "", charges_enabled: "true" })).toEqual({
      chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, requirementsDue: 0, disabledReason: null, livemode: false,
    });
  });
  it("the edge function's answer", () => {
    expect(fromAnswer(503, { error: "not_configured" }).state).toBe("notSet");
    expect(fromAnswer(503, { error: "live_refused" }).state).toBe("notSet");
    expect(fromAnswer(502, { error: "stripe" }).state).toBe("unknown");
    expect(fromAnswer(null, null).state).toBe("unknown");
    expect(fromAnswer(200, { connected: false }).state).toBeNull();
    expect(readiness(fromAnswer(200, { connected: true, charges_enabled: true }).state)).toBe("ready");
    expect(fromAnswer(200, { connected: true, url: "https://connect.stripe.com/setup/s/x" }).url).toBe("https://connect.stripe.com/setup/s/x");
    expect(fromAnswer(200, { connected: true, url: "https://evil.test/x" }).url).toBeUndefined();
    expect(readiness(fromAnswer(200, { connected: true, url: "https://connect.stripe.com/x" }).state)).toBe("pending");
  });
});
