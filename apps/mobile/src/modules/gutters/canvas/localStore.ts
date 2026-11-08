/**
 * M4: the drawing is kept on the phone (docs/specs/33-gutters-canvas.md П20.2 №5). One draft; the shape is the
 * database's (П19), so M5 replaces this file with module.op and nothing else changes. The toolbar's place is a
 * per-phone convenience.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MeasurementStore } from "./model";
import { makeLocalStore } from "./draftStore";

const TOOLBAR = "octo.mod.gutters.toolbar.v1";

export type ToolbarPlace = "bottom" | "right" | "left";
export const TOOLBAR_PLACES: ToolbarPlace[] = ["bottom", "right", "left"];

export const localStore: MeasurementStore = makeLocalStore(AsyncStorage);

export async function loadToolbarPlace(): Promise<ToolbarPlace> {
  try {
    const v = await AsyncStorage.getItem(TOOLBAR);
    return TOOLBAR_PLACES.includes(v as ToolbarPlace) ? (v as ToolbarPlace) : "bottom";
  } catch {
    return "bottom";
  }
}
export const saveToolbarPlace = (p: ToolbarPlace) => AsyncStorage.setItem(TOOLBAR, p).catch(() => {});
