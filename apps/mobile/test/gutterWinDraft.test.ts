/** #2412 PR3: the gutter / downspout window's draft — «есть правки / нет правок», «Сохранить» one step, «Не сохранять» as before (DS §7.3). */
import { describe, expect, it } from "vitest";
import { winDirty, winDiscard, winSave, winStartOn } from "../src/modules/gutters/draw/winDraft";
import type { Drawing } from "../src/modules/gutters/geometry";
import type { History } from "../src/modules/gutters/canvas/edit";

const run = (color: string) => ({ id: "r1", a: [0, 0], b: [120, 0], attrs: { profile: "K", size: "5", color, story: 1 } }) as unknown as Drawing["runs"][number];
const d0: Drawing = { runs: [run("white")], downspouts: [] };
const d1: Drawing = { runs: [run("black")], downspouts: [] };
const d2: Drawing = { runs: [run("brown")], downspouts: [] };
const older: Drawing = { runs: [], downspouts: [] };
const h0: History = { past: [older], future: [] };

describe("winStartOn", () => {
  it("the first edit remembers the drawing and history before it; later edits keep that start", () => {
    const s = winStartOn(null, d0, h0);
    expect(s).toEqual({ drawing: d0, hist: h0 });
    expect(winStartOn(s, d1, { past: [older, d0], future: [] })).toBe(s);
  });
});

describe("winDirty", () => {
  it("no edit in the window — no unsaved edits («Закрыть» closes at once)", () => {
    expect(winDirty(null, d1)).toBe(false);
  });
  it("an edit — unsaved («Закрыть» asks)", () => {
    expect(winDirty(winStartOn(null, d0, h0), d1)).toBe(true);
  });
  it("an edit taken back by hand (white → black → white) — nothing to ask", () => {
    expect(winDirty(winStartOn(null, d0, h0), { runs: [run("white")], downspouts: [] })).toBe(false);
  });
});

describe("winSave", () => {
  it("several edits stay as ONE step of «Назад»: the history before the window plus its start", () => {
    const s = winStartOn(null, d0, h0);
    const afterTwo: History = { past: [older, d0, d1], future: [] }; // two commits inside the window
    const h = winSave(s, d2, afterTwo);
    expect(h.past).toEqual([older, d0]);
    expect(h.future).toEqual([]);
  });
  it("nothing changed in the end — no step is added", () => {
    const s = winStartOn(null, d0, h0);
    expect(winSave(s, { runs: [run("white")], downspouts: [] }, { past: [older, d0], future: [] })).toBe(h0);
  });
  it("no window draft — the history stays", () => {
    const h: History = { past: [d0], future: [d1] };
    expect(winSave(null, d1, h)).toBe(h);
  });
});

describe("winDiscard", () => {
  it("«Не сохранять»: the drawing and history as before the window", () => {
    expect(winDiscard(winStartOn(null, d0, h0))).toEqual({ drawing: d0, hist: h0 });
  });
  it("no draft — nothing to put back", () => {
    expect(winDiscard(null)).toBeNull();
  });
});
