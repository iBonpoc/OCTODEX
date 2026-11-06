/**
 * The race «invitation ↔ consent» (7а-1; review #206 V1, map-keeper 7а-1 №1): the invitation page waits for the consent
 * check, a refusal for a missing consent keeps the link (no removeItem of the link before or in that branch), and the
 * session's consent goes to the server BEFORE the invitation is accepted.
 */
import { describe, it, expect } from "vitest";
import { inviteStep, joinInvite } from "@/features/inviteFlow";
import { legalTickets, PENDING_LEGAL_KEY, rememberAgreement, resolveLegal, type LegalStatus } from "@/features/legal";
import { peekInviteKey } from "@/features/team";

const TOKEN = "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
/** a store that records every call, in order */
function rec(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  const log: string[] = [];
  return {
    m,
    log,
    getItem: async (k: string) => (log.push(`get ${k}`), m.get(k) ?? null),
    setItem: async (k: string, v: string) => void (log.push(`set ${k}`), m.set(k, v)),
    removeItem: async (k: string) => void (log.push(`remove ${k}`), m.delete(k)),
  };
}
const OK: LegalStatus = { ok: true, terms: { current: "2026-11-06", accepted: true, ever: true }, privacy: { current: "2026-11-06", accepted: true, ever: true } };
const FIRST: LegalStatus = { ok: false, terms: { current: "2026-11-06", accepted: false, ever: false }, privacy: { current: "2026-11-06", accepted: false, ever: false } };

describe("the invitation page waits for the consent check", () => {
  it("signed out → sign in; the check not done → wait (no accept_invitation yet)", () => {
    expect(inviteStep({ signedIn: false, legalChecked: true, legal: "ok" })).toBe("signIn");
    expect(inviteStep({ signedIn: true, legalChecked: false, legal: "unknown" })).toBe("wait");
    expect(inviteStep({ signedIn: true, legalChecked: false, legal: "ok" })).toBe("wait");
  });
  it("missing consent → ask here; ok or unknown (no network: the server decides) → join", () => {
    expect(inviteStep({ signedIn: true, legalChecked: true, legal: "first" })).toBe("legal");
    expect(inviteStep({ signedIn: true, legalChecked: true, legal: "changed" })).toBe("legal");
    expect(inviteStep({ signedIn: true, legalChecked: true, legal: "ok" })).toBe("join");
    expect(inviteStep({ signedIn: true, legalChecked: true, legal: "unknown" })).toBe("join");
  });
});

describe("joining by the link", () => {
  const reload = async () => {};
  it("«legal not accepted» keeps the remembered link — no removeItem of the link at all", async () => {
    const s = rec({ [peekInviteKey]: TOKEN });
    const r = await joinInvite(undefined, { store: s, reload, accept: async () => { throw new Error("legal not accepted"); } });
    expect(r).toEqual({ kind: "legal" });
    expect(s.m.get(peekInviteKey)).toBe(TOKEN);
    expect(s.log.filter((l) => l === `remove ${peekInviteKey}`)).toEqual([]);
  });
  it("…then after the consent the same link joins and only then is wiped", async () => {
    const s = rec({ [peekInviteKey]: TOKEN });
    let consent = false;
    const accept = async (t: string) => {
      if (!consent) throw new Error("legal not accepted");
      expect(t).toBe(TOKEN);
    };
    expect((await joinInvite(undefined, { store: s, reload, accept })).kind).toBe("legal");
    consent = true;
    expect((await joinInvite(undefined, { store: s, reload, accept })).kind).toBe("joined");
    expect(s.m.has(peekInviteKey)).toBe(false);
  });
  it("a link in the address is remembered for the retry when the consent is missing", async () => {
    const s = rec();
    const r = await joinInvite(TOKEN, { store: s, reload, accept: async () => { throw new Error("legal not accepted"); } });
    expect(r.kind).toBe("legal");
    expect(s.m.get(peekInviteKey)).toBe(TOKEN);
  });
  it("a dead link is wiped and said in the app's words", async () => {
    const s = rec({ [peekInviteKey]: TOKEN });
    const r = await joinInvite(undefined, { store: s, reload, accept: async () => { throw new Error("the invitation has expired"); } });
    expect(r).toEqual({ kind: "error", key: "team.err.expired" });
    expect(s.m.has(peekInviteKey)).toBe(false);
    const old = await joinInvite(TOKEN, { store: rec(), reload, accept: async () => { throw new Error("legal version outdated"); } });
    expect(old).toEqual({ kind: "error", key: "legal.err.outdated" });
  });
  it("no link → noLink, nothing accepted", async () => {
    let called = false;
    const r = await joinInvite(undefined, { store: rec(), reload, accept: async () => void (called = true) });
    expect(r.kind).toBe("noLink");
    expect(called).toBe(false);
  });
});

describe("the session: the consent first, then the invitation", () => {
  it("a remembered tick of this email is accepted (not just asked), then wiped", async () => {
    const s = rec();
    await rememberAgreement(s, "new@a.test", new Date(Date.now()).toISOString());
    const calls: string[] = [];
    const st = await resolveLegal("new@a.test", { store: s, accept: async () => (calls.push("accept"), OK), status: async () => (calls.push("status"), FIRST) });
    expect(calls).toEqual(["accept"]);
    expect(st).toBe("ok");
    expect(s.m.has(PENDING_LEGAL_KEY)).toBe(false);
    // so the invitation page, which waits for this, joins
    expect(inviteStep({ signedIn: true, legalChecked: true, legal: st })).toBe("join");
  });
  it("no tick → only asked; no network → unknown and the tick stays", async () => {
    const s = rec();
    expect(await resolveLegal("a@a.test", { store: s, accept: async () => OK, status: async () => FIRST })).toBe("first");
    await rememberAgreement(s, "a@a.test");
    expect(await resolveLegal("a@a.test", { store: s, accept: async () => { throw new Error("Failed to fetch"); }, status: async () => FIRST })).toBe("unknown");
    expect(s.m.has(PENDING_LEGAL_KEY)).toBe(true);
  });
});

describe("answers out of order (review #206 M1)", () => {
  it("an old check's answer does not overwrite the newer accept", () => {
    const t = legalTickets();
    const check = t.take(); // a slow legal_status started first
    const accept = t.take(); // then «Принять»
    expect(t.isNewest(accept)).toBe(true);
    expect(t.isNewest(check)).toBe(false);
  });
});
