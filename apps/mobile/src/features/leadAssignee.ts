/**
 * Whom a new lead goes to (docs/14-leads-spec.md §6.4, вариант а; companies.lead_default_assignee_id).
 * The company's choice while that person is at work here; otherwise the owner (founder 04.11). Pure — test/leadAssignee.test.ts.
 */
import type { Company, ID, Member } from "@/data/types";

type People = readonly Pick<Member, "id" | "kind" | "roles" | "pending" | "isOwner">[];

/** who may be chosen: employees at work (not invited, switched off or deleted — `pending`); a subcontractor never gets leads */
export const leadAssigneeChoices = <M extends People[number]>(members: readonly M[]): M[] =>
  members.filter((m) => !m.pending && m.kind !== "sub");

/** the owner: `isOwner` (in the cloud admins are «director» too), else the first director, else me */
export function companyOwner(members: People, me: ID): ID {
  return members.find((m) => m.isOwner && !m.pending)?.id ?? members.find((m) => m.roles.includes("director") && !m.pending)?.id ?? me;
}

/** the company's choice is used only while that person is on `leadAssigneeChoices` (left, switched off, deleted → the owner) */
export function defaultLeadAssignee(company: Pick<Company, "leadDefaultAssigneeId"> | null | undefined, members: People, me: ID): ID {
  const want = company?.leadDefaultAssigneeId;
  if (want && leadAssigneeChoices(members).some((m) => m.id === want)) return want;
  return companyOwner(members, me);
}
