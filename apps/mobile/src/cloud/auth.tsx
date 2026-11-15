import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WEB_APP_URL } from "@/config/backend";
import { LEGAL_RETRY_MS, legalState, legalTickets, PENDING_LEGAL_KEY, resolveLegal, type LegalState } from "@/features/legal";
import { supabase } from "./client";
import { forgetThisPhone } from "@/features/pushNative";
import { acceptLegal, legalStatus } from "./legal";
import { finishDeletion, profileDeleted, wipeIfPending } from "./account";
import { forgetSignOutMark, signOutAndMark, wipeAfterSignOut, wipeLeftCompanies, wipeSignOutIfPending } from "./signOutWipe";
import { lastCompanyKey, orderMemberships, parseMemberships, rereadDelay, sameMemberships, type Membership } from "./membershipSync";
import { authEventPlan, goneChecker } from "@/features/deleteAccount";
import { closedAnswerCounts, parseClosed, type ClosedCompany } from "@/features/closedCompany";

/** Where email links (confirm / magic link) return. Must be in Supabase Auth → URL Configuration. */
const redirectTo = () => (Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : WEB_APP_URL);

export type { DbRole, Membership } from "./membershipSync";

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
  signUpPassword: (email: string, password: string, name: string) => Promise<string | null>;
  createCompany: (name: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  reloadMemberships: () => Promise<unknown>;
  /**
   * #1633 A2: whose memberships the server has confirmed in this run (null — none yet: no answer, signed out) and a
   * number that grows with every confirmed answer (the store: «read again since the refusal?»)
   */
  membershipsFor: string | null;
  membershipStamp: number;
  /** the server refused for lack of rights (42501) or the company's own read shows me gone / another role: the
   *  memberships are read again — at once, or at the end of the 5-minute window (never more often) */
  accessDenied: () => void;
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

const Ctx = createContext<AuthCtx | null>(null);

/** Email sign-in (code or password), the user's companies and roles (docs/04 §1 User, Company, Membership). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  /** #1633 A2: the memberships as last set (an answer equal to it keeps the same array: no reload for nothing) */
  const memRef = useRef<Membership[]>([]);
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
  const lastMemRead = useRef<number | null>(null);
  const rereadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** signed out: no answer asked before counts, nothing waits to be read again */
  const forgetMems = () => {
    memTicket.current += 1;
    if (rereadTimer.current) clearTimeout(rereadTimer.current);
    rereadTimer.current = null;
    lastMemRead.current = null;
    activeRef.current = new Set();
    setMems([]);
    setMembershipsFor(null);
  };
  const [legal, setLegal] = useState<LegalState>("unknown");
  const [legalChecked, setLegalChecked] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const [closedCompanies, setClosedCompanies] = useState<ClosedCompany[]>([]);
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
  const reloadMemberships = useCallback(async (): Promise<Membership[] | null> => {
    const ticket = ++memTicket.current;
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) {
      if (ticket === memTicket.current) {
        setMems([]);
        activeRef.current = new Set();
        setMembershipsFor(null);
        clearClosed();
      }
      return [];
    }
    const uid = s.session.user.id;
    lastMemRead.current = Date.now();
    const preferred = memRef.current[0]?.companyId ?? (await AsyncStorage.getItem(lastCompanyKey(uid)).catch(() => null));
    const { data, error } = await supabase
      .from("memberships")
      .select("company_id, role, status, companies(name)")
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
    const list = orderMemberships(parsed, preferred);
    setMems(list);
    activeRef.current = new Set(list.map((m) => m.companyId));
    setMembershipsFor(uid);
    setMembershipStamp((n) => n + 1);
    if (list[0]) void AsyncStorage.setItem(lastCompanyKey(uid), list[0].companyId).catch(() => {});
    void wipeLeftCompanies(uid, { signedIn: () => signedUid.current, active: () => activeRef.current });
    // no company: was it closed by its owner? (only then; not waited for — the start never waits on it)
    if (list.length) clearClosed();
    else askClosed(uid);
    return list;
  }, []);
  const accessDenied = useCallback(() => {
    if (rereadTimer.current) return;
    rereadTimer.current = setTimeout(() => {
      rereadTimer.current = null;
      void reloadMemberships();
    }, rereadDelay(Date.now(), lastMemRead.current));
  }, [reloadMemberships]);

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
    supabase.auth.getSession().then(async ({ data }) => {
      // #1633: a sign-out wipe the app did not finish (never of the person signed in now)
      void wipeSignOutIfPending(data.session?.user.id ?? null);
      if (!alive) return;
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
        const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: redirectTo() } });
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
      signUpPassword: async (email, password, name) => {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: redirectTo() } });
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
        const { error } = await supabase.from("companies").insert({ name });
        if (!error) await reloadMemberships();
        return error?.message ?? null;
      },
      signOut: async () => {
        await AsyncStorage.removeItem(PENDING_LEGAL_KEY).catch(() => {});
        // while still signed in: this phone stops getting the person's pushes (never throws, ≤ 8 s; docs/specs/27-push.md)
        await forgetThisPhone();
        // #1633: offline too; the «signed out» event then wipes the person's company from the phone
        await signOutAndMark(supabase.auth, signedUid.current, () => {
          forgetMems();
          clearClosed();
        });
      },
      reloadMemberships,
      membershipsFor,
      membershipStamp,
      accessDenied,
      accountDeleted,
      setAccountDeleted,
      closedCompanies,
    }),
    [ready, session, memberships, reloadMemberships, membershipsFor, membershipStamp, accessDenied, legal, legalChecked, tickets, accountDeleted, closedCompanies],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
