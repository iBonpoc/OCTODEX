/**
 * The outbox without the network (rule 6; found by the cloud e2e 104): a send that fails because the server could not
 * be reached is not a try — the op is never dropped for it; the next send waits longer and longer (1.5 s → 60 s).
 * Only a refusal of the server (PermanentError, or a real answer N times) drops an op. Pure: test/outboxRetry.test.ts.
 */
/** the request did not reach the server or got no answer: the browser's / React Native's fetch, a timeout, an abort */
const NETWORK = /failed to fetch|network request failed|networkerror|network error|load failed|fetch failed|timed? ?out|timeout|aborted|abort|econn|enotfound|eai_again|socket hang up|offline|internet/i;
export function isNetworkError(e: unknown): boolean {
  // a refusal the server marked as final (ops.ts PermanentError) is an answer, whatever its text
  if (e instanceof Error && e.name === "PermanentError") return false;
  if (e instanceof TypeError) return true; // fetch rejects with a TypeError when there is no network
  const name = e instanceof Error ? e.name : "";
  if (name === "AbortError" || name === "TimeoutError") return true;
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return NETWORK.test(msg);
}

export const RETRY_FIRST_MS = 1500;
export const RETRY_MAX_MS = 60_000;
/** the pause after the n-th network failure in a row (n ≥ 1): 1.5 s, 3 s, 6 s … up to 60 s */
export const backoffMs = (n: number) => Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** Math.max(0, n - 1));
/** a real answer of the server that is not «done»: how many before the op is dropped */
export const MAX_TRIES = 5;
