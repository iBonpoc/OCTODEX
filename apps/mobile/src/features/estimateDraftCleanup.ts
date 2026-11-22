/**
 * #2381 Ж1 (review 3): the edits of an estimate deleted on another phone are dropped once the store is loaded — not only when its
 * editor opens (it cannot be opened: the estimate is gone). Straight on the device (one read, one write), only while no estimate
 * editor is open: an open editor holds its own copy of the list and writes it (a second hook on the same key would overwrite its
 * new edits). Pure part `dropOrphanEdits` — test/estimateDraftCleanup.test.ts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import { useAuth } from "@/cloud/auth";
import { useStore } from "@/data/store";
import { draftsKey, isEditCtx, type EstimateDraft } from "./estimateDraft";

/** the list without the edits of estimates that are not there; the same list when there is none (nothing to write) */
export function dropOrphanEdits<T extends Pick<EstimateDraft, "ctx" | "estimateId">>(list: readonly T[], exists: (id: string) => boolean): T[] {
  return list.some((d) => isEditCtx(d.ctx) && !exists(d.estimateId)) ? list.filter((d) => !isEditCtx(d.ctx) || exists(d.estimateId)) : (list as T[]);
}

type Kv = { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void> };
/** one key's list cleaned on the device; true — something was dropped. A list that cannot be read is left as it is. */
export async function dropOrphanEditDrafts(key: string, exists: (id: string) => boolean, s: Kv = AsyncStorage as unknown as Kv): Promise<boolean> {
  try {
    const raw = await s.getItem(key);
    if (!raw) return false;
    const list = JSON.parse(raw) as EstimateDraft[];
    if (!Array.isArray(list)) return false;
    const next = dropOrphanEdits(list, exists);
    if (next === list) return false;
    await s.setItem(key, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** an estimate editor is open: the cleanup waits (it owns the list while open) */
let editorsOpen = 0;
export function useEditorOpenMark() {
  useEffect(() => {
    editorsOpen += 1;
    return () => {
      editorsOpen -= 1;
    };
  }, []);
}

/** run where the app's tabs live: once the company's data is loaded, and again when the estimates change */
export function useOrphanEditCleanup() {
  const { mode, db, companyLoaded } = useStore();
  const auth = useAuth();
  const key = draftsKey(mode === "cloud", auth.company?.companyId, auth.userId);
  useEffect(() => {
    if (!key || !companyLoaded || editorsOpen > 0) return;
    const ids = new Set(db.estimates.map((e) => e.id));
    void dropOrphanEditDrafts(key, (id) => ids.has(id));
  }, [key, companyLoaded, db.estimates]);
}
