/**
 * «Команда» on the server (wave 7-2, S21; supabase/migrations/20261106060000_team_invitations.sql). These need the network:
 * an invitation link is made by the server, so they are not queued offline (13 §3.13 «нужна сеть»).
 */
import type { DbRole } from "./auth";
import { supabase } from "./client";

const call = async <T,>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};

export const inviteMember = (companyId: string, email: string, role: DbRole, name?: string) =>
  call<{ id: string; token: string }>("invite_member", { p_company_id: companyId, p_email: email, p_role: role, p_name: name ?? null });
export const resendInvitation = (id: string) => call<{ id: string; token: string }>("resend_invitation", { p_id: id });
export const revokeInvitation = (id: string) => call<void>("revoke_invitation", { p_id: id });
export const acceptInvitation = (token: string) => call<{ company_id: string; role: DbRole; repeat: boolean }>("accept_invitation", { p_token: token });
export const setMemberStatus = (companyId: string, userId: string, status: "active" | "disabled") =>
  call<void>("set_member_status", { p_company_id: companyId, p_user_id: userId, p_status: status });
