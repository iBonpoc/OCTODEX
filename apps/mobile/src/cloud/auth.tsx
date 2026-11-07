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
import { authEventPlan, goneChecker } from "@/features/deleteAccount";

/** Where email links (confirm / magic link) return. Must be in Supabase Auth → URL Configuration. */
const redirectTo = () => (Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : WEB_APP_URL);

export type DbRole = "owner" | "admin" | "office" | "sales" | "tech" | "subcontractor";
export interface Membership {
  companyId: string;
  companyName: string;
  role: DbRole;
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
  signUpPassword: (email: string, password: string, name: string) => Promise<string | null>;
  createCompany: (name: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  reloadMemberships: () => Promise<unknown>;
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
}

const Ctx = createContext<AuthCtx | null>(null);

/** Email sign-in (code or password), the user's companies and roles (docs/04 §1 User, Company, Membership). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [legal, setLegal] = useState<LegalState>("unknown");
  const [legalChecked, setLegalChecked] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const checkedUid = useRef<string | null>(null);
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

  const reloadMemberships = useCallback(async (): Promise<Membership[] | null> => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) {
      setMemberships([]);
      return [];
    }
    const { data, error } = await supabase
      .from("memberships")
      .select("company_id, role, status, companies(name)")
      .eq("user_id", s.session.user.id)
      .eq("status", "active");
    const list = (data ?? []).map((m: { company_id: string; role: DbRole; companies: { name: string } | { name: string }[] | null }) => ({
      companyId: m.company_id,
      role: m.role,
      companyName: Array.isArray(m.companies) ? (m.companies[0]?.name ?? "") : (m.companies?.name ?? ""),
    }));
    setMemberships(list);
    // null — no answer (no network): «no memberships» is not known then
    return error ? null : list;
  }, []);

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
        setMemberships([]);
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
      if (!alive) return;
      setSession(data.session);
      if (data.session) await afterSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      const plan = authEventPlan(e, s?.user.id ?? null, checkedUid.current);
      if (!s) {
        setSession(null);
        checkedUid.current = null;
        gone.forget();
        setMemberships([]);
        setLegal("unknown");
        setLegalChecked(false);
        return;
      }
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
        await supabase.auth.signOut();
        setMemberships([]);
      },
      reloadMemberships,
      accountDeleted,
      setAccountDeleted,
    }),
    [ready, session, memberships, reloadMemberships, legal, legalChecked, tickets, accountDeleted],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
