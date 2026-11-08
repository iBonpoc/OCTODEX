/**
 * What the canvas keeps on the phone itself: the toolbar's place (a per-phone convenience) and the one draft M4b kept
 * here before the measurement went to the core's queue (spec 33 П21 M5a) — moved in once, then forgotten.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ElementRow, MeasurementRow } from "./model";
import { DRAFT_KEY, makeLocalStore } from "./draftStore";

const TOOLBAR = "octo.mod.gutters.toolbar.v1";

export type ToolbarPlace = "bottom" | "right" | "left";
export const TOOLBAR_PLACES: ToolbarPlace[] = ["bottom", "right", "left"];

/** the M4b draft, if this phone has one */
export const takeOldDraft = (): Promise<{ m: MeasurementRow; elements: ElementRow[] } | null> => makeLocalStore(AsyncStorage).load();
export const forgetOldDraft = () => AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});

export async function loadToolbarPlace(): Promise<ToolbarPlace> {
  try {
    const v = await AsyncStorage.getItem(TOOLBAR);
    return TOOLBAR_PLACES.includes(v as ToolbarPlace) ? (v as ToolbarPlace) : "bottom";
  } catch {
    return "bottom";
  }
}
export const saveToolbarPlace = (p: ToolbarPlace) => AsyncStorage.setItem(TOOLBAR, p).catch(() => {});
