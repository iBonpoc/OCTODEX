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

/**
 * The name of a person on screen (wave 7а-2b, S22). Someone who deleted their account has no name in the data (the
 * server does not give it, and a translated word must not sit in the cache or reach a client's PDF): they are
 * «Удалённый пользователь» in the viewer's language. `deleted` — `t` of the screen, or the ready word for pure code.
 * Undefined for an unknown id, so `?? fallback` still works.
 */
export type DeletedWord = string | ((key: "acct.deletedName") => string);
export function memberLabel(m: Pick<Member, "name" | "deleted"> | null | undefined, deleted: DeletedWord): string | undefined {
  if (!m) return undefined;
  if (m.deleted) return typeof deleted === "string" ? deleted : deleted("acct.deletedName");
  return m.name;
}
export const memberName = (db: Pick<DB, "members">, id: string | null | undefined, deleted: DeletedWord): string | undefined =>
  id ? memberLabel(db.members.find((m) => m.id === id), deleted) : undefined;

/** not at work in the company (docs/specs/22 §2): deleted their account or switched off — their leads and tasks go to the
 *  office in «Требует внимания». Invited and not joined yet is not «gone»; an id not in `members` (old data) is not either. */
export const isGone = (m: Pick<Member, "deleted" | "disabled"> | null | undefined): boolean => !!m && (!!m.deleted || !!m.disabled);
/** the member behind an id is not at work any more */
export const goneId = (db: Pick<DB, "members">, id: string | null | undefined): boolean => !!id && isGone(db.members.find((m) => m.id === id));

export type TeamState = "active" | "pending" | "expired" | "disabled";
export function teamState(m: Member, now = Date.now()): TeamState {
  if (m.disabled) return "disabled";
  if (m.pending) return m.expiresAt && Date.parse(m.expiresAt) < now ? "expired" : "pending";
  return "active";
}

/** «Команда»: the people at work first, then the invited, then the switched off. Deleted accounts are not on the team
 *  (S22): they stay in `members` only so old records find them. */
export function teamList(db: DB, now = Date.now()): Member[] {
  const order: Record<TeamState, number> = { active: 0, pending: 1, expired: 1, disabled: 2 };
  return db.members.filter((m) => !m.deleted).map((m, i) => ({ m, i })).sort((a, b) => order[teamState(a.m, now)] - order[teamState(b.m, now)] || a.i - b.i).map((x) => x.m);
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

/**
 * #1866: the role of a person already on the team — the server's employee roles (an owner is made by a transfer only, a
 * subcontractor ↔ an employee by a new invitation). The app's Member has no server role: «director» without the owner
 * mark is an admin (as canDisable). The same rules as public.set_member_role (T301); the server decides.
 */
export type TeamRole = "admin" | "office" | "sales" | "tech";
export const TEAM_ROLES: readonly TeamRole[] = ["tech", "sales", "office", "admin"];
export const teamDbRole = (r: TeamRole): DbRole => r;
/** the role as the server has it; null — the owner, a subcontractor, someone not working (not changed here) */
export function teamRoleOf(m: Member): TeamRole | null {
  if (m.kind === "sub" || m.pending) return null;
  if (m.roles.includes("director")) return m.isOwner ? null : "admin";
  if (m.roles.includes("dispatcher")) return "office";
  if (m.roles.includes("sales")) return "sales";
  return "tech";
}
/** may I change this person's role: a director, never my own, never the owner or a subcontractor; an admin — the owner only */
export function canChangeRole(db: DB, me: string, target: Member): boolean {
  if (target.id === me) return false;
  const mine = db.members.find((m) => m.id === me);
  if (!mine?.roles.includes("director") || mine.pending) return false;
  const now = teamRoleOf(target);
  if (!now) return false;
  return now !== "admin" || !!mine.isOwner;
}
/** the roles I may give (an admin may raise to admin, as an invitation can; the server asks for a fresh sign-in) */
export function roleChoices(db: DB, me: string): TeamRole[] {
  const mine = db.members.find((m) => m.id === me);
  return mine?.roles.includes("director") && !mine.pending ? [...TEAM_ROLES] : [];
}

/** the words of a role (the app shows admin as «Директор», office as «Диспетчер») */
export const roleLabelKey = (r: TeamRole): "role.director" | "role.dispatcher" | "role.sales" | "role.tech" =>
  r === "admin" ? "role.director" : r === "office" ? "role.dispatcher" : r === "sales" ? "role.sales" : "role.tech";
/** the only admin (not the owner) at work: lowering them leaves no one to hand the company over to (transfer_ownership) */
export const soleAdmin = (db: DB, id: string): boolean =>
  !db.members.some((m) => m.id !== id && !m.pending && m.kind === "employee" && m.roles.includes("director") && !m.isOwner);

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
export type TeamErrorKey = "team.err.otherEmail" | "team.err.expired" | "team.err.already" | "team.err.confirm" | "team.err.noInvite" | "team.err.lastOwner" | "team.err.rights" | "team.err.signInAgain" | "team.err.again" | "team.err.gone" | "team.err.generic";
export function teamErrorKey(message: string): TeamErrorKey {
  const m = message.toLowerCase();
  if (m.includes("another email")) return "team.err.otherEmail";
  if (m.includes("expired")) return "team.err.expired";
  if (m.includes("already on the team") || m.includes("already accepted")) return "team.err.already";
  if (m.includes("confirm your email")) return "team.err.confirm";
  if (m.includes("no such invitation") || m.includes("invitation is")) return "team.err.noInvite";
  if (m.includes("active owner") || m.includes("keeps a director")) return "team.err.lastOwner";
  // #1866 set_member_role: a fresh sign-in for raising to admin; a lock taken — try again; the person is not on the team now
  if (m.includes("sign in again")) return "team.err.signInAgain";
  if (m.includes("try again")) return "team.err.again";
  if (m.includes("no such person")) return "team.err.gone";
  if (m.includes("only the owner") || m.includes("only owner") || m.includes("not yourself")) return "team.err.rights";
  return "team.err.generic";
}
