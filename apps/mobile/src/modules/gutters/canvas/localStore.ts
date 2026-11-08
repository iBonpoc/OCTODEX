/**
 * M4: the drawing is kept on the phone (docs/specs/33-gutters-canvas.md П20.2 №5). One draft; the shape is the
 * database's (П19), so M5 replaces this file with module.op and nothing else changes. The toolbar's place is a
 * per-phone convenience.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { applyChange, type ElementRow, type MeasurementRow, type MeasurementStore } from "./model";

const DRAFT = "octo.mod.gutters.draft.v1";
const TOOLBAR = "octo.mod.gutters.toolbar.v1";

export type ToolbarPlace = "bottom" | "right" | "left";
export const TOOLBAR_PLACES: ToolbarPlace[] = ["bottom", "right", "left"];

export const localStore: MeasurementStore = {
  async load() {
    try {
      const raw = await AsyncStorage.getItem(DRAFT);
      const v = raw ? (JSON.parse(raw) as { m?: MeasurementRow; elements?: ElementRow[] }) : null;
      return v?.m && Array.isArray(v.elements) ? { m: v.m, elements: v.elements } : null;
    } catch {
      return null;
    }
  },
  async save(m, ch) {
    const cur = await localStore.load();
    const elements = applyChange(cur?.m.id === m.id ? cur.elements : [], ch);
    await AsyncStorage.setItem(DRAFT, JSON.stringify({ m, elements }));
  },
};

export async function loadToolbarPlace(): Promise<ToolbarPlace> {
  try {
    const v = await AsyncStorage.getItem(TOOLBAR);
    return TOOLBAR_PLACES.includes(v as ToolbarPlace) ? (v as ToolbarPlace) : "bottom";
  } catch {
    return "bottom";
  }
}
export const saveToolbarPlace = (p: ToolbarPlace) => AsyncStorage.setItem(TOOLBAR, p).catch(() => {});
