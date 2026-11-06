/**
 * Wave 7б-2 (docs/specs/03 §12, Б1): the location rules of the app. The server repeats every check
 * (migration 20261106210000, T56–T57); here — when the phone sends, when it asks, the hint and the office line.
 */
import { describe, expect, it, vi } from "vitest";

const calls: { kind: "rpc" | "from"; name: string; args?: unknown }[] = [];
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (t: string) => ({
      insert: (row: unknown) => { calls.push({ kind: "from", name: t, args: row }); return Promise.resolve({ error: null }); },
    }),
    rpc: (name: string, args: unknown) => { calls.push({ kind: "rpc", name, args }); return Promise.resolve({ data: null, error: null }); },
  },
}));

import { applyOp, sendVisitPoint } from "../src/cloud/ops";
import { normalizeDB } from "../src/data/normalize";
import { makeSeed } from "../src/data/seed";
import type { DB, Visit, VisitPoint, VisitStep } from "../src/data/types";
import {
  distanceM, isSharingStep, keepLast, lastPoint, milesOf, nearAddress, officeLines, shouldAskConsent, shouldShare, NEAR_M, OFFICE_WINDOW_MS, STALE_MS,
} from "../src/features/location";

const HOME = { lat: 34.1478, lng: -118.1445 }; // Pasadena
const visit = (step: VisitStep, assigneeIds: string[] = ["me"]): Visit =>
  ({ id: "v1", techId: assigneeIds[0] ?? null, assigneeIds, step }) as unknown as Visit;
const on = { allowed: true, on: true, ackAt: "2026-11-06T10:00:00Z" };
const NOW = Date.parse("2026-11-06T12:00:00Z");
const point = (over: Partial<VisitPoint> = {}): VisitPoint => ({ visitId: "v1", userId: "me", lat: HOME.lat, lng: HOME.lng, at: new Date(NOW - 3 * 60_000).toISOString(), ...over });

describe("when the phone sends a point", () => {
  it("only on the way and on site — the app steps on_site, working and signed are on site on the server", () => {
    expect((["en_route", "on_site", "working", "signed"] as VisitStep[]).every(isSharingStep)).toBe(true);
    expect((["scheduled", "paid", "done"] as VisitStep[]).some(isSharingStep)).toBe(false);
  });
  it("only with the company flag, the person's consent and on their own visit", () => {
    expect(shouldShare(on, visit("en_route"), "me")).toBe(true);
    expect(shouldShare({ ...on, allowed: false }, visit("en_route"), "me")).toBe(false);
    expect(shouldShare({ ...on, on: false }, visit("en_route"), "me")).toBe(false);
    expect(shouldShare(on, visit("en_route", ["mike"]), "me")).toBe(false);
    expect(shouldShare(on, visit("scheduled"), "me")).toBe(false);
    expect(shouldShare(undefined, visit("en_route"), "me")).toBe(false);
  });
  it("asks once, and never when the company flag is off (AB 1331)", () => {
    expect(shouldAskConsent({ allowed: true, on: false }, false)).toBe(true);
    expect(shouldAskConsent({ allowed: true, on: false }, true)).toBe(false);
    expect(shouldAskConsent({ allowed: false, on: false }, false)).toBe(false);
    expect(shouldAskConsent(on, false)).toBe(false);
  });
});

describe("the hint «You are at the address»", () => {
  it("within 150 m on the way, with a precise fix", () => {
    const near = { lat: HOME.lat + 0.001, lng: HOME.lng }; // ~111 m north
    expect(distanceM(HOME, near)).toBeGreaterThan(100);
    expect(distanceM(HOME, near)).toBeLessThan(NEAR_M);
    expect(nearAddress("en_route", { ...near, accuracyM: 20 }, HOME)).toBe(true);
    expect(nearAddress("en_route", { lat: HOME.lat + 0.002, lng: HOME.lng }, HOME)).toBe(false);
    expect(nearAddress("en_route", { ...near, accuracyM: 500 }, HOME)).toBe(false);
  });
  it("not once on site, not without an address on the map", () => {
    expect(nearAddress("on_site", HOME, HOME)).toBe(false);
    expect(nearAddress("en_route", HOME, undefined)).toBe(false);
    expect(nearAddress("en_route", null, HOME)).toBe(false);
  });
});

describe("what the office sees", () => {
  const db = (points: VisitPoint[]): Pick<DB, "visitPoints"> => ({ visitPoints: points });
  it("«2.1 mi from the address · 3 min ago» per person", () => {
    const far = point({ lat: HOME.lat + 0.03 }); // ~3.3 km
    const [line] = officeLines(db([far]), visit("en_route"), HOME, NOW);
    expect(line).toEqual({ userId: "me", miles: "2.1", minutesAgo: 3, stale: false });
  });
  it("no geo on the property: only the minutes", () => {
    expect(officeLines(db([point()]), visit("on_site"), undefined, NOW)[0].miles).toBeUndefined();
  });
  it("a point older than 30 min is «not updated for a while»; older than 12 h — none", () => {
    expect(officeLines(db([point({ at: new Date(NOW - STALE_MS - 60_000).toISOString() })]), visit("en_route"), HOME, NOW)[0].stale).toBe(true);
    expect(officeLines(db([point({ at: new Date(NOW - OFFICE_WINDOW_MS - 60_000).toISOString() })]), visit("en_route"), HOME, NOW)).toEqual([]);
  });
  it("nothing once the visit is done or not started", () => {
    expect(officeLines(db([point()]), visit("paid"), HOME, NOW)).toEqual([]);
    expect(officeLines(db([point()]), visit("scheduled"), HOME, NOW)).toEqual([]);
  });
  it("a person taken off the visit has no line", () => {
    expect(officeLines(db([point({ userId: "gone" })]), visit("en_route", ["me"]), HOME, NOW)).toEqual([]);
  });
  it("miles never read 0.0", () => {
    expect(milesOf(10)).toBe("0.1");
    expect(milesOf(1609.344 * 2.06)).toBe("2.1");
  });
});

describe("the phone keeps only the last point", () => {
  it("one per person and visit", () => {
    const a = point({ at: "2026-11-06T11:50:00Z" });
    const b = point({ at: "2026-11-06T11:55:00Z", lat: 1 });
    const kept = keepLast(keepLast([], a), b);
    expect(kept).toHaveLength(1);
    expect(lastPoint(kept, "v1", "me")?.lat).toBe(1);
  });
});

describe("the server calls", () => {
  it("consent goes to set_location_consent for my company", async () => {
    calls.length = 0;
    await applyOp({ k: "me.location", on: true }, "co-1", "u-1");
    expect(calls).toEqual([{ kind: "rpc", name: "set_location_consent", args: { p_company_id: "co-1", p_on: true } }]);
  });
  it("a point never carries user_id or company_id (the server sets them)", async () => {
    calls.length = 0;
    await sendVisitPoint({ visitId: "v1", lat: 1, lng: 2, at: "2026-11-06T12:00:00Z", source: "status_change" });
    expect(calls[0].name).toBe("user_locations");
    expect(Object.keys(calls[0].args as object).sort()).toEqual(["accuracy_m", "lat", "lng", "recorded_at", "source", "visit_id"]);
  });
});

describe("saved data", () => {
  it("old data reads as off, in the demo and in the cloud (AB 1331: off until the lawyer's answer)", () => {
    const old = { ...makeSeed() } as Partial<DB>;
    delete old.location;
    delete old.visitPoints;
    expect(normalizeDB(old as DB, "demo").location).toEqual({ allowed: false, on: false });
    expect(normalizeDB(old as DB, "cloud").location).toEqual({ allowed: false, on: false });
    expect(normalizeDB(old as DB, "demo").visitPoints).toEqual([]);
  });
});
