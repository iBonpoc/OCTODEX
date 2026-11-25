import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { readSessionRetrying } from "./sessionStore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LEGAL_RETRY_MS, legalState, legalTickets, PENDING_LEGAL_KEY, resolveLegal, type LegalState } from "@/features/legal";
import { supabase } from "./client";
import { forgetThisPhone } from "@/features/pushNative";
import { acceptLegal, legalStatus } from "./legal";
import { finishDeletion, profileDeleted, wipeIfPending } from "./account";
import { forgetSignOutMark, signOutAndMark, wipeAfterSignOut, wipeLeftCompanies, wipeSignOutIfPending } from "./signOutWipe";
import { lastCompanyKey, orderMemberships, parseMemberships, pendingLastKey, pickActive, rereadDelay, sameMemberships, type Membership } from "./membershipSync";
import { authEventPlan, goneChecker } from "@/features/deleteAccount";
import { closedAnswerCounts, parseClosed, type ClosedCompany } from "@/features/closedCompany";


export type { DbRole, Membership } from "./membershipSync";

/** spec 42 S34: the server's last company of the person (a new phone); no answer — null (the first by date opens) */
async function lastActiveOnServer(uid: string): Promise<string | null> {
  const r = await supabase
    .from("users")
    .select("last_active_company_id")
    .eq("id", uid)
    .maybeSingle()
    .then(
      (x) => x,
      () => ({ data: null, error: true }),
    );
  const v = (r.data as { last_active_company_id?: unknown } | null)?.last_active_company_id;
  return !r.error && typeof v === "string" ? v : null;
}

/**
 * spec 42 S34: the switch on the server (users.last_active_company_id; the guard t15 lets only an open company the person
 * is active in). Marked first: no network — written on the next confirmed read of the memberships. A refusal (the person
 * is no longer in it) is not retried.
 */
async function writeLastActive(uid: string, companyId: string): Promise<void> {
  await AsyncStorage.setItem(pendingLastKey(uid), companyId).catch(() => {});
  const r = await supabase
    .from("users")
    .update({ last_active_company_id: companyId })
    .eq("id", uid)
    .then(
      (x) => x,
      (e: unknown) => ({ error: e as { code?: string } }),
    );
  const err = r.error as { code?: string; message?: string } | null;
  // sent, or refused for good (42501 — not a company of the person's any more): nothing waits
  if (!err || err.code === "42501") {
    const still = await AsyncStorage.getItem(pendingLastKey(uid)).catch(() => null);
    if (still === companyId) await AsyncStorage.removeItem(pendingLastKey(uid)).catch(() => {});
  }
}

interface AuthCtx {
  ready: boolean;
  session: Session | null;
  userId: string | null;
  email: string | null;
  memberships: Membership[];
  company: Membership | null;
  sendCode: (email: string) => Promise<string | null>;
  verifyCode: (email: string, code: string) => Promise<string | null>;
  signInPassword: (email: string, password: string) => Promise<string | null>;
  createCompany: (name: string) => Promise<string | null>;
  /** #1662: `wipeDrafts` — «Выйти и стереть» in the sign-out window (the person's estimate drafts go too); otherwise kept */
  signOut: (o?: { wipeDrafts?: boolean }) => Promise<void>;
  /** `prefer` (spec 42 §14, #1673): the company to open after this read — one just joined or created; ignored when the
   *  answer does not have it */
  reloadMemberships: (prefer?: string, why?: "joined" | "created") => Promise<unknown>;
  /**
   * Spec 42 S34 (#1673): open another of the person's companies. Only a company among the memberships read (anything else
   * — false, nothing changes). The store's cache key follows: the whole app below the store mounts again with that
   * company's data (its own cache; without the network too, once loaded). Remembered on this phone at once and on the
   * server when there is a network (a new phone opens it).
   */
  switchCompany: (companyId: string, o?: { why?: CompanySwitch["why"]; back?: Membership | null }) => boolean;
  /**
   * the last switch (the app below the store mounts again with the new company — a toast there would be lost): the
   * screens read it after the remount, say «Вы в «B»» (and «Вернуться в «A»» when `back`), then clear it
   */
  switched: CompanySwitch | null;
  clearSwitched: () => void;
  /**
   * #1633 A2: whose memberships the server has confirmed in this run (null — none yet: no answer, signed out) and a
   * number that grows with every confirmed answer (the store: «read again since the refusal?»)
   */
  membershipsFor: string | null;
  membershipStamp: number;
  /** the server refused for lack of rights (42501) or the company's own read shows me gone / another role: the
   *  memberships are read again — at once, or at the end of the 5-minute window of the last such read (never more often) */
  accessDenied: () => void;
  /** when such a read (on a signal) last confirmed the memberships: a refusal soon after it is a plain «no» (e2e 118) */
  membershipCheckedAt: number | null;
  /**
   * The consent to the current Terms and Privacy (7а-1): "unknown" until asked or without the network (never blocks work),
   * "first" / "changed" — the gate asks. `legalChecked` — the check for this session has run (ok or failed).
   */
  legal: LegalState;
  legalChecked: boolean;
  /** the person agreed (the tick): to the server now; null or the server's message */
  agree: () => Promise<string | null>;
  /** 7а-2b: the account was just deleted (here or finished on sign-in) — the sign-in screen says «Аккаунт удалён» once */
  accountDeleted: boolean;
  setAccountDeleted: (v: boolean) => void;
  /**
   * 7а-3 «в» (docs/specs/22 §3.6): the companies closed by their owner that this person worked in (90 days). Asked only
   * without active memberships; no answer (no network, an old server) — none.
   */
  closedCompanies: ClosedCompany[];
}

export interface CompanySwitch {
  to: Membership;
  /** the company before, when the person may want to go back to it at once (an invitation accepted, a company created) */
  back: Membership | null;
  why: "switch" | "joined" | "created" | "push";
  at: number;
}

/**
 * The last switch, outside React: the switch remounts the app down to the root layout (e2e 432/433 caught that the
 * providers mount again — this provider's state with them), so the notice «Вы в «B»» would be lost with it. Read as the
 * initial state of a provider mounted again; cleared once said (clearSwitched) or on sign-out.
 */
let lastSwitch: CompanySwitch | null = null;
/**
 * The memberships as last set, outside React for the same reason: the provider mounted again by a switch starts with
 * them (the company just chosen first) — without the network too (rule 6: a switch offline to a company already loaded
 * here must open it, not the demo). Only for the same person (checked against the session on start); cleared on sign-out.
 */
let memCache: { uid: string; list: Membership[] } | null = null;
/** the tests' fresh start (a new app process has neither) */
export function forgetAuthMemory(): void {
  memCache = null;
  lastSwitch = null;
}

const Ctx = createContext<AuthCtx | null>(null);

/** Email sign-in (code or password), the user's companies and roles (docs/04 §1 User, Company, Membership). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  // a provider mounted again by a switch starts with the memberships it had (memCache)
  const boot = useRef(memCache).current;
  const [memberships, setMemberships] = useState<Membership[]>(() => boot?.list ?? []);
  /** #1633 A2: the memberships as last set (an answer equal to it keeps the same array: no reload for nothing) */
  const memRef = useRef<Membership[]>(boot?.list ?? []);
  const setMems = (list: Membership[]) => {
    if (sameMemberships(memRef.current, list)) return;
    memRef.current = list;
    setMemberships(list);
  };
  const [membershipsFor, setMembershipsFor] = useState<string | null>(null);
  const [membershipStamp, setMembershipStamp] = useState(0);
  /** a late answer never reaches another person or overwrites a newer one (like closedTicket) */
  const memTicket = useRef(0);
  /** the companies the person is in by the newest confirmed answer (the wipe of the others reads it on every pass) */
  const activeRef = useRef<ReadonlySet<string>>(new Set());
  /** the last read asked by a signal (the window counts these only: the start's own read never delays the first signal) */
  const lastSignalRead = useRef<number | null>(null);
  const [membershipCheckedAt, setMembershipCheckedAt] = useState<number | null>(null);
  const rereadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** signed out: no answer asked before counts, nothing waits to be read again */
  const forgetMems = () => {
    memTicket.current += 1;
    if (rereadTimer.current) clearTimeout(rereadTimer.current);
    rereadTimer.current = null;
    lastSignalRead.current = null;
    activeRef.current = new Set();
    setMems([]);
    memCache = null;
    setMembershipsFor(null);
    setMembershipCheckedAt(null);
    setSwitched(null);
    preferRef.current = null;
  };
  const [legal, setLegal] = useState<LegalState>("unknown");
  const [legalChecked, setLegalChecked] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const [closedCompanies, setClosedCompanies] = useState<ClosedCompany[]>([]);
  const [switched, setSwitchedState] = useState<CompanySwitch | null>(() => lastSwitch);
  const setSwitched = useCallback((v: CompanySwitch | null) => {
    lastSwitch = v;
    setSwitchedState(v);
  }, []);
  /**
   * a company to open that a read was asked for (joined, created): kept until a confirmed answer has it — a newer read
   * (a refusal's re-read, a token refresh) takes it over instead of dropping it (code-review of the wave №1)
   */
  const preferRef = useRef<{ id: string; why: "joined" | "created"; uid: string; at: number } | null>(null);
  const checkedUid = useRef<string | null>(null);
  /** #1633: who is signed in by this app's own state (a «signed out» event wipes that person's caches) */
  const signedUid = useRef<string | null>(null);
  const legalRun = useRef<Promise<void> | null>(null);
  // a slow old answer never overwrites a newer one (review #206 M1): checks and accepts take tickets
  const tickets = useRef(legalTickets()).current;
  const sessionEmail = useRef<string | null>(null);

  /** a tick remembered on the sign-in screen goes to the server first; otherwise just ask where the person stands */
  const checkLegal = useCallback(
    (email: string | null | undefined) => {
      sessionEmail.current = email ?? null;
      if (legalRun.current) return legalRun.current;
      const ticket = tickets.take();
      legalRun.current = (async () => {
        const st = await resolveLegal(email, { store: AsyncStorage, accept: acceptLegal, status: legalStatus });
        // no network or an old server: «unknown» never blocks the work; asked again (the retry effect below)
        if (tickets.isNewest(ticket)) setLegal(st);
        setLegalChecked(true);
        legalRun.current = null;
      })();
      return legalRun.current;
    },
    [tickets],
  );

  /**
   * no answer (no network, an old server without the function): none. A late answer never reaches another person
   * signed in meanwhile on this phone (security-check #312, like the legal tickets of review #206 M1): each ask and each
   * clearing takes a ticket, only the newest answer for the same person counts.
   */
  const closedTicket = useRef(0);
  const clearClosed = () => {
    closedTicket.current += 1;
    setClosedCompanies([]);
  };
  const askClosed = (uid: string) => {
    const ticket = ++closedTicket.current;
    const fresh = async () => closedAnswerCounts(ticket, closedTicket.current, uid, (await supabase.auth.getSession()).data.session?.user.id);
    supabase.rpc("my_closed_companies").then(
      async ({ data: rows, error: e }) => {
        if (await fresh()) setClosedCompanies(e ? [] : parseClosed(rows));
      },
      async () => {
        if (await fresh()) setClosedCompanies([]);
      },
    );
  };
  /**
   * #1633 A2: only a confirmed answer changes the memberships — an error, a broken answer or a late one (a newer ask, or
   * another person signed in meanwhile) changes nothing (it set [] before: the phone fell back to the demo and back).
   * No session is the sign-out, not «no memberships». The order is fixed, the company worked in stays first (a read
   * again never switches it). A confirmed answer then wipes the caches of every company the person is no longer in.
   */
  const readMemberships = useCallback(async (signal: boolean, prefer?: string, why: "joined" | "created" = "joined"): Promise<Membership[] | null> => {
    const ticket = ++memTicket.current;
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) {
      if (ticket === memTicket.current) {
        setMems([]);
        memCache = null;
        activeRef.current = new Set();
        setMembershipsFor(null);
        clearClosed();
      }
      return [];
    }
    const uid = s.session.user.id;
    if (signal) lastSignalRead.current = Date.now();
    if (prefer) preferRef.current = { id: prefer, why, uid, at: Date.now() };
    const { data, error } = await supabase
      .from("memberships")
      .select("company_id, role, status, created_at, companies(name)")
      .eq("user_id", uid)
      .eq("status", "active")
      .is("deleted_at", null)
      .then(
        (r) => r,
        (e: unknown) => ({ data: null, error: e }),
      );
    const parsed = error ? null : parseMemberships(data);
    const still = (await supabase.auth.getSession()).data.session?.user.id === uid && ticket === memTicket.current;
    // null — no answer (no network): «no memberships» is not known then
    if (!still || !parsed) return null;
    // spec 42 S34 (#1673): which company opens is decided AFTER the answer — a switch made while this read was on its
    // way is the current one now (the plan's review П2: deciding before the await switched the person back)
    const current = memRef.current[0]?.companyId ?? null;
    const phone = await AsyncStorage.getItem(lastCompanyKey(uid)).catch(() => null);
    const has = (id: string | null | undefined) => !!id && parsed.some((m) => m.companyId === id);
    // a wish not met within 2 minutes (the answer never had that company) is dropped: it never opens a company later
    const asked = preferRef.current?.uid === uid && Date.now() - preferRef.current.at < 120_000 ? preferRef.current : null;
    prefer = asked?.id;
    why = asked?.why ?? why;
    // the server is asked only when there is a choice and the phone knows nothing (a new phone); no answer — the first
    // by date
    const server = parsed.length < 2 || has(prefer) || has(current) || has(phone) ? null : await lastActiveOnServer(uid);
    if (!((await supabase.auth.getSession()).data.session?.user.id === uid && ticket === memTicket.current)) return null;
    // read after every await: a switch made meanwhile is the one waiting to be written (code-review №5)
    const pending = await AsyncStorage.getItem(pendingLastKey(uid)).catch(() => null);
    if (has(prefer)) preferRef.current = null;
    const pick = pickActive(parsed, { current: has(prefer) ? prefer : (memRef.current[0]?.companyId ?? null), phone, server });
    const list = orderMemberships(parsed, pick);
    const before = memRef.current[0] ?? null;
    setMems(list);
    memCache = { uid, list };
    // a company just joined or created opened over another one: the screens say so and offer the way back
    if (prefer && list[0]?.companyId === prefer && before && before.companyId !== prefer)
      setSwitched({ to: list[0], back: before, why, at: Date.now() });
    activeRef.current = new Set(list.map((m) => m.companyId));
    setMembershipsFor(uid);
    setMembershipStamp((n) => n + 1);
    if (signal) setMembershipCheckedAt(Date.now());
    if (list[0]) void AsyncStorage.setItem(lastCompanyKey(uid), list[0].companyId).catch(() => {});
    // a switch not yet on the server (no network then): written now, if that company is still the person's
    if (pending && list[0]?.companyId === pending) void writeLastActive(uid, pending);
    else if (pending) void AsyncStorage.removeItem(pendingLastKey(uid)).catch(() => {});
    void wipeLeftCompanies(uid, { signedIn: () => signedUid.current, active: () => activeRef.current });
    // no company: was it closed by its owner? (only then; not waited for — the start never waits on it)
    if (list.length) clearClosed();
    else askClosed(uid);
    return list;
  }, []);
  const reloadMemberships = useCallback((prefer?: string, why?: "joined" | "created") => readMemberships(false, prefer, why), [readMemberships]);
  /** spec 42 S34: open one of the person's companies (only one among the memberships read) */
  const switchCompany = useCallback((companyId: string, why: CompanySwitch["why"] = "switch", back: Membership | null = null): boolean => {
    const uid = signedUid.current;
    const list = memRef.current;
    const to = list.find((m) => m.companyId === companyId);
    if (!uid || !to) return false;
    if (list[0]?.companyId === companyId) return true;
    const next = orderMemberships(list, companyId);
    setMems(next);
    memCache = { uid, list: next };
    setSwitched({ to, back, why, at: Date.now() });
    void AsyncStorage.setItem(lastCompanyKey(uid), companyId).catch(() => {});
    void writeLastActive(uid, companyId);
    return true;
  }, []);
  const accessDenied = useCallback(() => {
    if (rereadTimer.current) return;
    rereadTimer.current = setTimeout(() => {
      rereadTimer.current = null;
      void readMemberships(true);
    }, rereadDelay(Date.now(), lastSignalRead.current));
  }, [readMemberships]);

  /**
   * 7а-2b (§6.9, §6.11 п.4; review #220): a profile that is deleted but could still sign in (the sign-in close was
   * «pending», or an old session) is finished quietly BEFORE the consent check — its legal_status says «not ok» and the
   * gate would send it to «Условия» for ever. Asked only without active memberships, once per person (goneChecker), with
   * a short timeout; no answer → asked again with the consent retry below, never cached.
   */
  const gone = useRef(
    goneChecker(
      (uid) => profileDeleted(uid),
      (uid) => {
        setSession(null);
        forgetMems();
        setAccountDeleted(true);
        void finishDeletion(uid);
      },
    ),
  ).current;
  /** a session is here: memberships, then «is it deleted» (only without them), then the consent */
  const afterSession = useCallback(
    async (s: Session) => {
      const mems = await reloadMemberships();
      const r = await gone.run(s.user.id, !!mems?.length);
      if (r === false) await checkLegal(s.user.email);
      return r;
    },
    [reloadMemberships, checkLegal, gone],
  );

  useEffect(() => {
    let alive = true;
    void wipeIfPending();
    // #1634: the protected store may refuse the read before the first unlock — tried again, never «signed out»
    void readSessionRetrying(() => supabase.auth.getSession(), () => alive).then(async (got) => {
      if (!got) return;
      const { data } = got;
      // #1633: a sign-out wipe the app did not finish (never of the person signed in now)
      void wipeSignOutIfPending(data.session?.user.id ?? null);
      if (!alive) return;
      // the memberships kept from before the remount are this person's only
      if (boot && boot.uid !== data.session?.user.id) {
        memCache = null;
        lastSwitch = null;
        setSwitchedState(null);
        setMems([]);
      }
      if (data.session) signedUid.current = data.session.user.id;
      setSession(data.session);
      if (data.session) await afterSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      const plan = authEventPlan(e, s?.user.id ?? null, checkedUid.current);
      if (!s) {
        // #1633: the person signed out (this tab, another tab, another device): their company leaves the phone
        const prev = signedUid.current;
        signedUid.current = null;
        if (prev) void wipeAfterSignOut(prev, { signedIn: () => signedUid.current });
        setSession(null);
        checkedUid.current = null;
        gone.forget();
        forgetMems();
        clearClosed();
        setLegal("unknown");
        setLegalChecked(false);
        return;
      }
      // the same person signed in again: a wipe of theirs still marked is called off (#1633)
      if (signedUid.current !== s.user.id) void forgetSignOutMark(s.user.id);
      signedUid.current = s.user.id;
      setSession(s);
      if (plan === "none") return; // INITIAL_SESSION: the start goes through getSession above
      if (plan === "first") {
        // a new person: the consent waits for «alive» (the gate follows `legal`, «unknown» never blocks)
        checkedUid.current = s.user.id;
        setLegal("unknown");
        setLegalChecked(false);
      }
      void afterSession(s);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      if (rereadTimer.current) clearTimeout(rereadTimer.current);
      rereadTimer.current = null;
    };
  }, [afterSession, gone]);

  // the answer is unknown (no network): ask again on coming back to the app, on «online», and every minute (M2)
  useEffect(() => {
    if (!session || legal !== "unknown") return;
    // the «is it deleted» question goes first again (a start without the network left it unanswered — review #220 №1)
    const again = () => void afterSession(session);
    const sub = AppState.addEventListener("change", (st) => st === "active" && again());
    const w = typeof window !== "undefined" && typeof window.addEventListener === "function" ? window : null;
    w?.addEventListener("online", again);
    const timer = setInterval(again, LEGAL_RETRY_MS);
    return () => {
      sub.remove();
      w?.removeEventListener("online", again);
      clearInterval(timer);
    };
  }, [session, legal, afterSession]);

  const value = useMemo<AuthCtx>(
    () => ({
      ready,
      session,
      userId: session?.user.id ?? null,
      email: session?.user.email ?? null,
      memberships,
      company: memberships[0] ?? null,
      sendCode: async (email) => {
        // the code only, no link (docs/specs/52 Р1): the first code makes the account and confirms the address
        const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        return error?.message ?? null;
      },
      verifyCode: async (email, code) => {
        const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
        if (!error) await reloadMemberships();
        return error?.message ?? null;
      },
      signInPassword: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (!error) await reloadMemberships();
        return error?.message ?? null;
      },
      legal,
      legalChecked,
      agree: async () => {
        const ticket = tickets.take();
        try {
          const st = legalState(await acceptLegal());
          if (tickets.isNewest(ticket)) setLegal(st);
          setLegalChecked(true);
          await AsyncStorage.removeItem(PENDING_LEGAL_KEY).catch(() => {});
          return null;
        } catch (e) {
          return (e as Error).message;
        }
      },
      createCompany: async (name) => {
        // The DB trigger makes the creator the active owner and seeds standard lead sources. Since 7а-1 the server
        // refuses without the current consent («legal not accepted»): a tick still on the device goes first.
        if (legalRun.current) await legalRun.current;
        // spec 42 S32 (#1673): the new company opens (its id: RETURNING passes companies_select by created_by)
        const { data, error } = await supabase.from("companies").insert({ name }).select("id").maybeSingle();
        const id = (data as { id?: unknown } | null)?.id;
        if (!error) {
          await reloadMemberships(typeof id === "string" ? id : undefined, "created");
          // a new phone opens it too (accept_invitation writes it on the server itself; a created company does not)
          const uid = signedUid.current;
          if (uid && typeof id === "string" && memRef.current[0]?.companyId === id) void writeLastActive(uid, id);
        }
        return error?.message ?? null;
      },
      signOut: async (o) => {
        await AsyncStorage.removeItem(PENDING_LEGAL_KEY).catch(() => {});
        // while still signed in: this phone stops getting the person's pushes (never throws, ≤ 8 s; docs/specs/27-push.md)
        await forgetThisPhone();
        // #1633: offline too; the «signed out» event then wipes the person's company from the phone
        await signOutAndMark(
          supabase.auth,
          signedUid.current,
          () => {
            forgetMems();
            clearClosed();
          },
          undefined,
          { wipeDrafts: o?.wipeDrafts === true }, // onPress={auth.signOut} passes the press event: never «wipe»
        );
      },
      reloadMemberships,
      switchCompany: (id, o) => switchCompany(id, o?.why, o?.back ?? null),
      switched,
      clearSwitched: () => setSwitched(null),
      membershipsFor,
      membershipStamp,
      accessDenied,
      membershipCheckedAt,
      accountDeleted,
      setAccountDeleted,
      closedCompanies,
    }),
    [ready, session, memberships, reloadMemberships, switchCompany, switched, membershipsFor, membershipStamp, accessDenied, membershipCheckedAt, legal, legalChecked, tickets, accountDeleted, closedCompanies],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
