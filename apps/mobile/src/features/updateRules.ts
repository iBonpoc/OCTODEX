/**
 * «Обновить» in the app (#1912, founder 16.11.2026: «чтобы мне в приложении приходила кнопка „Обновить“, я обновлял, и у меня
 * появлялась новая сборка»). The pure part: when the phone looks for an update, what the strip says, and the order of the one
 * press — ask about unsaved work, put the waiting writes on disk, only then reload. The phone never reloads by itself.
 */

/** how often the phone looks while the app stays open (N minutes of the task) */
export const CHECK_EVERY_MS = 30 * 60 * 1000;
/** coming back to the app looks at once, but not more often than this (a person flipping between apps) */
export const MIN_GAP_MS = 5 * 60 * 1000;

export type CheckReason = "foreground" | "timer" | "manual";

/** is it time to look? `manual` (the person pressed «Проверить обновление») always is */
export function shouldCheck(p: { reason: CheckReason; now: number; lastAt: number | null }): boolean {
  if (p.reason === "manual") return true;
  if (p.lastAt === null) return true;
  const gap = p.now - p.lastAt;
  return p.reason === "timer" ? gap >= CHECK_EVERY_MS : gap >= MIN_GAP_MS;
}

/** what the strip shows: nothing, «a new version is ready» (downloaded, one press), «this build is too old for the new code» */
export type UpdateView = "none" | "ready" | "needsBuild";

export function updateView(p: { supported: boolean; downloaded: boolean; needsBuild: boolean | null }): UpdateView {
  if (!p.supported) return "none";
  // a build too old for the published code is the stronger word: a button would never work (#1675)
  if (p.needsBuild === true) return "needsBuild";
  return p.downloaded ? "ready" : "none";
}

/** the file the release puts on the site next to the web app: the runtime of the newest publication per platform (iOS and Android fingerprints differ, #1675) */
export type Compat = { runtime: { ios?: string; android?: string }; build: number };

export function parseCompat(raw: unknown): Compat | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { runtime?: unknown; build?: unknown };
  if (!o.runtime || typeof o.runtime !== "object") return null;
  const r = o.runtime as { ios?: unknown; android?: unknown };
  const pick = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const runtime = { ios: pick(r.ios), android: pick(r.android) };
  if (!runtime.ios && !runtime.android) return null;
  const build = typeof o.build === "number" && Number.isFinite(o.build) ? o.build : 0;
  return { runtime, build };
}

/**
 * Does the running build need a newer one from TestFlight / the App Store? Unknown (no file, no network, no runtime) — null: the strip stays quiet.
 * The SDK cannot say it: a build whose runtime is not the published one is simply served nothing (reason «noUpdateAvailableOnServer»).
 */
export function needsNewBuild(runningRuntime: string | null | undefined, compat: Compat | null, platform: "ios" | "android" | string): boolean | null {
  const want = platform === "ios" || platform === "android" ? compat?.runtime[platform] : undefined;
  if (!want || !runningRuntime) return null; // no key for this platform: silence
  return runningRuntime.trim() !== want;
}

/** the row in Settings: what it says about the update */
export type UpdateRowState = "checking" | "latest" | "ready" | "needsBuild" | "unknown";

export function rowState(p: { checking: boolean; view: UpdateView; checkedOnce: boolean }): UpdateRowState {
  if (p.view === "needsBuild") return "needsBuild";
  if (p.view === "ready") return "ready";
  if (p.checking) return "checking";
  return p.checkedOnce ? "latest" : "unknown";
}

/** the order of the one press: «Обновить» → unsaved sheets ask first → writes go to disk → reload. A cancelled question stops it. */
export async function applyUpdate(p: {
  /** true — no sheet with unsaved work is open, or each one was saved/discarded; false — the person cancelled the question */
  settleUnsaved: () => Promise<boolean>;
  /** puts every waiting write (the offline queue among them) on the disk */
  flush: () => void | Promise<void>;
  /** lets the pending writes land (a macrotask), so `reload` never races them */
  settle: () => Promise<void>;
  reload: () => Promise<void>;
}): Promise<"reloaded" | "cancelled"> {
  if (!(await p.settleUnsaved())) return "cancelled";
  await p.flush();
  await p.settle();
  await p.reload();
  return "reloaded";
}
