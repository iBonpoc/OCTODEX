import { describe, expect, it } from "vitest";
import { menuPick } from "../src/ui/menuPick";

/** #743: a menu item that opens a sheet hung the iPhone — the pick ran while the menu's Modal was still closing */
function setup(waitsForDismiss: boolean) {
  const log: string[] = [];
  const frames: (() => void)[] = [];
  const timers: { f: () => void; ms: number; cancelled: boolean }[] = [];
  const p = menuPick<string>({
    close: () => log.push("close"),
    select: (k) => log.push(`select:${k}`),
    waitsForDismiss,
    nextFrame: (f) => frames.push(f),
    later: (f, ms) => {
      const t = { f, ms, cancelled: false };
      timers.push(t);
      return () => (t.cancelled = true);
    },
    waitMs: 510,
  });
  /** the timers that are still due go off */
  const fire = () => timers.filter((t) => !t.cancelled).forEach((t) => t.f());
  return { p, log, frames, timers, fire };
}

describe("menuPick (#743)", () => {
  it("iOS: closes first; the pick runs only when the Modal is gone", () => {
    const { p, log, frames } = setup(true);
    p.pick("relink");
    expect(log).toEqual(["close"]);
    expect(frames).toHaveLength(0);
    p.dismissed();
    expect(log).toEqual(["close", "select:relink"]);
  });

  it("iOS: the pick runs once, a second dismiss does nothing", () => {
    const { p, log } = setup(true);
    p.pick("a");
    p.dismissed();
    p.dismissed();
    expect(log).toEqual(["close", "select:a"]);
  });

  it("closed without a pick (a tap outside): dismiss selects nothing", () => {
    const { p, log } = setup(true);
    p.dismissed();
    expect(log).toEqual([]);
  });

  it("Android / web: closes first, the pick on the next frame", () => {
    const { p, log, frames } = setup(false);
    p.pick("status");
    expect(log).toEqual(["close"]);
    expect(frames).toHaveLength(1);
    frames[0]!();
    expect(log).toEqual(["close", "select:status"]);
  });

  it("the last item pressed wins", () => {
    const { p, log } = setup(true);
    p.pick("a");
    p.pick("b");
    p.dismissed();
    expect(log).toEqual(["close", "close", "select:b"]);
  });

  it("iOS: onDismiss never comes — the pick runs on the timer, once", () => {
    const { p, log, timers, fire } = setup(true);
    p.pick("relink");
    expect(timers).toHaveLength(1);
    expect(timers[0]!.ms).toBe(510);
    expect(log).toEqual(["close"]);
    fire();
    expect(log).toEqual(["close", "select:relink"]);
    p.dismissed(); // a late dismiss after the timer: no second pick
    expect(log).toEqual(["close", "select:relink"]);
  });

  it("iOS: onDismiss came — the timer is cancelled and does not pick a second time", () => {
    const { p, log, timers, fire } = setup(true);
    p.pick("a");
    p.dismissed();
    expect(timers[0]!.cancelled).toBe(true);
    fire();
    timers[0]!.f(); // even if a cancelled timer went off anyway
    expect(log).toEqual(["close", "select:a"]);
  });

  it("Android / web: no timer", () => {
    const { p, timers } = setup(false);
    p.pick("a");
    expect(timers).toHaveLength(0);
  });
});
