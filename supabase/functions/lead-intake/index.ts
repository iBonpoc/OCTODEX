// lead-intake — the Deno entry of the edge function (step 16, docs/specs/34-lead-intake.md §3). The logic is in handler.ts.
// Deployed by .github/workflows/release.yml after the migrations; verify_jwt = false (supabase/config.toml): a homeowner's
// browser and Zapier have no JWT. Secrets of the function (Supabase → Edge Functions → Secrets), never logged:
// INTAKE_IP_SECRET (HMAC of the IP; without it no IP is kept and the page's requests are refused) and TURNSTILE_SECRET
// (Cloudflare Turnstile; without it the captcha is «none» and a form that requires it refuses everything).
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { SITE_ORIGIN, handleIntake, type IntakeCall } from "./handler.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IP_SECRET = Deno.env.get("INTAKE_IP_SECRET");
const TURNSTILE = Deno.env.get("TURNSTILE_SECRET");
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
// service_role calls (public.intake_submit / intake_form grant EXECUTE to service_role only — T120); the error text of the
// database is never passed on, only its code
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`rpc ${name} ${error.code ?? ""}`);
  return data as T;
}
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const hmacKey = IP_SECRET
  ? crypto.subtle.importKey("raw", enc.encode(IP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  : null;

Deno.serve(async (req: Request) => {
  try {
    return await serve(req);
  } catch {
    // anything unexpected: «busy», no detail, nothing of the request in the log
    console.warn("intake: unexpected error");
    return new Response(JSON.stringify({ ok: false, code: "busy" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
});

async function serve(req: Request): Promise<Response> {
  const res = await handleIntake(
    { method: req.method, url: req.url, header: (n) => req.headers.get(n), text: () => req.text() },
    {
      submit: (c: IntakeCall) =>
        rpc<{ status?: string }>("intake_submit", {
          p_kind: c.kind, p_token_hash: c.tokenHash, p_event_key: c.eventKey, p_payload_hash: c.payloadHash,
          p_ip_hash: c.ipHash, p_payload: c.payload, p_checks: c.checks,
        }),
      formInfo: async (h) => (await rpc<Record<string, unknown> | null>("intake_form", { p_token_hash: h })) ?? {},
      verifyCaptcha: TURNSTILE
        ? async (token, ip) => {
          const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ secret: TURNSTILE, response: token, ...(ip ? { remoteip: ip } : {}) }),
            signal: AbortSignal.timeout(5000),
          });
          return (await r.json()) as { success: boolean; hostname?: string; action?: string };
        }
        : null,
      sha256: async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s))),
      hmac: hmacKey ? async (s) => hex(await crypto.subtle.sign("HMAC", await hmacKey, enc.encode(s))) : null,
      // the app's own sites and their PR previews (handler.ts SITE_ORIGIN); nothing else posts a request
      allowedOrigin: (o) => SITE_ORIGIN.test(o),
      // only Cloudflare's header: x-forwarded-for may carry what the client wrote (director's check of #421)
      ipHeaders: ["cf-connecting-ip"],
      now: () => Date.now(),
      wait: (ms) => new Promise((r) => setTimeout(r, ms)),
      log: (m) => console.warn(m),
    },
  );
  return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: res.headers });
}
