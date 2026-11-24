/**
 * The state and the actions of «Обновить» (#1912): one place for the whole app — the strip under every header and the row in Settings read it.
 * The phone looks for an update when the app comes back and every `CHECK_EVERY_MS`, downloads it in the background and only says so; it
 * reloads when the person presses «Обновить» (updateRules.ts). No network, an error — silence. The web has no over-the-air update at all.
 */
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import * as Updates from "expo-updates";
import { WEB_APP_URL } from "@/config/backend";
import { flushAllWriters } from "@/data/persist";
import { settleDirtySheets } from "@/ui/dirtySheets";
import { applyUpdate, needsNewBuild, parseCompat, shouldCheck, type CheckReason, type Compat } from "./updateRules";

export type UpdateState = {
  /** a look is under way (the row says «Проверяем…») */
  checking: boolean;
  /** at least one look has ended well in this launch */
  checkedOnce: boolean;
  lastAt: number | null;
  /** the update is on the phone and waits for the press */
  downloaded: boolean;
  /** the running build is older than the published code (null: not known) */
  needsBuild: boolean | null;
  /** the person hid the strip: it comes back at the next launch */
  hidden: boolean;
  /** «Обновить» was pressed, the reload is on its way */
  applying: boolean;
};

let state: UpdateState = { checking: false, checkedOnce: false, lastAt: null, downloaded: false, needsBuild: null, hidden: false, applying: false };
/** not an animation: the wait for the compatibility file, and the pause that lets pending writes settle before a reload, ms */
const COMPAT_TIMEOUT_MS = 8000;
const SETTLE_MS = 150;
const subs = new Set<() => void>();
const set = (p: Partial<UpdateState>) => {
  state = { ...state, ...p };
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

export const useUpdateState = (): UpdateState => useSyncExternalStore(subscribe, () => state, () => state);

/** over-the-air updates exist only in a phone build with expo-updates on (not the web, not a local `expo start`) */
export const updatesSupported = (): boolean => Platform.OS !== "web" && Updates.isEnabled;

async function readCompat(): Promise<Compat | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), COMPAT_TIMEOUT_MS);
    const r = await fetch(`${WEB_APP_URL}/app-compat.json?t=${Date.now()}`, { cache: "no-store", signal: ctl.signal });
    clearTimeout(timer);
    return r.ok ? parseCompat(await r.json()) : null;
  } catch {
    return null; // no network, no file: not known — the strip stays quiet
  }
}

/** looks for an update (and for «this build is too old»); never throws */
export async function checkForUpdate(reason: CheckReason): Promise<void> {
  if (!updatesSupported() || state.checking || state.applying) return;
  if (!shouldCheck({ reason, now: Date.now(), lastAt: state.lastAt })) return;
  set({ checking: true });
  try {
    const [compat, found] = await Promise.all([readCompat(), Updates.checkForUpdateAsync()]);
    const needs = needsNewBuild(Updates.runtimeVersion, compat, Platform.OS);
    if (found.isAvailable) {
      await Updates.fetchUpdateAsync();
      set({ downloaded: true, hidden: false });
    }
    set({ needsBuild: needs, checkedOnce: true, lastAt: Date.now() });
  } catch {
    set({ lastAt: Date.now() }); // silence; the next try waits its turn
  } finally {
    set({ checking: false });
  }
}

/** the update that the launch itself took over (useUpdates) is ready too */
export const noteDownloaded = (downloaded: boolean) => {
  if (downloaded && !state.downloaded) set({ downloaded: true });
};

export const hideStrip = () => set({ hidden: true });

/** «Обновить»: unsaved sheets are asked first, the waiting writes go to the disk, then the app reloads */
export async function applyDownloadedUpdate(): Promise<"reloaded" | "cancelled"> {
  if (state.applying) return "cancelled";
  set({ applying: true });
  try {
    const r = await applyUpdate({
      settleUnsaved: () => settleDirtySheets(),
      flush: () => flushAllWriters(),
      settle: () => new Promise((done) => setTimeout(done, SETTLE_MS)),
      reload: () => Updates.reloadAsync(),
    });
    if (r === "cancelled") set({ applying: false });
    return r;
  } catch {
    set({ applying: false });
    return "cancelled";
  }
}
