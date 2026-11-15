import { cleanText } from "@/features/checklist";

/**
 * #1606: signing in with a code can make an account without a name (the name is typed only at the password sign-up). The name is
 * what colleagues see and what the company's signature carries (spec 49): without it the person shows as the e-mail. The app asks
 * for it once — «Как вас зовут?» — and does not ask again (saved or «Позже»).
 */
export const NAME_ASKED_KEY = "octo.nameAsk.v1";

/** a member without a name is shown by the e-mail (repo: full_name || email) — or by nothing */
export const needsName = (name: string | undefined | null): boolean => {
  const n = (name ?? "").trim();
  return n === "" || n.includes("@");
};

/** the people it has been asked of already (a JSON list of user ids on the device) */
export function parseAsked(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * ask now: signed in with a company, no name, not asked before. `name` undefined — I am not in the team list at all (a fresh
 * cache on a new phone, after a sign-out: the list is empty until the company loads) — is «not known», never «no name»:
 * asking then would write over a real name (the review of #1692).
 */
export const nameDue = (p: { userId: string | null; name: string | undefined; asked: string[] | null }): boolean =>
  !!p.userId && p.asked !== null && !p.asked.includes(p.userId) && p.name !== undefined && needsName(p.name);

/** the name as the server keeps it and as the screen shows it at once: control characters out, runs of spaces into one, cut */
export const cleanName = (s: string | undefined | null): string => cleanText(s ?? "", 120).replace(/\s+/g, " ").trim();
