/**
 * Step 18 P4c (docs/specs/27-push.md §4.11): which push groups a person sees, and whether one is on.
 * A person sees only the groups the server can send them (app.push_still_recipient, migrations 110000–140000):
 * - director (owner, admin): all five;
 * - dispatcher (office) and sales: «signed» and «viewed» as the author of an estimate, «visits» if put on one, «leads»;
 * - tech: «visits» and «leads» (a tech is no author of «signed» / «viewed», 140000);
 * - a subcontractor: nothing for now (§4.8 — not even visits, until he can open them).
 * Several roles — the union. Nothing saved for a group → the server's default: on, except «viewed» (app.push_enabled).
 */
import { PUSH_GROUPS, type PushGroup, type PushPrefs, type Role } from "@/data/types";

const BY_ROLE: Record<Role, readonly PushGroup[]> = {
  director: PUSH_GROUPS,
  dispatcher: ["signed", "visits", "leads", "viewed"],
  sales: ["signed", "visits", "leads", "viewed"],
  tech: ["visits", "leads"],
};

export function pushGroupsFor(roles: readonly Role[], sub: boolean): PushGroup[] {
  if (sub) return [];
  const mine = new Set(roles.flatMap((r) => BY_ROLE[r] ?? []));
  return PUSH_GROUPS.filter((g) => mine.has(g));
}

export const pushGroupOn = (prefs: PushPrefs | undefined, g: PushGroup): boolean => prefs?.[g] ?? g !== "viewed";
