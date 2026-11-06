/** Wave 7б-1: the one-time move of «Показывать выполненные» from the device into the personal setting (pure, tested) */
import { MEMBER_PREFS_DEFAULT, type MemberPrefs } from "@/data/types";

export const LEGACY_PLAN_SHOW_DONE_KEY = "octo.planShowDone.v1";

/** what the one-time move does with the old device value: null — nothing to write */
export function legacyShowDoneMove(legacy: unknown, prefs: MemberPrefs | undefined): Partial<MemberPrefs> | null {
  if (legacy !== true) return null;
  return (prefs ?? MEMBER_PREFS_DEFAULT).planShowDone ? null : { planShowDone: true };
}
