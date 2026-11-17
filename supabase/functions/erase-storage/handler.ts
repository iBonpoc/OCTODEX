/**
 * «Стереть объекты Storage» (spec 50 §3.2, §6, §8; PR 50-3). Pure: no Deno, no network — the Deno entry (index.ts) passes the real
 * clients; vitest passes fakes (apps/mobile/test/eraseStorageFn.test.ts).
 *
 * A file object cannot be removed from SQL, only through the Storage API. The database keeps the queue (app.storage_erase_queue);
 * this takes its waiting rows (public.storage_erase_claim), removes the objects through the API, and tells the database which went
 * (storage_erase_done) and which did not (storage_erase_fail: a try counted, the row stays, after 5 it is left).
 *
 * What it will remove: ONLY what the queue holds, and only bucket «files», path <company uuid>/<name> — checked here AGAIN, before
 * the API call (the database checks it on writing; two walls). No prefix, no wildcard, never an empty or rooted path. The service key
 * and the names of files are never written to a log or an answer: only counters.
 */
export const BUCKET = "files";
/** the same shape as the check of app.storage_erase_queue.path */
export const PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/ ][^ ]*$/;
export const MAX_PATH = 512;
export const BATCH = 50;
/** rounds of «claim → remove» in one call: a call never runs for ever */
export const MAX_ROUNDS = 5;

export interface Row {
  id: string;
  bucket: string;
  path: string;
}
export interface EraseDeps {
  /** public.storage_erase_claim(limit): the waiting rows */
  claim: (limit: number) => Promise<Row[]>;
  /** the Storage API: remove these paths of the bucket (a path that is not there is not an error) */
  remove: (bucket: string, paths: string[]) => Promise<{ error?: { message: string } | null }>;
  /** public.storage_erase_done(ids) */
  done: (ids: string[]) => Promise<void>;
  /** public.storage_erase_fail(ids) */
  fail: (ids: string[]) => Promise<void>;
  log?: (msg: string) => void;
}
export interface Report {
  removed: number;
  failed: number;
  /** rows the queue gave that this refused to touch (a path of a wrong shape): counted as failed in the queue */
  refused: number;
}

/** is this a path the function may remove? */
export const safePath = (bucket: string, path: string): boolean =>
  bucket === BUCKET && path.length <= MAX_PATH && PATH.test(path) && !/(^|\/)\.\.(\/|$)/.test(path);

/** the queue, drained: claim → remove → done / fail, a few rounds. Never throws: a failure is counted. */
export async function drainStorageQueue(deps: EraseDeps): Promise<Report> {
  const rep: Report = { removed: 0, failed: 0, refused: 0 };
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let rows: Row[];
    try {
      rows = await deps.claim(BATCH);
    } catch {
      deps.log?.("erase-storage: claim failed");
      rep.failed += 1;
      break;
    }
    if (!rows.length) break;
    const good = rows.filter((r) => safePath(r.bucket, r.path));
    const bad = rows.filter((r) => !safePath(r.bucket, r.path));
    if (bad.length) {
      rep.refused += bad.length;
      await deps.fail(bad.map((r) => r.id)).catch(() => deps.log?.("erase-storage: fail mark failed"));
    }
    if (good.length) {
      const r = await deps.remove(BUCKET, good.map((x) => x.path)).catch((e: Error) => ({ error: { message: e.message } }));
      const ids = good.map((x) => x.id);
      if (r.error) {
        rep.failed += good.length;
        deps.log?.(`erase-storage: remove failed for ${good.length} objects`); // a count, never the names
        await deps.fail(ids).catch(() => deps.log?.("erase-storage: fail mark failed"));
      } else {
        rep.removed += good.length;
        await deps.done(ids).catch(() => deps.log?.("erase-storage: done mark failed"));
      }
    }
    // a failed removal or nothing good in this round: the same rows would come again — stop, the next call tries again
    if (rep.failed > 0 || !good.length) break;
  }
  return rep;
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
const json = (status: number, body: unknown): Res => ({ status, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

/**
 * The role claim of the bearer token. The gateway has ALREADY verified the signature (verify_jwt = true in config.toml), so only the
 * payload is read here; a token that is not a service-role token is refused (an anon or a person's token passes the gateway too).
 */
export function roleOf(authorization: string | null): string | null {
  const jwt = /^Bearer\s+(\S+)$/i.exec(authorization ?? "")?.[1];
  const part = jwt?.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const payload = JSON.parse(atob(b64)) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export async function handleErase(req: Req, deps: EraseDeps): Promise<Res> {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  if (roleOf(req.header("authorization")) !== "service_role") return json(403, { error: "forbidden" });
  const rep = await drainStorageQueue(deps);
  return json(200, rep);
}
