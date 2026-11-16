/**
 * #1912 «Обновить»: the rules (when to look, what the strip says) and the order of the press — the queue reaches the disk BEFORE the reload,
 * and a cold start after the reload reads it back. Native behaviour itself (reloadAsync) is not proven here: see the PR line «Натив».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
import { createWriter, flushAllWriters, liveWriters } from "../src/data/persist";
import { dirtySheetCount, noteQuestionCancelled, registerDirtySheet, settleDirtySheets } from "../src/ui/dirtySheets";
import { applyUpdate, CHECK_EVERY_MS, MIN_GAP_MS, needsNewBuild, parseCompat, rowState, shouldCheck, updateView } from "../src/features/updateRules";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("unit:update — when to look", () => {
  it("the first look is always allowed; a manual one ignores the pause", () => {
    expect(shouldCheck({ reason: "foreground", now: 1, lastAt: null })).toBe(true);
    expect(shouldCheck({ reason: "manual", now: 2, lastAt: 1 })).toBe(true);
  });
  it("coming back waits MIN_GAP_MS, the timer waits CHECK_EVERY_MS", () => {
    expect(shouldCheck({ reason: "foreground", now: MIN_GAP_MS - 1, lastAt: 0 })).toBe(false);
    expect(shouldCheck({ reason: "foreground", now: MIN_GAP_MS, lastAt: 0 })).toBe(true);
    expect(shouldCheck({ reason: "timer", now: CHECK_EVERY_MS - 1, lastAt: 0 })).toBe(false);
    expect(shouldCheck({ reason: "timer", now: CHECK_EVERY_MS, lastAt: 0 })).toBe(true);
  });
});

describe("unit:update — what the strip and the row say", () => {
  it("the web and a build without updates: nothing", () => {
    expect(updateView({ supported: false, downloaded: true, needsBuild: true })).toBe("none");
  });
  it("downloaded → ready; a too-old build is the stronger word; nothing downloaded → none", () => {
    expect(updateView({ supported: true, downloaded: true, needsBuild: false })).toBe("ready");
    expect(updateView({ supported: true, downloaded: true, needsBuild: true })).toBe("needsBuild");
    expect(updateView({ supported: true, downloaded: false, needsBuild: null })).toBe("none");
  });
  it("compat file: bad shapes are not known (null); per platform; no key of the platform — silence", () => {
    expect(parseCompat(null)).toBeNull();
    expect(parseCompat({ runtime: "x" })).toBeNull();
    expect(parseCompat({ runtime: {} })).toBeNull();
    const c = parseCompat({ runtime: { ios: " exposdk:58.0.0 ", android: "fp:abc" }, build: 7 });
    expect(c).toEqual({ runtime: { ios: "exposdk:58.0.0", android: "fp:abc" }, build: 7 });
    expect(needsNewBuild("exposdk:58.0.0", c, "ios")).toBe(false);
    expect(needsNewBuild("exposdk:58.0.0", c, "android")).toBe(true);
    expect(needsNewBuild("exposdk:58.0.0", parseCompat({ runtime: { ios: "exposdk:58.0.0" } }), "android")).toBeNull();
    expect(needsNewBuild("exposdk:58.0.0", null, "ios")).toBeNull(); // no file, no network: silence
    expect(needsNewBuild(undefined, c, "ios")).toBeNull();
    expect(needsNewBuild("x", c, "web")).toBeNull();
  });
  it("the row: ready and needsBuild win; then checking; then latest only after a good look", () => {
    expect(rowState({ checking: true, view: "ready", checkedOnce: true })).toBe("ready");
    expect(rowState({ checking: true, view: "needsBuild", checkedOnce: false })).toBe("needsBuild");
    expect(rowState({ checking: true, view: "none", checkedOnce: false })).toBe("checking");
    expect(rowState({ checking: false, view: "none", checkedOnce: true })).toBe("latest");
    expect(rowState({ checking: false, view: "none", checkedOnce: false })).toBe("unknown");
  });
});

describe("unit:update — the sheets with unsaved work", () => {
  it("none open: settled at once", async () => {
    expect(await settleDirtySheets()).toBe(true);
  });
  it("asks the last opened first; goes on when it is closed; true when none is left", async () => {
    const asked: string[] = [];
    const offs: (() => void)[] = [];
    const mk = (n: string) => ({ ask: () => { asked.push(n); setTimeout(() => offs[n === "a" ? 0 : 1](), 10); } });
    offs.push(registerDirtySheet(mk("a")), registerDirtySheet(mk("b")));
    expect(dirtySheetCount()).toBe(2);
    const p = settleDirtySheets();
    await vi.advanceTimersByTimeAsync(50);
    expect(await p).toBe(true);
    expect(asked).toEqual(["b", "a"]);
    expect(dirtySheetCount()).toBe(0);
  });
  it("«Отмена» in the question stops the update (false), the sheet stays", async () => {
    const off = registerDirtySheet({ ask: () => setTimeout(noteQuestionCancelled, 5) });
    const p = settleDirtySheets();
    await vi.advanceTimersByTimeAsync(10);
    expect(await p).toBe(false);
    expect(dirtySheetCount()).toBe(1);
    off();
  });
  it("a question nobody answers is not waited for forever", async () => {
    const off = registerDirtySheet({ ask: () => {} });
    const p = settleDirtySheets(1000);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toBe(false);
    off();
  });
});

describe("unit:update — the press: the queue is on the disk BEFORE the reload, and a cold start keeps it", () => {
  it("order: unsaved sheets → flush → settle → reload; a cancelled question never reloads", async () => {
    const log: string[] = [];
    const base = { flush: () => void log.push("flush"), settle: async () => void log.push("settle"), reload: async () => void log.push("reload") };
    expect(await applyUpdate({ ...base, settleUnsaved: async () => (log.push("sheets"), true) })).toBe("reloaded");
    expect(log).toEqual(["sheets", "flush", "settle", "reload"]);
    log.length = 0;
    expect(await applyUpdate({ ...base, settleUnsaved: async () => (log.push("sheets"), false) })).toBe("cancelled");
    expect(log).toEqual(["sheets"]);
  });
  it("a write waiting in the debounce is on the disk when reload starts; the cold start reads the queue back", async () => {
    const disk = new Map<string, string>();
    const w = createWriter(async (k, v) => void disk.set(k, v), 250);
    (liveWriters() as Set<typeof w>).add(w); // what usePersistentState does for every mounted state
    const queue = JSON.stringify([{ id: "op1", kind: "customer.add" }, { id: "op2", kind: "estimate.send" }]);
    w.schedule("octo.queue.v1", queue); // the person's change, the debounce has not fired yet
    expect(disk.get("octo.queue.v1")).toBeUndefined();
    let diskAtReload: string | undefined;
    const r = await applyUpdate({
      settleUnsaved: async () => true,
      flush: () => flushAllWriters(),
      settle: async () => { await vi.advanceTimersByTimeAsync(0); },
      reload: async () => { diskAtReload = disk.get("octo.queue.v1"); },
    });
    expect(r).toBe("reloaded");
    expect(diskAtReload).toBe(queue); // before the reload — not after
    // the cold start after the reload: a fresh process reads the key from the disk
    expect(JSON.parse(disk.get("octo.queue.v1")!)).toHaveLength(2);
    (liveWriters() as Set<typeof w>).delete(w);
  });
});

describe("unit:update — the Gutters canvas holds the update until its drawing is on the phone", () => {
  it("what counts as unsaved: a finger down, a write on its way, a failed write", async () => {
    const { canvasUnsaved, unsentAfter } = await import("../src/modules/gutters/draw/unsent");
    expect(canvasUnsaved({ touching: false, unsent: false })).toBe(false);
    expect(canvasUnsaved({ touching: true, unsent: false })).toBe(true);
    expect(canvasUnsaved({ touching: false, unsent: true })).toBe(true);
    expect(unsentAfter("saved")).toBe(false);
    expect(unsentAfter("nothing")).toBe(false);
    expect(unsentAfter("failed")).toBe(true);
  });
  it("«Обновить» asks the canvas to write now and waits; it never reloads while the write fails", async () => {
    const { canvasUnsaved, unsentAfter } = await import("../src/modules/gutters/draw/unsent");
    let unsent = true;
    let off: () => void = () => {};
    let results: ("failed" | "saved")[] = ["failed", "saved"];
    const flush = () => { // what DrawScreen.flush does: the write ends, the sheet leaves the registry when nothing is unsent
      setTimeout(() => {
        unsent = unsentAfter(results.shift()!);
        if (!canvasUnsaved({ touching: false, unsent })) off();
      }, 5);
    };
    off = registerDirtySheet({ ask: flush });
    const reload = vi.fn(async () => {});
    const p = applyUpdate({ settleUnsaved: () => settleDirtySheets(60_000), flush: () => {}, settle: async () => {}, reload });
    await vi.advanceTimersByTimeAsync(20);
    expect(reload).not.toHaveBeenCalled(); // the first write failed: the canvas is still registered — the update waits
    expect(dirtySheetCount()).toBe(1);
    flush(); // the canvas tries again later (its own retry)
    await vi.advanceTimersByTimeAsync(20);
    expect(await p).toBe("reloaded");
    expect(reload).toHaveBeenCalledTimes(1);
    expect(dirtySheetCount()).toBe(0);
  });
  it("a write that never lands: the update gives up (no reload), the drawing stays", async () => {
    const off = registerDirtySheet({ ask: () => {} });
    const reload = vi.fn(async () => {});
    const p = applyUpdate({ settleUnsaved: () => settleDirtySheets(1000), flush: () => {}, settle: async () => {}, reload });
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toBe("cancelled");
    expect(reload).not.toHaveBeenCalled();
    off();
  });
});
