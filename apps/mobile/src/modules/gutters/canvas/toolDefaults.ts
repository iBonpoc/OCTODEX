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

/** anything set (an empty entry is not kept) */
export const hasAny = (nd: NewDefaults | undefined): boolean => !!(nd && (nd.run || nd.ds));

/** one measurement's entry set (empty — removed); the same map back when nothing changes (no write) */
export function putDefaults(map: DefaultsMap, id: string, nd: NewDefaults): DefaultsMap {
  if (JSON.stringify(map[id] ?? null) === JSON.stringify(hasAny(nd) ? nd : null)) return map;
  const { [id]: _was, ...rest } = map;
  return hasAny(nd) ? { ...rest, [id]: nd } : rest;
}

/**
 * The measurement became known (opened, or a new one first saved) and its entry was read: what the screen uses now. A choice made on the
 * screen before (a new drawing, or while the read went on) is newer than the stored one — it wins and is written (code-reviewer #1563 PR B:
 * it was lost); nothing chosen — the stored one.
 */
export function adopt(local: NewDefaults, stored: NewDefaults | undefined): { nd: NewDefaults; write: boolean } {
  return hasAny(local) ? { nd: local, write: true } : { nd: stored ?? {}, write: false };
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

/**
 * Every change of the stored map goes through one queue and re-reads the map first (code-reviewer #1563 PR B): two drawing screens open (a
 * link to another measurement, two tabs on the web) never write over each other's entries with an old copy.
 */
let queue: Promise<unknown> = Promise.resolve();
function change(f: (map: DefaultsMap) => DefaultsMap): Promise<void> {
  const run = queue.then(async () => {
    const map = await loadDefaults();
    const next = f(map);
    if (next !== map) await saveDefaults(next);
  });
  queue = run.catch(() => {});
  return run;
}

/** one measurement's entry written (empty — removed) */
export const storeDefaults = (id: string, nd: NewDefaults) => change((map) => putDefaults(map, id, nd));

/** the entries of measurements that are gone dropped — only when the phone's data is loaded (`live` is then the whole list), the open one kept */
export const pruneStored = (live: ReadonlySet<string>) => change((map) => prune(map, live));

/** one measurement's entry, as stored now (after the writes queued before) */
export const readDefaults = (id: string): Promise<NewDefaults | undefined> => queue.then(() => loadDefaults()).then((map) => map[id]);
