/**
 * The outbox when a send fails (rule 6; found by the cloud e2e 104, review #244). Three kinds of failure:
 * - «network»: the request never got an answer (no network, a timeout, an abort) — not a try;
 * - «transient»: the server answered «not now» (5xx, 408, 429, 401 / an expired sign-in, a serialization failure,
 *   a deadlock, the database restarting) — not a try either;
 * - «refusal»: the server answered «no» (another 4xx, a permission / constraint / data code) — a try; after MAX_TRIES
 *   the op is dropped.
 * Network and transient failures wait longer and longer (1.5 s → 60 s) and never drop an op. The server's status and
 * code come first; the text of the error is read only when there was no answer at all (a server text such as
 * «current transaction is aborted» is not a network failure). Pure: test/outboxRetry.test.ts.
 */
export type Failure = "network" | "transient" | "refusal";

/** the request did not reach the server or got no answer: the browser's / React Native's fetch, a timeout, an abort */
const NETWORK = /failed to fetch|network request failed|networkerror|network error|load failed|fetch failed|timed? ?out|timeout|aborted|econn|enotfound|eai_again|socket hang up|internet/i;
/** the server's «try later»: an expired JWT (PostgREST), PostgREST cannot reach the database, serialization failure,
 *  deadlock, admin / crash shutdown, cannot connect now, insufficient resources (53…), connection exceptions (08…) */
const TRANSIENT_CODE = /^(PGRST000|PGRST001|PGRST002|PGRST003|PGRST301|PGRST302|40001|40P01|57014|57P01|57P02|57P03|53\d{3}|08\d{3})$/;
const TRANSIENT_STATUS = new Set([401, 408, 425, 429]);

const field = (e: unknown, k: string): unknown => (e && typeof e === "object" ? (e as Record<string, unknown>)[k] : undefined);

export function classify(e: unknown): Failure {
  const status = Number(field(e, "status")) || 0;
  const code = String(field(e, "code") ?? "");
  if (code && TRANSIENT_CODE.test(code)) return "transient";
  if (status) return status >= 500 || TRANSIENT_STATUS.has(status) ? "transient" : "refusal";
  if (code) return "refusal"; // an answer with a code (42…, 23…, 22…, P0…) and no status
  // no answer of the server at all
  if (e instanceof TypeError) return "network"; // fetch rejects with a TypeError when there is no network
  const name = e instanceof Error ? e.name : "";
  if (name === "AbortError" || name === "TimeoutError") return "network";
  if (name === "PermanentError") return "refusal"; // our own «will not change» (e.g. the estimate is not visible)
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return NETWORK.test(msg) ? "network" : "refusal";
}
export const isNetworkError = (e: unknown) => classify(e) === "network";
/**
 * The server's «not now» that may be this op's alone (docs/specs/23 §3): an internal error (500 / XX000), a statement
 * timeout (57014), a serialization failure or a deadlock (40001, 40P01). Every other «not now» (PostgREST cannot reach
 * the database, 503, 429, an expired sign-in, the database restarting) is the whole server: the queue pauses.
 */
const OP_ONLY_CODE = /^(XX000|57014|40001|40P01)$/;
export function maybeOpOnly(e: unknown): boolean {
  if (classify(e) !== "transient") return false;
  const code = String(field(e, "code") ?? "");
  if (code) return OP_ONLY_CODE.test(code);
  return Number(field(e, "status")) === 500;
}
/** an op that got the server's error this long, this many times, is shown as «не отправлено» (it is not dropped) */
export const STUCK_AFTER_MS = 10 * 60_000;
export const STUCK_AFTER_FAILS = 3;
/** a stuck op is tried again this often (and at once on «Повторить сейчас») */
export const STUCK_RETRY_MS = 5 * 60_000;
export const isStuck = (failSince: string | undefined, fails: number | undefined, now: number) =>
  !!failSince && (fails ?? 0) >= STUCK_AFTER_FAILS && now - Date.parse(failSince) >= STUCK_AFTER_MS;
/** the sign-in expired: renew it before the next try */
export const needsSignIn = (e: unknown) => Number(field(e, "status")) === 401 || field(e, "code") === "PGRST301";

export const RETRY_FIRST_MS = 1500;
export const RETRY_MAX_MS = 60_000;
/** the pause after the n-th network / transient failure in a row (n ≥ 1): 1.5 s, 3 s, 6 s … up to 60 s */
export const backoffMs = (n: number) => Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** Math.max(0, n - 1));
/** refusals of the server before the op is dropped */
export const MAX_TRIES = 5;
