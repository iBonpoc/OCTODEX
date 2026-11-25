/**
 * #1662 (audit decision 15.11, the director's review of #1693): what the sign-out window says. Two kinds of «unsent», two lines:
 * the queue («Не отправлено: N» — it goes out when the network is there, and it stays on the phone through a sign-out: only its
 * owner sends it) and the estimate drafts («Черновики: M» — only on this device; a sign-out erases them if the person says so).
 * A line only when its number is above zero; nothing above zero — no window. The one destructive button, «Выйти и стереть»,
 * is about the drafts: with none there is nothing to erase and the exit is a plain «Выйти».
 */
export interface SignOutPlan {
  /** the window is shown */
  ask: boolean;
  queue: number;
  drafts: number;
  /** what the exit button does: erase the drafts too, or only sign out */
  exit: "wipe" | "leave";
}
export function signOutPlan(queue: number, drafts: number): SignOutPlan {
  const q = Math.max(0, Math.floor(queue));
  const d = Math.max(0, Math.floor(drafts));
  return { ask: q + d > 0, queue: q, drafts: d, exit: d > 0 ? "wipe" : "leave" };
}
