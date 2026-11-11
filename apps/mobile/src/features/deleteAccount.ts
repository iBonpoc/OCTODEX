/**
 * «Удалить аккаунт» — the app's rules (wave 7а-2b, story map S22; docs/specs/19 §6.10–§6.12). Pure — unit-tested in
 * test/deleteAccount.test.ts. The server side: public.delete_account + public.transfer_ownership (migration
 * 20261106200000) and the edge function supabase/functions/delete-account (handler.ts).
 */
import type { Lang } from "@/i18n";

/* ---------- the word ---------- */
/** the word typed to confirm, in the language of the app (the server accepts exactly these three) */
export const CONFIRM_WORD: Record<Lang, string> = { ru: "УДАЛИТЬ", en: "DELETE", es: "ELIMINAR" };
/** what the person typed, as the server compares it: no spaces around, upper case */
export const normalizeWord = (typed: string) => typed.trim().toLocaleUpperCase();
/** only the word shown on the screen (the word of the app's language) */
export const wordOk = (typed: string, lang: Lang) => normalizeWord(typed) === CONFIRM_WORD[lang];

/* ---------- the server's answers → the app's words (rule 7: no raw server text) ---------- */
export type AccountErrorKey =
  | "acct.err.signIn"
  | "acct.err.fresh"
  | "acct.err.word"
  | "acct.err.lastOwner"
  | "acct.err.transferFirst"
  | "acct.err.noPerson"
  | "acct.err.retry"
  | "acct.err.network"
  | "acct.err.code"
  | "acct.err.rateLimit"
  | "acct.err.failed";
/** the texts are the server's own (migration 200000 OD001, handler.ts) — matched as they are */
export function accountErrorKey(message: string | null | undefined, status?: number): AccountErrorKey {
  const m = (message ?? "").toLowerCase();
  if (m.includes("sign in again")) return "acct.err.fresh";
  // Supabase Auth: «For security purposes, you can only request this after N seconds», «email rate limit exceeded»
  if (status === 429 || m.includes("rate limit") || m.includes("only request this after") || m.includes("too many")) return "acct.err.rateLimit";
  if (status === 401 || m.includes("sign in first") || m.includes("jwt")) return "acct.err.signIn";
  if (m.includes("type the word")) return "acct.err.word";
  if (m.includes("at least one active owner")) return "acct.err.lastOwner";
  // an active admin is there: the company is handed over, never closed under them (review #214 №2)
  if (m.includes("transfer the company first")) return "acct.err.transferFirst";
  if (m.includes("no such person on the team")) return "acct.err.noPerson";
  if (m.includes("try again") || m.includes("deadlock") || m.includes("could not serialize") || m.includes("could not obtain lock")) return "acct.err.retry";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("fetch failed") || m.includes("load failed")) return "acct.err.network";
  if (m.includes("token has expired") || m.includes("otp") || (m.includes("invalid") && m.includes("token"))) return "acct.err.code";
  return "acct.err.failed";
}
/** «Проверить код»: a wrong or old code — «Код не подошёл»; no network or a rate limit keep their own words */
export function codeErrorKey(message: string | null | undefined): AccountErrorKey {
  const k = accountErrorKey(message);
  return k === "acct.err.failed" || k === "acct.err.signIn" ? "acct.err.code" : k;
}
/** Postgres codes of a lock conflict (transfer_ownership has no own «try again», review 7а-2 №5) */
export const RETRY_CODES: readonly string[] = ["40P01", "40001", "55P03", "57014"];

/* ---------- the companies where I am the last owner ---------- */
export interface MembershipRow {
  company_id: string;
  user_id: string;
  role: string;
  status: string;
  name?: string | null;
}
export interface OwnedCompany {
  companyId: string;
  name: string;
  /** active admins: «Передать компанию» goes to one of them */
  admins: { id: string; name: string }[];
  /** active people besides me: they lose access if it closes */
  others: number;
}
/** where I am an active owner and no other active owner is left (the server refuses to delete then) */
export function lastOwnerCompanies(rows: readonly MembershipRow[], me: string, names: Record<string, string> = {}): OwnedCompany[] {
  const active = rows.filter((r) => r.status === "active");
  const mine = active.filter((r) => r.user_id === me && r.role === "owner");
  return mine
    .filter((m) => !active.some((o) => o.company_id === m.company_id && o.role === "owner" && o.user_id !== me))
    .map((m) => {
      const people = active.filter((o) => o.company_id === m.company_id && o.user_id !== me);
      return {
        companyId: m.company_id,
        name: names[m.company_id] ?? "",
        admins: people.filter((o) => o.role === "admin").map((o) => ({ id: o.user_id, name: o.name ?? "" })),
        others: people.length,
      };
    });
}

/* ---------- may «Удалить навсегда» be pressed ---------- */
export interface DeleteState {
  /** a real account (a session), not the demo */
  account: boolean;
  /** unsent changes of the cloud (outbox) */
  unsent: number;
  /** the code from the email was taken: this session is a fresh sign-in */
  fresh: boolean;
  wordOk: boolean;
  /** companies where I am the last owner that are neither handed over nor marked «закрыть» */
  undecided: number;
}
export type DeleteBlock = "demo" | "unsent" | "code" | "companies" | "word" | null;
/** the first thing that stops the deletion (in the order of the screen); null — it can go */
export function deleteBlock(s: DeleteState): DeleteBlock {
  if (!s.account) return "demo";
  if (s.unsent > 0) return "unsent";
  if (!s.fresh) return "code";
  if (s.undecided > 0) return "companies";
  if (!s.wordOk) return "word";
  return null;
}

/* ---------- the answer of the edge function, and the repeat (§6.12) ---------- */
export type DeleteAnswer =
  | { kind: "done"; pending: boolean }
  | { kind: "refused"; key: AccountErrorKey; companyId?: string }
  | { kind: "unknown" };
/** status + JSON body of delete-account → what happened. 500 / no answer — unknown (the data may be gone already) */
export function readDeleteAnswer(status: number | null, body: unknown): DeleteAnswer {
  const b = (body && typeof body === "object" ? body : {}) as { deleted?: unknown; auth?: unknown; error?: unknown; detail?: unknown };
  if (status === 200 && b.deleted === true) return { kind: "done", pending: b.auth === "pending" };
  if (status === 400 || status === 401) {
    const msg = typeof b.error === "string" ? b.error : "";
    const key = accountErrorKey(msg, status);
    return { kind: "refused", key, ...(typeof b.detail === "string" && b.detail ? { companyId: b.detail } : {}) };
  }
  return { kind: "unknown" };
}
/** the tries after «Удалить навсегда»: a lost answer or a pending sign-in close is repeated (the RPC answers repeat) */
export const DELETE_PAUSES_MS: readonly number[] = [1000, 2000, 4000];
export type DeleteOutcome = { ok: true } | { ok: false; key: AccountErrorKey; companyId?: string };
/** is my profile deleted on the server: «gone» (deleted_at is set), «alive», or «unknown» (no answer) */
export type AccountState = "gone" | "alive" | "unknown";
/**
 * Calls `call` until it is settled (§6.12; review 7а-2b №1, №5). The answer may be lost although the data is gone, and
 * a repeat then gets 401 (the sign-in is closed) — so after anything unclear (no answer, 500, 401) the app ASKS the
 * server whether its profile is deleted (`verify`), it never guesses from a status:
 * - 200 deleted (auth done) → done; auth pending → once more (the RPC answers repeat, the function closes the sign-in),
 *   pending to the end is still done (the data is closed; the next sign-in finishes it);
 * - 400 — our refusal (the RPC refuses only a person who is not deleted) → its reason, even after a 500;
 * - 401 or no answer / 500 → verify: gone → done; alive after a 401 → «sign in»; else a pause and again;
 * - out of tries → verify once more: gone → done, else «try again» / «no connection» (never «failed for good»).
 */
export async function deleteWithRepeat(
  call: () => Promise<{ status: number | null; body: unknown }>,
  verify: () => Promise<AccountState>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  pauses: readonly number[] = DELETE_PAUSES_MS,
): Promise<DeleteOutcome> {
  let pending = false;
  let lastNet = false;
  const check = () => verify().catch((): AccountState => "unknown");
  for (let i = 0; ; i++) {
    const r = await call().catch(() => ({ status: null, body: null }));
    const a = readDeleteAnswer(r.status, r.body);
    lastNet = r.status === null;
    if (a.kind === "done" && !a.pending) return { ok: true };
    if (a.kind === "done") pending = true;
    else if (r.status === 400 && a.kind === "refused") return { ok: false, key: a.key, ...(a.companyId ? { companyId: a.companyId } : {}) };
    else {
      // 401, 500, no answer: the server says what happened to the profile
      const st = await check();
      if (st === "gone") return { ok: true };
      if (st === "alive" && r.status === 401) return { ok: false, key: "acct.err.signIn" };
    }
    if (i >= pauses.length) {
      if (pending || (await check()) === "gone") return { ok: true };
      return { ok: false, key: lastNet ? "acct.err.network" : "acct.err.retry" };
    }
    await sleep(pauses[i]!);
  }
}

/* ---------- what is wiped from the device ---------- */
/** the keys of this person on this device (the cloud cache of every company, the outbox, the role, the Plan's person, …) */
export const DEVICE_KEYS: readonly string[] = ["octo.outbox.v1", "octo.queue.v1", "octo.invite.token.v1", "octo.role.v1", "octo.planWho.v1", "octo.legal.pending.v1"];
// octo.drafts.v1. — unsaved estimates on the phone (estimateDraft.ts, #760): the client's data among them
// octo.broken. — a broken outbox record kept aside (persist.ts brokenKeyOf, review of #910 №1)
export const DEVICE_PREFIXES: readonly string[] = ["octo.cloud.v1.", "octo.nav.open.", "octo.drafts.v1.", "octo.broken."];
export const isDeviceKey = (k: string) => DEVICE_KEYS.includes(k) || DEVICE_PREFIXES.some((p) => k.startsWith(p));
/** set when a wipe failed: the next start wipes again (review #220 №6); its value is the deleted person's id (or "1"
 *  from older versions), so the repeat knows whose ops leave the shared outbox (review #240 №2) */
export const WIPE_PENDING_KEY = "octo.wipe.pending.v1";
export interface WipeStore {
  getAllKeys: () => Promise<readonly string[]>;
  multiRemove: (keys: string[]) => Promise<void>;
  setItem: (k: string, v: string) => Promise<void>;
  removeItem: (k: string) => Promise<void>;
}
/**
 * What the mark asks for (#911): «<id>» (or "1", an older version: whose is not known) — the whole wipe failed, repeat
 * it; «filter:<id>» — the device keys are gone already, only the shared outbox and the refused changes still hold the
 * deleted person's: filter them, and never wipe again (the next person's cache and drafts live there by now).
 */
export const FILTER_PENDING = "filter:";
const idOf = (s: string) => (s && s !== "1" ? s : null);
/** `userIds`: every person whose ops are still to filter — «filter:u0,u1» when a later deletion came before the repeat */
export function pendingOf(v: string): { userId: string | null; userIds: (string | null)[]; filterOnly: boolean } {
  const filterOnly = v.startsWith(FILTER_PENDING);
  const ids = (filterOnly ? v.slice(FILTER_PENDING.length) : v).split(",").map(idOf);
  return { userId: ids[0] ?? null, userIds: ids, filterOnly };
}
const idList = (ids: readonly (string | null)[]) => [...new Set(ids.map((x) => x ?? "1"))].join(",");
export const filterMark = (ids: readonly (string | null)[]) => `${FILTER_PENDING}${idList(ids)}`;
/** the whole wipe is still to do for these people (the first is the one being deleted now) — «u1,u0» (review of #1010 №3) */
export const wipeMark = (ids: readonly (string | null)[]) => idList(ids);
/**
 * true — wiped; false — it failed (logged, and marked for the next start). `keep`: device keys that are not removed —
 * the shared outbox and the refused changes are filtered in place by the caller, never removed and written back (#911).
 * `marks` (#1010): the mark when it failed (default: the person) and the one left when it is done (null — none; a
 * «filter:» mark replaces the whole-wipe mark in one write, so the phone is never left without one)
 */
export async function wipeDevice(
  store: WipeStore,
  log: (m: string) => void = () => {},
  userId?: string | null,
  keep: readonly string[] = [],
  marks: { failed?: string | (() => Promise<string>); done?: string | null; leave?: boolean; wiped?: string } = {},
  pauseMs = MARK_PAUSE_MS,
): Promise<boolean> {
  try {
    const keys = (await store.getAllKeys()).filter(isDeviceKey);
    await store.multiRemove([...new Set([...keys, ...DEVICE_KEYS])].filter((k) => !keep.includes(k)));
  } catch (e) {
    log(`wipe failed: ${(e as Error).message}`);
    // not wiped: an older «wiped» must never answer this mark (review of #1013 №5) — taken away before the mark is set
    // not taken away: the mark carries NOT_ANY, so «*» never answers it (review of #1017 №2)
    const doneGone = await tries(() => store.removeItem(WIPE_DONE_KEY), pauseMs);
    // a function: the mark there was not read — it is read once more and kept in the new one, never overwritten blind (#1017 №3)
    const failed = typeof marks.failed === "function" ? await marks.failed().catch(() => userId || "1") : marks.failed;
    const mark = failed ?? (userId || "1");
    await store.setItem(WIPE_PENDING_KEY, doneGone || pendingOf(mark).userIds.includes(NOT_ANY) ? mark : `${mark},${NOT_ANY}`).catch(() => {});
    return false;
  }
  // `leave`: the mark that was there could not be read — it is not known, so it is not taken away (#1013 №2). The device
  // is wiped all the same: «wiped for any mark there now» (#1017 №1) — else an older «u0» left in place would wipe the
  // next person's data on the next start; the repeat then only filters the shared ops of the mark's people
  if (marks.leave && !marks.done) {
    if (!(await tries(() => store.setItem(WIPE_DONE_KEY, WIPE_DONE_ANY), pauseMs))) log("«wiped» not written");
    return true;
  }
  // the device is wiped: the whole-wipe mark must not stay — it would wipe the next person's data on the next start
  // (#1013 №1). Tried again; when the mark cannot be changed, «the device is wiped for them» is kept beside it
  const markOk = await tries(() => (marks.done ? store.setItem(WIPE_PENDING_KEY, marks.done) : store.removeItem(WIPE_PENDING_KEY)), pauseMs);
  if (markOk) {
    await store.removeItem(WIPE_DONE_KEY).catch(() => {});
    return true;
  }
  log("the mark was not changed after the wipe: «wiped» kept beside it");
  // the mark there was not read (`leave`): «wiped» names whatever mark it is — «*», never only these people (review of
  // #1029 №1: «u0» unread, «filter:u1» not written, «wiped»=«u1» → the next start wiped the next person's data)
  const wiped = marks.leave ? WIPE_DONE_ANY : (marks.wiped ?? (userId || "1"));
  if (!(await tries(() => store.setItem(WIPE_DONE_KEY, wiped), pauseMs))) log("«wiped» not written either");
  return true;
}
/** «the device is wiped already» for these people («u1,u0»), when the mark could not be changed after the wipe (#1013) */
export const WIPE_DONE_KEY = "octo.wipe.done.v1";
/**
 * «wiped» for whatever whole-wipe mark lies there now (#1017 №1): written when the mark could not be read. Safe because
 * every new whole-wipe mark takes «wiped» away first (#1017 №2), so it only ever answers a mark older than the wipe;
 * when that fails the new mark carries NOT_ANY.
 */
export const WIPE_DONE_ANY = "*";
/**
 * Put in a new mark when the older «wiped» could not be taken away first (condition of the director on #1017): a mark
 * with it is never answered by «*» — only by «wiped» naming every person in it. Looks like one more id to older versions
 * (no op has this owner: nothing more is filtered).
 */
export const NOT_ANY = "~";
const MARK_TRIES = 3;
const MARK_PAUSE_MS = 200;
async function tries(write: () => Promise<void>, pauseMs: number): Promise<boolean> {
  for (let i = 1; i <= MARK_TRIES; i++) {
    try {
      await write();
      return true;
    } catch {
      if (i < MARK_TRIES) await new Promise((r) => setTimeout(r, pauseMs * i));
    }
  }
  return false;
}
/** the whole-wipe mark needs no wipe any more: «wiped» (WIPE_DONE_KEY) names every person in it */
export function wipedAlready(mark: string, done: string | null): boolean {
  if (!done) return false;
  const p = pendingOf(mark);
  if (p.filterOnly) return false;
  if (done === WIPE_DONE_ANY) return !p.userIds.includes(NOT_ANY);
  const wiped = new Set(pendingOf(done).userIds);
  return p.userIds.every((id) => wiped.has(id));
}

/* ---------- the repeat on sign-in: when to ask «is this profile deleted» (review 7а-2b №2, №3) ---------- */
/**
 * What AuthProvider does on an auth event. «first» — ask the server first (a deleted profile is finished quietly) and
 * only then the consent and the memberships; «plain» — the consent and the memberships as before; «none» — nothing.
 * Once per person: supabase-js also sends SIGNED_IN on start and on every return to the browser tab, and INITIAL_SESSION
 * on start (the start itself goes through getSession, which asks first).
 */
export type AuthEventPlan = "first" | "plain" | "none";
export function authEventPlan(event: string, uid: string | null, checkedUid: string | null): AuthEventPlan {
  if (!uid) return "none";
  if (event === "INITIAL_SESSION") return "none";
  if (uid !== checkedUid) return "first";
  return "plain";
}

/* ---------- «is this profile deleted» on start / sign-in — one coordinator (review #220 №1, №2, №5, №8) ---------- */
/** true — deleted, false — alive, null — no answer (no network, a timeout): asked again later, never cached */
export type Gone = boolean | null;
/**
 * One answer per person: a person with active memberships is alive (asked nothing — §6.10: only without them);
 * otherwise `probe` (users.deleted_at) — once at a time (an event before getSession on the web gives ONE question and
 * one toast), a definite answer is kept, «no answer» is not (the retry asks again, so a start without the network never
 * leaves a half-deleted profile on the consent screen). `onGone` — once per person.
 */
export function goneChecker(probe: (uid: string) => Promise<Gone>, onGone: (uid: string) => void) {
  const known = new Map<string, boolean>();
  const flight = new Map<string, Promise<Gone>>();
  return {
    run(uid: string, hasMembers: boolean): Promise<Gone> {
      if (known.has(uid)) return Promise.resolve(known.get(uid)!);
      if (hasMembers) {
        known.set(uid, false);
        return Promise.resolve(false);
      }
      const f = flight.get(uid);
      if (f) return f;
      const p = probe(uid)
        .catch((): Gone => null)
        .then((r) => {
          flight.delete(uid);
          if (r !== null) {
            known.set(uid, r);
            if (r) onGone(uid);
          }
          return r;
        });
      flight.set(uid, p);
      return p;
    },
    /** signed out: the next person (or the same after a new sign-in) is asked afresh */
    forget() {
      known.clear();
    },
  };
}

/* ---------- one action at a time (review #216/#220 №4: two quick taps before `busy` renders) ---------- */
export function makeOnce() {
  let running = false;
  return <A extends unknown[]>(fn: (...a: A) => Promise<unknown>) =>
    async (...a: A) => {
      if (running) return;
      running = true;
      try {
        await fn(...a);
      } finally {
        running = false;
      }
    };
}

/* ---------- what the screen does with the outcome (review #220 №4: the branches, testable) ---------- */
export interface AfterDelete {
  done: boolean;
  /** the code is too old: back to «Получить код» */
  resetFresh: boolean;
  /** the company the server named: highlighted, and its «закрыть» mark cleared — it is undecided again */
  blocked: string | null;
  /** an unsettled answer: «Повторить удаление» instead of «Удалить навсегда» */
  failed: boolean;
  /** reload the companies (an owner or an admin changed meanwhile) */
  reloadCompanies: boolean;
  toast: AccountErrorKey | null;
}
export function afterDelete(out: DeleteOutcome): AfterDelete {
  if (out.ok) return { done: true, resetFresh: false, blocked: null, failed: false, reloadCompanies: false, toast: null };
  const company = out.key === "acct.err.lastOwner" || out.key === "acct.err.transferFirst";
  return {
    done: false,
    resetFresh: out.key === "acct.err.fresh",
    blocked: company ? (out.companyId ?? null) : null,
    failed: out.key === "acct.err.retry" || out.key === "acct.err.network",
    reloadCompanies: company,
    toast: out.key,
  };
}
