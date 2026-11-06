/**
 * 7а-1 «Согласие с условиями» (docs/specs/19 §5): the editions in the app equal the server's, the gate's states, the
 * tick kept through sign-in, the server refusals in the app's words, what the app tells the server about itself.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  appVersionTag,
  gateFreePath,
  legalErrorKey,
  legalState,
  LEGAL_VERSIONS,
  peekAgreement,
  PENDING_LEGAL_KEY,
  platformTag,
  rememberAgreement,
} from "@/features/legal";

const MIG = join(__dirname, "..", "..", "..", "supabase", "migrations");

/** the last migration that (re)defines app.legal_current_version — its dates are the current editions */
function serverEditions(): Record<string, string> {
  const files = readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
  let body = "";
  for (const f of files) {
    const s = readFileSync(join(MIG, f), "utf8");
    const m = s.match(/create or replace function app\.legal_current_version[\s\S]*?\$\$;/);
    if (m) body = m[0];
  }
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/when '(\w+)' then date '(\d{4}-\d{2}-\d{2})'/g)) out[m[1]!] = m[2]!;
  return out;
}

const memory = () => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: async (k: string) => m.get(k) ?? null,
    setItem: async (k: string, v: string) => void m.set(k, v),
    removeItem: async (k: string) => void m.delete(k),
  };
};

describe("legal editions: the app shows what the server checks", () => {
  it("LEGAL_VERSIONS = app.legal_current_version() of the latest migration", () => {
    expect(serverEditions()).toEqual({ ...LEGAL_VERSIONS });
  });
});

describe("the gate's state from legal_status()", () => {
  it("no answer (offline, an old server) is unknown — the gate never blocks then", () => {
    expect(legalState(null)).toBe("unknown");
    expect(legalState(undefined)).toBe("unknown");
    expect(legalState({} as never)).toBe("unknown");
  });
  it("ok / the first time / a new edition", () => {
    const d = (accepted: boolean, ever: boolean) => ({ current: "2026-11-06", accepted, ever });
    expect(legalState({ ok: true, terms: d(true, true), privacy: d(true, true) })).toBe("ok");
    expect(legalState({ ok: false, terms: d(false, false), privacy: d(false, false) })).toBe("first");
    expect(legalState({ ok: false, terms: d(false, true), privacy: d(true, true) })).toBe("changed");
  });
  it("the gate stays off signing in, the documents, help and the client page", () => {
    for (const p of ["/auth/sign-in", "/auth/terms", "/auth/invite", "/legal/terms", "/legal/privacy", "/help", "/p/abc"]) expect(gateFreePath(p), p).toBe(true);
    for (const p of ["/", "/today", "/settings", "/helpdesk", "/plan", "/people"]) expect(gateFreePath(p), p).toBe(false);
  });
});

describe("the tick waits through sign-in", () => {
  it("is remembered with the editions and read back", async () => {
    const s = memory();
    expect(await peekAgreement(s)).toBeNull();
    await rememberAgreement(s, "2026-11-06T12:00:00Z");
    expect(JSON.parse(s.m.get(PENDING_LEGAL_KEY)!).versions).toEqual(LEGAL_VERSIONS);
    expect(await peekAgreement(s)).toEqual(LEGAL_VERSIONS);
  });
  it("a tick for another edition, or a broken value, is no tick", async () => {
    const s = memory();
    s.m.set(PENDING_LEGAL_KEY, JSON.stringify({ versions: { terms: "2025-01-01", privacy: LEGAL_VERSIONS.privacy } }));
    expect(await peekAgreement(s)).toBeNull();
    s.m.set(PENDING_LEGAL_KEY, "{not json");
    expect(await peekAgreement(s)).toBeNull();
  });
});

describe("server refusals → the app's words (rule 7)", () => {
  it("the consent is missing / the app is old", () => {
    expect(legalErrorKey("legal not accepted")).toBe("legal.err.needed");
    expect(legalErrorKey("ERROR: legal version outdated")).toBe("legal.err.outdated");
    expect(legalErrorKey("this invitation is for another email")).toBeNull();
    expect(legalErrorKey(null)).toBeNull();
  });
});

describe("what the app tells the server (the server checks ^[0-9A-Za-z.+ _-]{1,40}$)", () => {
  it("version+build, nothing else", () => {
    expect(appVersionTag("1.0.0", 214)).toBe("1.0.0+214");
    expect(appVersionTag("1.0.0\n<x>", 1)).toBe("1.0.0x+1");
    expect(appVersionTag("9".repeat(60), 1)).toHaveLength(40);
    expect(appVersionTag("()", 1)).toMatch(/^[0-9A-Za-z.+ _-]{1,40}$/);
  });
  it("a known platform only", () => {
    expect(platformTag("ios")).toBe("ios");
    expect(platformTag("android")).toBe("android");
    expect(platformTag("web")).toBe("web");
    expect(platformTag("windows")).toBe("web");
  });
});

describe("the edition date", () => {
  it("is a US calendar date with the year, whatever the time zone", async () => {
    const { editionLabel } = await import("@/features/legal");
    expect(editionLabel("2026-11-06")).toBe("November 6, 2026");
    expect(editionLabel("2027-01-01")).toBe("January 1, 2027");
    expect(editionLabel("bad")).toBe("bad");
  });
});
