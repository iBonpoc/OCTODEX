/**
 * What the canvas keeps on the phone itself: the toolbar's place (a per-phone convenience). The one draft M4b kept here
 * (device-wide, no owner) is only forgotten: moved in, it would go to whoever is signed in (spec 33 П21, review M5a №6).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DRAFT_KEY } from "./draftStore";

const TOOLBAR = "octo.mod.gutters.toolbar.v1";

export type ToolbarPlace = "bottom" | "right" | "left";
export const TOOLBAR_PLACES: ToolbarPlace[] = ["bottom", "right", "left"];

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

/** the toolbar dropped by its grip (founder 08.11): it sticks to the nearest of the bottom, left and right edges */
export function placeAt(x: number, y: number, w: number, h: number): ToolbarPlace {
  const d = { left: x, right: w - x, bottom: h - y };
  return (Object.entries(d) as [ToolbarPlace, number][]).sort((a, b) => a[1] - b[1])[0]![0];
}
