import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./client";

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
  reloadMemberships: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

/** Email sign-in (code or password), the user's companies and roles (docs/04 §1 User, Company, Membership). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);

  const reloadMemberships = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) {
      setMemberships([]);
      return;
    }
    const { data } = await supabase
      .from("memberships")
      .select("company_id, role, status, companies(name)")
      .eq("user_id", s.session.user.id)
      .eq("status", "active");
    setMemberships(
      (data ?? []).map((m: { company_id: string; role: DbRole; companies: { name: string } | { name: string }[] | null }) => ({
        companyId: m.company_id,
        role: m.role,
        companyName: Array.isArray(m.companies) ? (m.companies[0]?.name ?? "") : (m.companies?.name ?? ""),
      })),
    );
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session) await reloadMemberships();
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) reloadMemberships();
      else setMemberships([]);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [reloadMemberships]);

  const value = useMemo<AuthCtx>(
    () => ({
      ready,
      session,
      userId: session?.user.id ?? null,
      email: session?.user.email ?? null,
      memberships,
      company: memberships[0] ?? null,
      sendCode: async (email) => {
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
      signUpPassword: async (email, password, name) => {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
        return error?.message ?? null;
      },
      createCompany: async (name) => {
        // The DB trigger makes the creator the active owner and seeds standard lead sources.
        const { error } = await supabase.from("companies").insert({ name });
        if (!error) await reloadMemberships();
        return error?.message ?? null;
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setMemberships([]);
      },
      reloadMemberships,
    }),
    [ready, session, memberships, reloadMemberships],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
