/**
 * The edge function «lead-intake» (step 16, docs/specs/34-lead-intake.md §3, §3а) — its pure handler with fakes:
 * the page posts only from the app's origins and always gets the same answer after a minimum time; the event key is
 * built by the server; the IP comes from cf-connecting-ip (else the LAST x-forwarded-for hop) and is kept only as an
 * HMAC; bots, a too-fast fill and junk never reach the database as a lead; a webhook key works only in the header,
 * never from a browser; only known fields pass, cut to their limits; nothing of the request is logged.
 */
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONSENT_VERSION, MAX_BODY, MAX_FILL_MS, ipKey, MIN_ANSWER_MS, MIN_FILL_MS, canonical, cleanPayload, clientIp, handleIntake,
  type IntakeCall, type IntakeDeps, type Req,
} from "../../../supabase/functions/lead-intake/handler";

const SITE = "https://octodex.expo.app";
const FORM = `f${"a".repeat(32)}`;
const KEY = `gxk_${"b".repeat(64)}`;
const NOW = 1_800_000_000_000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function req(o: { method?: string; url?: string; headers?: Record<string, string>; body?: unknown } = {}): Req {
  const h: Record<string, string> = { origin: SITE, "cf-connecting-ip": "203.0.113.7", ...o.headers };
  for (const k of Object.keys(h)) if (h[k] === "") delete h[k];
  const raw = typeof o.body === "string" ? o.body : JSON.stringify(o.body ?? {});
  return {
    method: o.method ?? "POST",
    url: o.url ?? "https://x.supabase.co/functions/v1/lead-intake",
    header: (n) => h[n.toLowerCase()] ?? null,
    text: async () => raw,
  };
}
const form = (extra: Record<string, unknown> = {}) => ({
  t: FORM, name: "Ann Lee", phone: "(626) 555-0113", message: "Clean gutters", filled_ms: 10_000,
  nonce: "0b6c8d2e-1f3a-4b5c-8d7e-9f0a1b2c3d4e", ...extra,
});

function deps(o: { status?: string; throws?: boolean; captcha?: { success: boolean; hostname?: string; action?: string } | "throw"; info?: Record<string, unknown> } = {}) {
  const calls: IntakeCall[] = [];
  const logs: string[] = [];
  const waits: number[] = [];
  const d: IntakeDeps = {
    submit: async (c) => {
      calls.push(c);
      if (o.throws) throw new Error("rpc intake_submit 57014");
      return { status: o.status ?? "accepted" };
    },
    formInfo: async (h) => (h === sha(FORM) ? (o.info ?? { company: "Acme Gutters" }) : {}),
    verifyCaptcha: async () => {
      if (o.captcha === "throw") throw new Error("net");
      return o.captcha ?? { success: true, hostname: "octodex.expo.app", action: "lead" };
    },
    sha256: async (s) => sha(s),
    hmac: async (s) => createHmac("sha256", "secret").update(s).digest("hex"),
    allowedOrigin: (x) => /^https:\/\/octodex(--[a-z0-9-]+)?\.expo\.app$/.test(x),
    ipHeaders: ["cf-connecting-ip", "x-forwarded-for"],
    now: () => NOW,
    wait: async (ms) => {
      waits.push(ms);
    },
    log: (m) => logs.push(m),
  };
  return { d, calls, logs, waits };
}

describe("lead-intake: the page's request", () => {
  it("a good request reaches the database as a form with the token's hash, the IP's HMAC and no bot", async () => {
    const { d, calls } = deps();
    const r = await handleIntake(req({ body: form() }), d);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ ok: true });
    expect(r.headers["Access-Control-Allow-Origin"]).toBe(SITE);
    expect(calls).toHaveLength(1);
    const c = calls[0];
    expect(c.kind).toBe("form");
    expect(c.tokenHash).toBe(sha(FORM));
    expect(c.ipHash).toBe(createHmac("sha256", "secret").update("203.0.113.7").digest("hex"));
    expect(c.ipHash).not.toBe(sha("203.0.113.7")); // a plain hash of an IPv4 is enumerable
    expect(c.checks).toEqual({ bot: "false", captcha: "none", consent: "false" }); // no captcha token sent
    expect(c.payload).toEqual({ name: "Ann Lee", phone: "(626) 555-0113", message: "Clean gutters" });
    expect(c.payloadHash).toBe(sha(canonical(c.payload)));
  });
  it("whatever the database decided, the page gets the same answer after the same minimum time", async () => {
    const answers = new Set<string>();
    for (const status of ["accepted", "merged", "held", "rejected", "invalid", "unknown"]) {
      const { d, waits } = deps({ status });
      const r = await handleIntake(req({ body: form() }), d);
      answers.add(`${r.status} ${r.body}`);
      expect(waits).toEqual([MIN_ANSWER_MS]);
    }
    expect([...answers]).toEqual(['200 {"ok":true}']);
  });
  it("the event key is the server's: the same send twice is one key, another body is another key, the page cannot choose it", async () => {
    const a = deps();
    await handleIntake(req({ body: form() }), a.d);
    await handleIntake(req({ body: form({ event_key: "victim-key" }) }), a.d);
    await handleIntake(req({ body: form({ message: "other" }) }), a.d);
    const [k1, k2, k3] = a.calls.map((c) => c.eventKey);
    expect(k1).toMatch(/^f:[0-9a-f]{64}$/);
    expect(k2).toBe(k1); // a field named event_key is not a field
    expect(k3).not.toBe(k1);
  });
  it("only the app's own origins post; a foreign site or no origin is refused before the database", async () => {
    for (const origin of ["https://evil.example", "https://octodex.expo.app.evil.com", "http://octodex.expo.app", ""]) {
      const { d, calls } = deps();
      const r = await handleIntake(req({ headers: { origin }, body: form() }), d);
      expect(r.status, origin).toBe(403);
      expect(calls).toHaveLength(0);
    }
    const prev = deps();
    expect((await handleIntake(req({ headers: { origin: "https://octodex--abc123.expo.app" }, body: form() }), prev.d)).status).toBe(200);
  });
  it("a honeypot, a fill faster than 3 s or no opening time — a bot (kept for the limits, never a lead)", async () => {
    for (const extra of [{ website: "http://spam" }, { filled_ms: MIN_FILL_MS - 1 }, { filled_ms: undefined }, { filled_ms: -5 }, { filled_ms: MAX_FILL_MS + 1 }]) {
      const { d, calls } = deps();
      await handleIntake(req({ body: form(extra) }), d);
      expect(calls[0].checks.bot, JSON.stringify(extra)).toBe("true");
    }
  });
  it("the captcha: verified on the server (success, our hostname, our action); none without a token", async () => {
    const cases: [IntakeDeps["verifyCaptcha"] extends unknown ? Parameters<typeof deps>[0] : never, Record<string, unknown>, string][] = [
      [{}, { captcha: "tok" }, "ok"],
      [{ captcha: { success: false } }, { captcha: "tok" }, "fail"],
      [{ captcha: { success: true, hostname: "evil.example" } }, { captcha: "tok" }, "fail"],
      [{ captcha: { success: true, hostname: "octodex.expo.app", action: "other" } }, { captcha: "tok" }, "fail"],
      [{ captcha: { success: true } }, { captcha: "tok" }, "fail"], // no hostname / action — not ours
      [{ captcha: { success: true, hostname: "octodex--pr421.expo.app", action: "lead" } }, { captcha: "tok" }, "ok"], // a PR preview
      [{ captcha: "throw" }, { captcha: "tok" }, "fail"],
      [{}, {}, "none"],
    ];
    for (const [o, extra, want] of cases) {
      const { d, calls } = deps(o);
      await handleIntake(req({ body: form(extra) }), d);
      expect(calls[0].checks.captcha, JSON.stringify(o)).toBe(want);
    }
  });
  it("consent only from a real true, with the text's version", async () => {
    for (const [v, want] of [[true, "true"], ["true", "false"], [1, "false"], [undefined, "false"]] as const) {
      const { d, calls } = deps();
      await handleIntake(req({ body: form({ consent: v }) }), d);
      expect(calls[0].checks.consent, String(v)).toBe(want);
      expect(calls[0].checks.consent_version).toBe(want === "true" ? CONSENT_VERSION : undefined);
    }
  });
  it("a bad token, junk or a body over 16 KB — 400, no database call", async () => {
    for (const body of ['{"t":"nope"}', "not json", "[]", JSON.stringify(form({ t: KEY })), JSON.stringify(form({ message: "x".repeat(MAX_BODY) }))]) {
      const { d, calls } = deps();
      const r = await handleIntake(req({ body }), d);
      expect(r.status, body.slice(0, 20)).toBe(400);
      expect(calls).toHaveLength(0);
    }
  });
  it("a page sets no price or provider; only known fields, cut, no control characters", () => {
    const p = cleanPayload({ name: ` A\u0000nn${"x".repeat(200)}`, cost_cents: "100", provider: "thumbtack", is_admin: true, phone: 6265550113,
      state: "California", category_id: "not-a-uuid", utm: { utm_source: "gbp", evil: "x" } }, "form");
    expect(p).toEqual({ name: `A nn${"x".repeat(116)}`, phone: "6265550113", utm: { utm_source: "gbp" } });
    expect(cleanPayload({ state: "ca" }, "form")).toEqual({ state: "CA" });
    expect(cleanPayload({ cost_cents: "3200", provider: "thumbtack", provider_ref: "tt-1" }, "webhook")).toEqual({ cost_cents: "3200", provider: "thumbtack", provider_ref: "tt-1" });
    expect(canonical({ phone: "1", name: "a" })).toBe(canonical({ name: "a", phone: "1" }));
  });
  it("the database fails — 503 after the same minimum time, no detail, nothing of the request logged", async () => {
    const { d, logs, waits } = deps({ throws: true });
    const r = await handleIntake(req({ body: form() }), d);
    expect(r.status).toBe(503);
    expect(JSON.parse(r.body)).toEqual({ ok: false, code: "busy" });
    expect(waits).toEqual([MIN_ANSWER_MS]);
    expect(logs.join(" ")).not.toMatch(/626|Ann|203\.0|57014/);
  });
});

describe("lead-intake: the client's IP", () => {
  const r = (h: Record<string, string>) => req({ headers: { "cf-connecting-ip": "", ...h } });
  it("cf-connecting-ip first; else the LAST x-forwarded-for hop — a forged first one changes nothing", () => {
    expect(clientIp(r({ "cf-connecting-ip": "198.51.100.1", "x-forwarded-for": "1.2.3.4" }), ["cf-connecting-ip", "x-forwarded-for"])).toBe("198.51.100.1");
    expect(clientIp(r({ "x-forwarded-for": "6.6.6.6, 198.51.100.2" }), ["cf-connecting-ip", "x-forwarded-for"])).toBe("198.51.100.2");
    expect(clientIp(r({ "x-forwarded-for": "7.7.7.7, 198.51.100.2" }), ["cf-connecting-ip", "x-forwarded-for"])).toBe("198.51.100.2");
    expect(clientIp(r({ "x-forwarded-for": "junk<script>" }), ["cf-connecting-ip", "x-forwarded-for"])).toBeNull();
    expect(clientIp(r({}), ["cf-connecting-ip", "x-forwarded-for"])).toBeNull();
  });
  it("no secret for the HMAC — «busy» and a log line, never «sent» (the database would refuse every request)", async () => {
    const { d, calls, logs } = deps();
    d.hmac = null;
    const r = await handleIntake(req({ body: form() }), d);
    expect(r.status).toBe(503);
    expect(calls).toHaveLength(0);
    expect(logs.join(" ")).toMatch(/no ip secret/);
  });
  it("an IPv6 client is counted by its /64 network; IPv4 as is", () => {
    expect(ipKey("2001:db8:aa:bb:1:2:3:4")).toBe(ipKey("2001:0DB8:aa:bb:ffff::1"));
    expect(ipKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipKey("2001:db8:aa:bc::1")).not.toBe(ipKey("2001:db8:aa:bb::1"));
    expect(ipKey("203.0.113.7")).toBe("203.0.113.7");
  });
  it("a phone whose clock is 10 minutes ahead is still a person (the fill time is the page's own)", async () => {
    const { d, calls } = deps();
    d.now = () => NOW - 10 * 60_000;
    await handleIntake(req({ body: form() }), d);
    expect(calls[0].checks.bot).toBe("false");
  });
});

describe("lead-intake: the page reads its form", () => {
  it("GET ?t= → the form; unknown, malformed or switched off → the same {form: null}", async () => {
    const { d } = deps();
    const ok = await handleIntake(req({ method: "GET", url: `https://x/functions/v1/lead-intake?t=${FORM}` }), d);
    expect(JSON.parse(ok.body)).toEqual({ ok: true, form: { company: "Acme Gutters" } });
    const bodies = new Set<string>();
    for (const t of [`f${"c".repeat(32)}`, "nope", KEY, ""]) {
      const r = await handleIntake(req({ method: "GET", url: `https://x/functions/v1/lead-intake?t=${t}` }), d);
      bodies.add(`${r.status} ${r.body}`);
    }
    expect([...bodies]).toEqual(['200 {"ok":true,"form":null}']);
  });
  it("a GET without our origin → 403; ?status=1 says whether the secrets are set (names only)", async () => {
    const { d } = deps();
    expect((await handleIntake(req({ method: "GET", url: `https://x/?t=${FORM}`, headers: { origin: "" } }), d)).status).toBe(403);
    const st = await handleIntake(req({ method: "GET", url: "https://x/?status=1" }), d);
    expect(JSON.parse(st.body)).toEqual({ ok: true, ipSecret: true, captchaSecret: true });
    d.hmac = null;
    d.verifyCaptcha = null;
    expect(JSON.parse((await handleIntake(req({ method: "GET", url: "https://x/?status=1" }), d)).body)).toEqual({ ok: true, ipSecret: false, captchaSecret: false });
  });
  it("a refused request is logged by its outcome only", async () => {
    const { d, logs } = deps({ status: "rejected" });
    await handleIntake(req({ body: form({ website: "x" }) }), d);
    expect(logs).toEqual(["intake: form rejected bot"]);
  });
  it("OPTIONS: CORS only for our origins", async () => {
    const { d } = deps();
    expect((await handleIntake(req({ method: "OPTIONS" }), d)).status).toBe(204);
    expect((await handleIntake(req({ method: "OPTIONS", headers: { origin: "https://evil.example" } }), d)).status).toBe(403);
    expect((await handleIntake(req({ method: "PUT" }), d)).status).toBe(405);
  });
});

describe("lead-intake: the webhook", () => {
  const hook = (o: { body?: unknown; headers?: Record<string, string> } = {}) =>
    req({ headers: { origin: "", "cf-connecting-ip": "", authorization: `Bearer ${KEY}`, ...o.headers }, body: o.body ?? { phone: "(213) 555-0117", event_id: "zap-1", provider: "google_lsa", cost_cents: 3200 } });
  it("the key in the header, the event id from the body (or the body's hash), no IP, no CORS", async () => {
    const { d, calls } = deps();
    const r = await handleIntake(hook(), d);
    expect(r.status).toBe(200);
    expect(r.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(calls[0]).toMatchObject({ kind: "webhook", tokenHash: sha(KEY), eventKey: "e:zap-1", ipHash: null, payload: { provider: "google_lsa", cost_cents: "3200" } });
    const n = deps();
    await handleIntake(hook({ body: { phone: "1" } }), n.d);
    expect(n.calls[0].eventKey).toBe(`h:${n.calls[0].payloadHash}`);
  });
  it("a wrong key → 401; a key from a browser (with an Origin) → 403, no database call for it", async () => {
    const bad = deps({ status: "unknown" });
    expect((await handleIntake(hook(), bad.d)).status).toBe(401);
    for (const headers of [{ authorization: "Bearer gxk_short" }, { origin: SITE }] as Record<string, string>[]) {
      const { d, calls } = deps();
      const r = await handleIntake(hook({ headers }), d);
      expect([401, 403]).toContain(r.status);
      expect(calls).toHaveLength(0);
    }
  });
  it("a long event id is cut to fit the database's key (≤ 200 with its prefix)", async () => {
    const { d, calls } = deps();
    await handleIntake(hook({ body: { phone: "1", event_id: "z".repeat(500) } }), d);
    expect(calls[0].eventKey.length).toBe(200);
  });
  it("invalid → 422, a database failure → 503", async () => {
    expect((await handleIntake(hook(), deps({ status: "invalid" }).d)).status).toBe(422);
    expect((await handleIntake(hook(), deps({ throws: true }).d)).status).toBe(503);
  });
});

describe("lead-intake: the deployment", () => {
  it("config.toml: verify_jwt = false; release.yml deploys it; index.ts logs nothing of the request", () => {
    const cfg = readFileSync(new URL("../../../supabase/config.toml", import.meta.url), "utf8");
    expect(cfg).toMatch(/\[functions\.lead-intake\]\s*\nverify_jwt = false/);
    const rel = readFileSync(new URL("../../../.github/workflows/release.yml", import.meta.url), "utf8");
    expect(rel).toMatch(/supabase functions deploy lead-intake --project-ref "\$PROJECT_REF" --yes/);
    const src = readFileSync(new URL("../../../supabase/functions/lead-intake/index.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/console\.(log|warn|error)\([^)]*(req|body|payload|ip)/i);
    expect(src).toMatch(/"cf-connecting-ip", "x-forwarded-for"/);
  });
});
