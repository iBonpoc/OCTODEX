/**
 * The edge function «send-push» (Пуши П3, docs/specs/27-push.md §4.5) — its pure handler with fakes:
 * only POST with the right x-push-key (constant time; no key configured → nobody gets in), batches of ≤ 100 messages,
 * the words in en / es / ru with no numbers, «$» or names, tickets → sent, DeviceNotRegistered → the phone goes off,
 * 429 / 5xx / network → retry, other errors → failed with a short code, receipts, and no token or text in the logs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  BATCH, TITLES, handlePush, message, sameKey, words, code,
  type ClaimRow, type ExpoMessage, type HttpAnswer, type PushDeps, type Ticket,
} from "../../../supabase/functions/send-push/handler";

const KEY = "k-0123456789abcdef-push";
const req = (o: { method?: string; key?: string | null } = {}) => ({
  method: o.method ?? "POST",
  header: (n: string) => (n.toLowerCase() === "x-push-key" ? (o.key === undefined ? KEY : o.key) : null),
});
const tok = (i: number) => `ExponentPushToken[t-${i}]`;
const row = (id: string, devs: number, kind = "payment.received", lang = "en"): ClaimRow => ({
  id, kind, route: "/invoice/abc",
  devices: Array.from({ length: devs }, (_, k) => ({ device_id: `${id}-d${k}`, token: tok(Number(id.replace(/\D/g, "") || 0) * 100 + k), lang })),
});
const okTickets = (msgs: ExpoMessage[]): HttpAnswer => ({ status: 200, body: { data: msgs.map((_, i) => ({ status: "ok", id: `tk-${i}-${msgs[i].to.slice(18, -1)}` })) } });

function fake(o: {
  queue?: ClaimRow[][];
  send?: (m: ExpoMessage[]) => Promise<HttpAnswer>;
  due?: Ticket[];
  receipts?: (ids: string[]) => Promise<HttpAnswer>;
  clock?: () => number;
} = {}) {
  const queue = [...(o.queue ?? [])];
  const calls = { finish: [] as { id: string; status: string; tickets: Ticket[] | null; error: string | null }[], done: [] as { checked: string[]; gone: string[] }[],
    batches: [] as ExpoMessage[][], claims: 0, receiptAsks: [] as string[][] };
  const logs: string[] = [];
  const d: PushDeps = {
    claim: async () => (calls.claims++, queue.shift() ?? []),
    finish: async (id, status, tickets, error) => void calls.finish.push({ id, status, tickets, error }),
    receiptsDue: async () => o.due ?? [],
    receiptsDone: async (checked, gone) => void calls.done.push({ checked, gone }),
    expoSend: async (m) => (calls.batches.push(m), (o.send ?? (async (x) => okTickets(x)))(m)),
    expoReceipts: async (ids) => (calls.receiptAsks.push(ids), (o.receipts ?? (async () => ({ status: 200, body: { data: {} } })))(ids)),
    now: o.clock,
    log: (m) => logs.push(m),
  };
  return { d, calls, logs };
}

describe("send-push: who may call it", () => {
  it("refuses a wrong, missing or short key with 401 and no details; GET is 405", async () => {
    for (const key of [null, "", "nope", KEY + "x", KEY.slice(0, -1)]) {
      const { d, calls } = fake({ queue: [[row("1", 1)]] });
      const r = await handlePush(req({ key }), KEY, d);
      expect(r.status).toBe(401);
      expect(r.body).toBe(JSON.stringify({ error: "unauthorized" }));
      expect(calls.claims).toBe(0);
    }
    const { d } = fake();
    expect((await handlePush(req({ method: "GET" }), KEY, d)).status).toBe(405);
  });
  it("lets nobody in when PUSH_FN_KEY is not set or too short", async () => {
    for (const fnKey of [undefined, "", "short-key"]) {
      const { d, calls } = fake();
      expect((await handlePush(req({ key: fnKey ?? "" }), fnKey, d)).status).toBe(401);
      expect(calls.claims).toBe(0);
    }
  });
  it("compares keys without stopping at the first different character", () => {
    expect(sameKey(KEY, KEY)).toBe(true);
    expect(sameKey("x" + KEY.slice(1), KEY)).toBe(false);
    expect(sameKey(KEY.slice(0, -1) + "x", KEY)).toBe(false);
    expect(sameKey(KEY + KEY, KEY)).toBe(false);
    expect(readFileSync(new URL("../../../supabase/functions/send-push/handler.ts", import.meta.url), "utf8")).not.toMatch(/given\s*===\s*expected/);
  });
  it("config.toml: verify_jwt = false for send-push only; release.yml deploys it", () => {
    const cfg = readFileSync(new URL("../../../supabase/config.toml", import.meta.url), "utf8");
    expect(cfg).toMatch(/\[functions\.send-push\]\s*\nverify_jwt = false/);
    expect(cfg).toMatch(/\[functions\.delete-account\]\s*\nverify_jwt = true/);
    const rel = readFileSync(new URL("../../../.github/workflows/release.yml", import.meta.url), "utf8");
    expect(rel).toMatch(/supabase functions deploy send-push --project-ref "\$PROJECT_REF" --yes/);
  });
});

describe("send-push: the words", () => {
  // every kind the queue allows (push_outbox_kind_check, the latest migration that sets it) has its words
  const migDir = new URL("../../../supabase/migrations/", import.meta.url);
  const mig = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => readFileSync(new URL(f, migDir), "utf8")).filter((t) => /push_outbox_kind_check\s+check/.test(t)).pop() ?? "";
  const kinds = [...(/push_outbox_kind_check\s+check \(kind in \(([^)]*)\)/.exec(mig)?.[1] ?? "").matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]);
  it("the queue's kinds are read from the latest migration that sets them", () => expect(kinds).toHaveLength(9));
  it("has en, es and ru for every kind of the queue, with no numbers, sums or names", () => {
    for (const k of kinds) {
      for (const l of ["en", "es", "ru"] as const) {
        const w = words(k, l);
        expect(TITLES[k][l]).toBeTruthy();
        expect(w.title + w.body).not.toMatch(/[0-9$€%@]/);
      }
    }
    expect(words("payment.received", "es").title).toBe("Pago recibido");
    expect(words("estimate.client_signed", "ru").title).toBe("Смета подписана");
    expect(words("payment.received", "de").title).toBe("Payment received");
    expect(words("unknown.kind", "en").title).toBe("New notification");
    expect(words("lead.assigned", "es").title).toBe("Cliente potencial asignado a ti");
    expect(words("estimate.viewed", "ru").title).toBe("Смету открыли");
    expect(words("lead.reminder", "en").title).toBe("Lead still waiting for a reply");
    expect(words("lead.escalation", "ru").title).toBe("Лид без ответа больше часа");
  });
  it("a message carries only the route — no amount, name or id other than the path", () => {
    const m = message(row("1", 1, "estimate.client_signed", "es"), { device_id: "d", token: tok(1), lang: "es" });
    expect(m).toEqual({ to: tok(1), title: "Presupuesto firmado", body: "Abre OCTODEX para verlo.", data: { route: "/invoice/abc" },
      sound: "default", channelId: "default", priority: "high" });
    const bad = message({ ...row("1", 1), route: "https://evil.test" }, { device_id: "d", token: tok(1), lang: "en" });
    expect(bad.data.route).toBe("/notifications");
  });
});

describe("send-push: sending", () => {
  it("sends in batches of at most 100 and marks every row sent with its tickets", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(String(i + 1), 5));   // 150 messages
    const { d, calls } = fake({ queue: [rows] });
    const r = await handlePush(req(), KEY, d);
    expect(r.status).toBe(200);
    expect(calls.batches.map((b) => b.length)).toEqual([BATCH, 50]);
    expect(calls.finish).toHaveLength(30);
    expect(calls.finish.every((f) => f.status === "sent" && f.tickets?.length === 5 && f.error === null)).toBe(true);
    expect(calls.finish[0].tickets?.[0].device_id).toBe("1-d0");
    expect(JSON.parse(r.body)).toMatchObject({ claimed: 30, messages: 150, sent: 30 });
  });
  it("keeps claiming while the queue gives full pages, then stops", async () => {
    const full = Array.from({ length: 100 }, (_, i) => row(String(i + 1), 1));
    const { d, calls } = fake({ queue: [full, [row("200", 1)]] });
    await handlePush(req(), KEY, d);
    expect(calls.claims).toBe(2);
    expect(calls.finish).toHaveLength(101);
  });
  it("stops after 20 s and leaves the rest for the next minute", async () => {
    let t = 0;
    const full = () => Array.from({ length: 100 }, (_, i) => row(String(i + 1), 1));
    const { d, calls } = fake({ queue: [full(), full(), full()], clock: () => t, send: async (m) => ((t += 15_000), okTickets(m)) });
    await handlePush(req(), KEY, d);
    expect(calls.claims).toBe(2);
  });
  it("DeviceNotRegistered switches the phone off; a row with no phone left is failed «not_registered»", async () => {
    const gone = { status: "error", message: "\"ExponentPushToken[t-100]\" is not a registered push notification recipient", details: { error: "DeviceNotRegistered", expoPushToken: tok(100) } };
    const { d, calls, logs } = fake({
      queue: [[row("1", 2), row("2", 1)]],
      send: async () => ({ status: 200, body: { data: [gone, { status: "ok", id: "tk-a" }, gone] } }),
    });
    await handlePush(req(), KEY, d);
    expect(calls.done).toEqual([{ checked: [], gone: ["1-d0", "2-d0"] }]);
    expect(calls.finish).toEqual([
      { id: "1", status: "sent", tickets: [{ ticket_id: "tk-a", device_id: "1-d1" }], error: null },
      { id: "2", status: "failed", tickets: null, error: "not_registered" },
    ]);
    expect(logs.join("\n")).not.toMatch(/PushToken|registered push/);
  });
  it("429, 5xx and a network error are retried; MessageRateExceeded too", async () => {
    for (const [send, err] of [
      [async () => ({ status: 429, body: null }), "http_429"],
      [async () => ({ status: 503, body: { errors: [{ message: "down" }] } }), "http_503"],
      [async () => { throw new Error("ECONNRESET ExponentPushToken[t-100]"); }, "network"],
      [async () => ({ status: 200, body: { data: [{ status: "error", message: "slow down", details: { error: "MessageRateExceeded" } }] } }), "expo:messagerateexceeded"],
    ] as const) {
      const { d, calls, logs } = fake({ queue: [[row("1", 1)]], send: send as (m: ExpoMessage[]) => Promise<HttpAnswer> });
      const r = await handlePush(req(), KEY, d);
      expect(r.status).toBe(200);
      expect(calls.finish).toEqual([{ id: "1", status: "retry", tickets: null, error: err }]);
      expect(logs.join("\n")).not.toMatch(/PushToken|ECONNRESET/);
    }
  });
  it("other errors fail the row with a short code — never Expo's message", async () => {
    const { d, calls } = fake({
      queue: [[row("1", 1), row("2", 1)]],
      send: async () => ({ status: 200, body: { data: [
        { status: "error", message: "\"ExponentPushToken[t-100]\" bad creds", details: { error: "InvalidCredentials" } },
        { status: "error", message: "boom" },
      ] } }),
    });
    await handlePush(req(), KEY, d);
    expect(calls.finish.map((f) => f.error)).toEqual(["expo:invalidcredentials", "expo"]);
    for (const f of calls.finish) expect(f.error).toMatch(/^[a-z0-9_.:-]{1,64}$/);
    const { d: d2, calls: c2 } = fake({ queue: [[row("1", 1)]], send: async () => ({ status: 400, body: { errors: [{ code: "VALIDATION_ERROR" }] } }) });
    await handlePush(req(), KEY, d2);
    expect(c2.finish).toEqual([{ id: "1", status: "failed", tickets: null, error: "http_400" }]);
    const { d: d3, calls: c3 } = fake({ queue: [[row("1", 2)]], send: async () => ({ status: 200, body: { data: [{ status: "ok", id: "x" }] } }) });
    await handlePush(req(), KEY, d3);
    expect(c3.finish[0]).toMatchObject({ status: "failed", error: "http_200" });   // the answer does not match the batch
    expect(code("expo", "Weird Name!/x")).toBe("expo:weirdnamex");
  });
  it("some phones reached, some to retry: a retry with the tickets of the reached ones (only the others get it again)", async () => {
    const { d, calls } = fake({
      queue: [[row("1", 3)]],
      send: async () => ({ status: 200, body: { data: [
        { status: "ok", id: "tk-a" },
        { status: "error", message: "slow", details: { error: "MessageRateExceeded" } },
        { status: "error", message: "bad", details: { error: "MismatchSenderId" } },
      ] } }),
    });
    const r = await handlePush(req(), KEY, d);
    expect(calls.finish).toEqual([{ id: "1", status: "retry", tickets: [{ ticket_id: "tk-a", device_id: "1-d0" }], error: "expo:messagerateexceeded" }]);
    expect(JSON.parse(r.body)).toMatchObject({ retry: 1, sent: 0 });
    // reached + a lasting error (no retry): sent to the reached ones
    const { d: d2, calls: c2 } = fake({
      queue: [[row("1", 2)]],
      send: async () => ({ status: 200, body: { data: [{ status: "ok", id: "tk-a" }, { status: "error", message: "x", details: { error: "MismatchSenderId" } }] } }),
    });
    await handlePush(req(), KEY, d2);
    expect(c2.finish).toEqual([{ id: "1", status: "sent", tickets: [{ ticket_id: "tk-a", device_id: "1-d0" }], error: null }]);
  });
  it("a database error on one row does not stop the others (the messages are already with Expo)", async () => {
    const { d, calls, logs } = fake({ queue: [[row("1", 1), row("2", 1), row("3", 1)]], due: [{ ticket_id: "a", device_id: "d1" }],
      receipts: async () => ({ status: 200, body: { data: { a: { status: "ok" } } } }) });
    const finish = d.finish;
    d.finish = async (id, ...rest) => { if (id === "2") throw new Error("rpc push_finish 08006"); return finish(id, ...rest); };
    const r = await handlePush(req(), KEY, d);
    expect(r.status).toBe(200);
    expect(calls.finish.map((f) => f.id)).toEqual(["1", "3"]);
    expect(calls.done).toEqual([{ checked: ["a"], gone: [] }]);   // the receipts are still checked
    expect(JSON.parse(r.body)).toMatchObject({ sent: 2, errors: 1 });
    expect(logs).toEqual(["send-push claimed=3 messages=3 sent=2 retry=0 failed=0 gone=0 receipts=1 errors=1"]);
    // the phones to switch off failed to be saved: the rows are still finished
    const gone = { status: "error", message: "x", details: { error: "DeviceNotRegistered" } };
    const { d: d2, calls: c2 } = fake({ queue: [[row("1", 1)]], send: async () => ({ status: 200, body: { data: [gone] } }) });
    d2.receiptsDone = async () => { throw new Error("rpc"); };
    expect((await handlePush(req(), KEY, d2)).status).toBe(200);
    expect(c2.finish).toEqual([{ id: "1", status: "failed", tickets: null, error: "not_registered" }]);
  });
  it("skips a token of a bad shape and does not send it", async () => {
    const r1: ClaimRow = { id: "1", kind: "lead.new", route: "/leads", devices: [{ device_id: "d", token: "not-a-token", lang: "en" }] };
    const { d, calls } = fake({ queue: [[r1]] });
    await handlePush(req(), KEY, d);
    expect(calls.batches).toHaveLength(0);
    expect(calls.finish).toEqual([{ id: "1", status: "failed", tickets: null, error: "no_device" }]);
  });
  it("a database error is 500 with counts only", async () => {
    const { d, logs } = fake();
    d.claim = async () => { throw new Error("rpc push_claim 42501"); };
    const r = await handlePush(req(), KEY, d);
    expect(r.status).toBe(500);
    expect(logs).toEqual(["send-push error claimed=0 messages=0 sent=0 retry=0 failed=0 gone=0 receipts=0 errors=0"]);
  });
});

describe("send-push: receipts", () => {
  it("marks the receipts that came and switches DeviceNotRegistered phones off", async () => {
    const due: Ticket[] = [{ ticket_id: "a", device_id: "d1" }, { ticket_id: "b", device_id: "d2" }, { ticket_id: "c", device_id: "d3" }];
    const { d, calls } = fake({
      due,
      receipts: async () => ({ status: 200, body: { data: {
        a: { status: "ok" },
        b: { status: "error", message: "\"ExponentPushToken[t-9]\" gone", details: { error: "DeviceNotRegistered" } },
      } } }),
    });
    const r = await handlePush(req(), KEY, d);
    expect(calls.receiptAsks).toEqual([["a", "b", "c"]]);
    expect(calls.done).toEqual([{ checked: ["a", "b"], gone: ["d2"] }]);   // «c» is not ready yet: asked again later
    expect(JSON.parse(r.body)).toMatchObject({ receipts: 2, gone: 1 });
  });
  it("a failed receipts request changes nothing", async () => {
    for (const receipts of [async () => ({ status: 502, body: null }), async () => { throw new Error("net"); }]) {
      const { d, calls } = fake({ due: [{ ticket_id: "a", device_id: "d1" }], receipts: receipts as (ids: string[]) => Promise<HttpAnswer> });
      expect((await handlePush(req(), KEY, d)).status).toBe(200);
      expect(calls.done).toEqual([]);
    }
  });
});

describe("send-push: logs", () => {
  it("logs one line of counts and never a token, a text or the key", async () => {
    const { d, logs } = fake({ queue: [[row("1", 2, "estimate.client_signed", "ru")]] });
    await handlePush(req(), KEY, d);
    expect(logs).toEqual(["send-push claimed=1 messages=2 sent=1 retry=0 failed=0 gone=0 receipts=0 errors=0"]);
    const all = logs.join("\n");
    expect(all).not.toContain(KEY);
    expect(all).not.toMatch(/PushToken|Смета|route/);
  });
  it("the Deno entry logs only through the handler and never prints secrets", () => {
    const src = readFileSync(new URL("../../../supabase/functions/send-push/index.ts", import.meta.url), "utf8");
    expect(src.match(/console\.\w+\(/g)).toEqual(["console.log("]);
    expect(src).toMatch(/log: \(m\) => console\.log\(m\)/);
    expect(src).not.toMatch(/console\.\w+\([^)]*(KEY|TOKEN|SERVICE)/);
  });
});
