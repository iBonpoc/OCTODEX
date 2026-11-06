/**
 * Wave 7б-1 (docs/specs/03 §12): personal settings that follow the person to every device (db.prefs ↔ member_prefs).
 * «Показывать выполненные» used to live on the device only (octo.planShowDone.v1): a «show» chosen there moves into the
 * personal setting once, then the device key is cleared.
 */
import { useEffect } from "react";
import { usePersistentState } from "@/data/persist";
import { useStore } from "@/data/store";
import { MEMBER_PREFS_DEFAULT } from "@/data/types";
import { LEGACY_PLAN_SHOW_DONE_KEY, legacyShowDoneMove } from "./prefsMove";

export function usePlanShowDone(): [boolean, (v: boolean) => void] {
  const { db, setPrefs } = useStore();
  const [legacy, setLegacy, legacyReady] = usePersistentState<boolean | null>(LEGACY_PLAN_SHOW_DONE_KEY, null);
  useEffect(() => {
    if (!legacyReady || legacy === null) return;
    const patch = legacyShowDoneMove(legacy, db.prefs);
    if (patch) setPrefs(patch);
    setLegacy(null);
  }, [legacyReady, legacy]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = (db.prefs ?? MEMBER_PREFS_DEFAULT).planShowDone;
  return [value, (v) => { if (v !== value) setPrefs({ planShowDone: v }); }];
}
