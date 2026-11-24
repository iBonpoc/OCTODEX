/**
 * The invitation link page, as pure steps (7-2 S21 + 7а-1 consent; review #206 V1 — the race «invitation ↔ consent»).
 * Unit-tested in test/inviteFlow.test.ts. The page (app/auth/invite.tsx) only renders what these return.
 */
import type { LegalState } from "./legal";
import { legalErrorKey } from "./legal";
import { isInviteToken, peekInviteKey, teamErrorKey } from "./team";

export type InviteStep = "signIn" | "wait" | "legal" | "join";
/** what the page does now: not signed in → sign in; the consent not checked yet → wait; missing → ask here; else join */
export function inviteStep(o: { signedIn: boolean; legalChecked: boolean; legal: LegalState }): InviteStep {
  if (!o.signedIn) return "signIn";
  if (!o.legalChecked) return "wait";
  if (o.legal === "first" || o.legal === "changed") return "legal";
  return "join";
}

type KV = { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void>; removeItem: (k: string) => Promise<void> };
export type JoinOutcome = { kind: "joined"; companyId: string | null } | { kind: "noLink" } | { kind: "legal" } | { kind: "error"; key: string };

/**
 * Join by the link (from the address or the one remembered through sign-in). The remembered link is wiped ONLY when
 * joined or when the link is dead; a refusal for a missing consent keeps it (it is not the link's fault) — the page asks
 * for the consent and calls this again.
 */
export async function joinInvite(
  param: string | undefined,
  deps: { store: KV; accept: (token: string) => Promise<unknown>; reload: (companyId: string | null) => Promise<void> },
): Promise<JoinOutcome> {
  const remembered = await deps.store.getItem(peekInviteKey).catch(() => null);
  const token = isInviteToken(param) ? param! : isInviteToken(remembered ?? undefined) ? remembered! : null;
  if (!token) return { kind: "noLink" };
  let answer: unknown;
  try {
    answer = await deps.accept(token);
  } catch (e) {
    const msg = (e as Error).message;
    const legal = legalErrorKey(msg);
    if (legal === "legal.err.needed") {
      // keep the link for the retry after the consent (and for the next sign-in)
      await deps.store.setItem(peekInviteKey, token).catch(() => {});
      return { kind: "legal" };
    }
    // a dead link is not kept for the next sign-in (security-check 7-2)
    await deps.store.removeItem(peekInviteKey).catch(() => {});
    return { kind: "error", key: legal ?? teamErrorKey(msg) };
  }
  await deps.store.removeItem(peekInviteKey).catch(() => {});
  // spec 42 S28(в), #1673: the company just joined opens (accept_invitation answers its id); an odd answer — as before
  const id = (answer as { company_id?: unknown } | null)?.company_id;
  const companyId = typeof id === "string" && /^[0-9a-f-]{36}$/.test(id) ? id : null;
  await deps.reload(companyId);
  return { kind: "joined", companyId };
}
