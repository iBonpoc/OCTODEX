/**
 * «Команда» и приглашение (wave 7-2, story map S21; docs/specs/13 §3.13, 19 §2 п.3–4). Pure — unit-tested in test/team.test.ts.
 * One role per person in the company (15-flows §4 в.4); the app shows owner and admin both as «Директор».
 */
import type { DbRole } from "@/cloud/auth";
import type { DB, Member, Role } from "@/data/types";

/** the roles an owner/admin gives on «Пригласить» (owner is never invited) */
export const INVITE_ROLES: readonly Role[] = ["tech", "sales", "dispatcher", "director"];

/** the server role for the chosen app role: «Директор» → admin, «Диспетчер» → office; a subcontractor is always «subcontractor» */
export function dbRoleFor(role: Role, kind: "employee" | "sub"): DbRole {
  if (kind === "sub") return "subcontractor";
  return role === "director" ? "admin" : role === "dispatcher" ? "office" : role === "sales" ? "sales" : "tech";
}

/** the link the invited person opens (it carries the token once; the server keeps only its hash) */
export const inviteLink = (origin: string, token: string) => `${origin.replace(/\/+$/, "")}/auth/invite?token=${encodeURIComponent(token)}`;

/** a usable email: something@domain.tld */
export const validInviteEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

export type TeamState = "active" | "pending" | "expired" | "disabled";
export function teamState(m: Member, now = Date.now()): TeamState {
  if (m.disabled) return "disabled";
  if (m.pending) return m.expiresAt && Date.parse(m.expiresAt) < now ? "expired" : "pending";
  return "active";
}

/** «Команда»: the people at work first, then the invited, then the switched off */
export function teamList(db: DB, now = Date.now()): Member[] {
  const order: Record<TeamState, number> = { active: 0, pending: 1, expired: 1, disabled: 2 };
  return db.members.map((m, i) => ({ m, i })).sort((a, b) => order[teamState(a.m, now)] - order[teamState(b.m, now)] || a.i - b.i).map((x) => x.m);
}

/** who may be switched off by me: not myself, not the owner (unless I am the owner — the server checks the same) */
export function canDisable(db: DB, me: string, target: Member): boolean {
  if (target.id === me || target.pending) return false;
  // the company keeps an active owner (the server checks the same)
  if (target.isOwner && !db.members.some((m) => m.isOwner && !m.pending && m.id !== target.id)) return false;
  const mine = db.members.find((m) => m.id === me);
  if (!mine?.roles.includes("director")) return false;
  return !target.isOwner || !!mine.isOwner;
}

/** the invitation link waits through sign-in / sign-up (the email confirmation may reopen the app) */
const PENDING_KEY = "octo.invite.token.v1";
export const isInviteToken = (t: string | undefined) => !!t && /^[A-Za-z0-9_-]{20,200}$/.test(t);
export async function rememberInvite(token: string, store: { setItem: (k: string, v: string) => Promise<void> }) {
  if (isInviteToken(token)) await store.setItem(PENDING_KEY, token);
}
export async function takeInvite(store: { getItem: (k: string) => Promise<string | null>; removeItem: (k: string) => Promise<void> }): Promise<string | null> {
  const v = await store.getItem(PENDING_KEY);
  if (v) await store.removeItem(PENDING_KEY);
  return isInviteToken(v ?? undefined) ? v : null;
}
export const peekInviteKey = PENDING_KEY;

/** a server refusal → the words of the app (rule 7: no raw server text on screen) */
export type TeamErrorKey = "team.err.otherEmail" | "team.err.expired" | "team.err.already" | "team.err.confirm" | "team.err.noInvite" | "team.err.lastOwner" | "team.err.rights" | "team.err.generic";
export function teamErrorKey(message: string): TeamErrorKey {
  const m = message.toLowerCase();
  if (m.includes("another email")) return "team.err.otherEmail";
  if (m.includes("expired")) return "team.err.expired";
  if (m.includes("already on the team") || m.includes("already accepted")) return "team.err.already";
  if (m.includes("confirm your email")) return "team.err.confirm";
  if (m.includes("no such invitation") || m.includes("invitation is")) return "team.err.noInvite";
  if (m.includes("active owner")) return "team.err.lastOwner";
  if (m.includes("only the owner") || m.includes("only owner") || m.includes("not yourself")) return "team.err.rights";
  return "team.err.generic";
}
