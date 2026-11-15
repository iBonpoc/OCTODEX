/**
 * The properties of NEW gutters and downspouts of one drawing (#1563 PR B, spec 33-gutters-canvas-ui «Двойное нажатие на инструмент»;
 * founder 14.11: «на таб-баре, когда нажимаю два раза на этот [желоб] или на даунспот — свойства»). On the site the person sets «here all is
 * brown 6″» once, and every new gutter of this drawing takes it; what is drawn is not changed. None set — the company's defaults (settings).
 *
 * Kept on THIS phone, per measurement (director №9, option Б: no migration): another phone draws with the company's defaults. One key holds
 * every measurement's; the entries of measurements that are gone are dropped when the drawing screen opens (`prune`) — not at the delete
 * itself, which has «Отменить» for 5 s.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { newDsAttrs, newRunAttrs, type Choices } from "../settings";
import { changeDs, changeRun, type DsAttrs, type RunAttrs } from "./attrs";

/** what one drawing sets for its new objects; a kind not set — the company's defaults */
export interface NewDefaults { run?: RunAttrs; ds?: DsAttrs }
export type DefaultsMap = Record<string, NewDefaults>;

/** a new gutter's attributes: this drawing's, else the company's — on the story drawn now */
export function runFor(ch: Choices, story: number, nd?: NewDefaults): RunAttrs {
  return nd?.run ? { ...nd.run, story } : newRunAttrs(ch, story);
}

/** a new downspout's attributes: this drawing's, else the company's */
export function dsFor(ch: Choices, nd?: NewDefaults): DsAttrs {
  return nd?.ds ?? (newDsAttrs(ch) as DsAttrs);
}

/** a row of «Новые желоба» changed: the same rules as a gutter's own row (`changeRun`: a new profile takes its size and kit, …) */
export function patchRun(ch: Choices, nd: NewDefaults, patch: Partial<RunAttrs>): NewDefaults {
  const { story: _s, ...rest } = patch;
  return { ...nd, run: changeRun(runFor(ch, 1, nd), rest, ch) };
}

/** a row of «Новые водостоки» changed: as a downspout's own row (`changeDs`) */
export function patchDs(ch: Choices, nd: NewDefaults, patch: Partial<DsAttrs>): NewDefaults {
  return { ...nd, ds: changeDs(dsFor(ch, nd), patch, ch) };
}

/** «Как в настройках компании»: this kind of new objects takes the company's defaults again */
export function resetKind(nd: NewDefaults, kind: "run" | "ds"): NewDefaults {
  const { [kind]: _x, ...rest } = nd;
  return rest;
}

/** the entries of measurements that are no longer there (deleted, or never saved) go */
export function prune(map: DefaultsMap, live: ReadonlySet<string>): DefaultsMap {
  const keep = Object.entries(map).filter(([id]) => live.has(id));
  return keep.length === Object.keys(map).length ? map : Object.fromEntries(keep);
}

/** one measurement's entry set (empty — removed) */
export function putDefaults(map: DefaultsMap, id: string, nd: NewDefaults): DefaultsMap {
  const { [id]: _was, ...rest } = map;
  return nd.run || nd.ds ? { ...rest, [id]: nd } : rest;
}

export const NEW_DEFAULTS_KEY = "octo.mod.gutters.newDefaults.v1";

export async function loadDefaults(): Promise<DefaultsMap> {
  try {
    const raw = await AsyncStorage.getItem(NEW_DEFAULTS_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as DefaultsMap) : {};
  } catch {
    return {};
  }
}

export const saveDefaults = (map: DefaultsMap) => AsyncStorage.setItem(NEW_DEFAULTS_KEY, JSON.stringify(map)).catch(() => {});
