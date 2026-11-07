/**
 * send-push — sends the queue of push notifications to Expo (Пуши П3, docs/specs/27-push.md §4.4–4.5). Pure: no Deno,
 * no network — the Deno entry (index.ts) passes the real clients; vitest passes fakes (apps/mobile/test/sendPushFn.test.ts).
 *
 * pg_cron wakes it once a minute (app.push_kick → one POST with the header x-push-key). verify_jwt = false: the only key
 * is PUSH_FN_KEY, compared in constant time; anything else is 401 with no details.
 * 1) public.push_claim(100) → rows with the person's phones (looked up at sending time, checked again in the database);
 * 2) the words come from the kind and the phone's language (en / es / ru) — never sums, names or addresses (Apple 4.5.4);
 * 3) POST https://exp.host/--/api/v2/push/send in batches of ≤ 100 messages (Authorization: Bearer EXPO_ACCESS_TOKEN —
 *    enhanced push security);
 * 4) a ticket ok → push_finish(sent); DeviceNotRegistered → the phone goes off; 429 / 5xx / network / rate → retry
 *    (with the tickets of the phones reached: the retry goes to the others only); any other error → failed (a code only);
 *    a database error on one row does not stop the others;
 * 5) receipts of tickets older than 15 min (push_receipts_due / done).
 * Logs carry counts only: never a token, a text or an answer of Expo (its messages quote the token).
 * One call works ≤ 20 s; what is left waits for the next minute.
 */

// ---- the database and Expo, as the Deno entry gives them ---------------------------------------------------------------
export interface ClaimDevice {
  device_id: string;
  token: string;
  lang: string;
}
export interface ClaimRow {
  id: string;
  kind: string;
  route: string;
  devices: ClaimDevice[];
}
export interface Ticket {
  ticket_id: string;
  device_id: string;
}
export interface HttpAnswer {
  status: number;
  body: unknown;
}
export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: { route: string };
  sound: "default";
  channelId: "default";
  priority: "high";
}
export interface PushDeps {
  claim: (limit: number) => Promise<ClaimRow[]>;
  finish: (id: string, status: "sent" | "retry" | "failed", tickets: Ticket[] | null, error: string | null) => Promise<void>;
  receiptsDue: (limit: number) => Promise<Ticket[]>;
  receiptsDone: (checked: string[], gone: string[]) => Promise<void>;
  /** POST /push/send; throws on a network error */
  expoSend: (messages: ExpoMessage[]) => Promise<HttpAnswer>;
  /** POST /push/getReceipts {ids}; throws on a network error */
  expoReceipts: (ids: string[]) => Promise<HttpAnswer>;
  now?: () => number;
  log?: (msg: string) => void;
}
export interface Req {
  method: string;
  header: (name: string) => string | null;
}
export interface Res {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/** Expo takes up to 100 messages in one request */
export const BATCH = 100;
/** rows taken from the queue at once */
export const CLAIM = 100;
/** receipts asked at once (Expo allows 1000 ids) */
export const RECEIPTS = 300;
/** one call works not longer than this */
export const BUDGET_MS = 20_000;
/** the shortest key accepted (the operator puts a long random one) */
export const MIN_KEY = 16;

// ---- the words (§4.3): no sums, names or addresses; the phone's interface language ---------------------------------------
export type Lang = "en" | "es" | "ru";
const OPEN: Record<Lang, string> = {
  en: "Open OCTODEX to see it.",
  es: "Abre OCTODEX para verlo.",
  ru: "Откройте OCTODEX, чтобы посмотреть.",
};
export const TITLES: Record<string, Record<Lang, string>> = {
  "estimate.client_signed": { en: "Estimate signed", es: "Presupuesto firmado", ru: "Смета подписана" },
  "payment.received": { en: "Payment received", es: "Pago recibido", ru: "Оплата получена" },
  "visit.assigned": { en: "New visit assigned", es: "Nueva visita asignada", ru: "Назначен новый выезд" },
  "visit.rescheduled": { en: "Visit rescheduled", es: "Visita reprogramada", ru: "Выезд перенесён" },
  "lead.new": { en: "New lead", es: "Nuevo cliente potencial", ru: "Новый лид" },
  "lead.assigned": { en: "Lead assigned to you", es: "Cliente potencial asignado a ti", ru: "Вам назначен лид" },
  "estimate.viewed": { en: "Estimate opened", es: "Presupuesto abierto", ru: "Смету открыли" },
};
const FALLBACK: Record<Lang, string> = { en: "New notification", es: "Nueva notificación", ru: "Новое уведомление" };

export function words(kind: string, lang: string): { title: string; body: string } {
  const l: Lang = lang === "es" || lang === "ru" ? lang : "en";
  return { title: TITLES[kind]?.[l] ?? FALLBACK[l], body: OPEN[l] };
}
const ROUTE = /^\/[A-Za-z0-9/_-]{0,199}$/;
const TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/;
const TICKET = /^[A-Za-z0-9_-]{1,64}$/;

export function message(row: ClaimRow, dev: ClaimDevice): ExpoMessage {
  const w = words(row.kind, dev.lang);
  return {
    to: dev.token,
    title: w.title,
    body: w.body,
    data: { route: ROUTE.test(row.route) ? row.route : "/notifications" },
    sound: "default",
    channelId: "default",
    priority: "high",
  };
}

// ---- the key: constant time --------------------------------------------------------------------------------------------
export function sameKey(given: string | null, expected: string | undefined | null): boolean {
  if (!expected || expected.length < MIN_KEY || given == null) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

// ---- one answer of Expo to one message ---------------------------------------------------------------------------------
type Outcome = { kind: "ok"; ticket: string } | { kind: "gone" } | { kind: "retry"; code: string } | { kind: "fail"; code: string };

/** a short code for the database (push_finish keeps [a-z0-9_.:-]{1,64}); never Expo's message (it quotes the token) */
export function code(prefix: string, name: unknown): string {
  const n = typeof name === "string" ? name.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 40) : "";
  return n ? `${prefix}:${n}` : prefix;
}

function ticketOutcome(t: unknown): Outcome {
  if (!t || typeof t !== "object") return { kind: "fail", code: "expo:bad_answer" };
  const o = t as { status?: unknown; id?: unknown; details?: { error?: unknown } };
  if (o.status === "ok" && typeof o.id === "string" && TICKET.test(o.id)) return { kind: "ok", ticket: o.id };
  const err = o.details?.error;
  if (err === "DeviceNotRegistered") return { kind: "gone" };
  if (err === "MessageRateExceeded") return { kind: "retry", code: "expo:messagerateexceeded" };
  return { kind: "fail", code: code("expo", err) };
}

function batchOutcomes(ans: HttpAnswer | null, n: number): Outcome[] {
  if (ans === null) return Array.from({ length: n }, () => ({ kind: "retry", code: "network" }) as Outcome);
  if (ans.status === 429 || ans.status >= 500) return Array.from({ length: n }, () => ({ kind: "retry", code: `http_${ans.status}` }) as Outcome);
  const data = (ans.body as { data?: unknown } | null)?.data;
  if (ans.status !== 200 || !Array.isArray(data) || data.length !== n) {
    return Array.from({ length: n }, () => ({ kind: "fail", code: `http_${ans.status}` }) as Outcome);
  }
  return data.map(ticketOutcome);
}

export interface Counts {
  claimed: number;
  messages: number;
  sent: number;
  retry: number;
  failed: number;
  gone: number;
  receipts: number;
  /** database errors after Expo took the messages (the row stays «sending»; push_claim brings it back in 10 min) */
  errors: number;
}

/** one round: the rows of one claim → Expo → push_finish */
export async function sendRows(rows: ClaimRow[], deps: PushDeps, counts: Counts): Promise<void> {
  const items: { row: number; dev: ClaimDevice; msg: ExpoMessage }[] = [];
  rows.forEach((row, i) => {
    for (const dev of row.devices ?? []) {
      if (typeof dev?.token === "string" && TOKEN.test(dev.token)) items.push({ row: i, dev, msg: message(row, dev) });
    }
  });
  const outcomes: Outcome[] = [];
  for (let at = 0; at < items.length; at += BATCH) {
    const part = items.slice(at, at + BATCH);
    let ans: HttpAnswer | null;
    try {
      ans = await deps.expoSend(part.map((x) => x.msg));
    } catch {
      ans = null;
    }
    outcomes.push(...batchOutcomes(ans, part.length));
  }
  counts.messages += items.length;
  const gone: string[] = [];
  const perRow = rows.map(() => ({ tickets: [] as Ticket[], retry: null as string | null, fail: null as string | null, gone: 0, total: 0 }));
  items.forEach((it, k) => {
    const o = outcomes[k];
    const r = perRow[it.row];
    r.total++;
    if (o.kind === "ok") r.tickets.push({ ticket_id: o.ticket, device_id: it.dev.device_id });
    else if (o.kind === "gone") {
      r.gone++;
      gone.push(it.dev.device_id);
    } else if (o.kind === "retry") r.retry ??= o.code;
    else r.fail ??= o.code;
  });
  // the messages are already with Expo: a database error on one row must not stop the others (security-check #287 №2) —
  // else the rest stay «sending», come back after 10 min and the people get the push twice
  if (gone.length) {
    try {
      await deps.receiptsDone([], gone);
      counts.gone += gone.length;
    } catch {
      counts.errors++;
    }
  }
  for (let i = 0; i < rows.length; i++) {
    const r = perRow[i];
    try {
      if (r.retry) {
        // only the phones not reached are tried again: the tickets of the reached ones are kept (push_claim skips them)
        await deps.finish(rows[i].id, "retry", r.tickets.length ? r.tickets : null, r.retry);
        counts.retry++;
      } else if (r.tickets.length) {
        await deps.finish(rows[i].id, "sent", r.tickets, null);
        counts.sent++;
      } else {
        const why = r.fail ?? (r.gone && r.gone === r.total ? "not_registered" : "no_device");
        await deps.finish(rows[i].id, "failed", null, why);
        counts.failed++;
      }
    } catch {
      counts.errors++;
    }
  }
}

/** receipts of tickets older than 15 min: checked ones are marked, DeviceNotRegistered phones go off */
export async function checkReceipts(deps: PushDeps, counts: Counts): Promise<void> {
  const due = await deps.receiptsDue(RECEIPTS);
  if (!due.length) return;
  let ans: HttpAnswer;
  try {
    ans = await deps.expoReceipts(due.map((t) => t.ticket_id));
  } catch {
    return; // the next minute asks again
  }
  const data = (ans.body as { data?: unknown } | null)?.data;
  if (ans.status !== 200 || !data || typeof data !== "object") return;
  const map = data as Record<string, { status?: unknown; details?: { error?: unknown } } | undefined>;
  const checked: string[] = [];
  const gone: string[] = [];
  for (const t of due) {
    const r = map[t.ticket_id];
    if (!r) continue; // not ready yet
    checked.push(t.ticket_id);
    if (r.status === "error" && r.details?.error === "DeviceNotRegistered") gone.push(t.device_id);
  }
  if (checked.length) await deps.receiptsDone(checked, [...new Set(gone)]);
  counts.receipts += checked.length;
  counts.gone += new Set(gone).size;
}

const json = (status: number, body: unknown): Res => ({ status, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

export async function handlePush(req: Req, fnKey: string | undefined, deps: PushDeps): Promise<Res> {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  if (!sameKey(req.header("x-push-key"), fnKey)) return json(401, { error: "unauthorized" });
  const now = deps.now ?? Date.now;
  const start = now();
  const counts: Counts = { claimed: 0, messages: 0, sent: 0, retry: 0, failed: 0, gone: 0, receipts: 0, errors: 0 };
  try {
    for (let round = 0; round < 20 && now() - start < BUDGET_MS; round++) {
      const rows = await deps.claim(CLAIM);
      if (!rows.length) break;
      counts.claimed += rows.length;
      await sendRows(rows, deps, counts);
      if (rows.length < CLAIM) break;
    }
    if (now() - start < BUDGET_MS) await checkReceipts(deps, counts);
  } catch {
    deps.log?.(`send-push error ${line(counts)}`);
    return json(500, { error: "failed", ...counts });
  }
  deps.log?.(`send-push ${line(counts)}`);
  return json(200, counts);
}

const line = (c: Counts) =>
  `claimed=${c.claimed} messages=${c.messages} sent=${c.sent} retry=${c.retry} failed=${c.failed} gone=${c.gone} receipts=${c.receipts} errors=${c.errors}`;
