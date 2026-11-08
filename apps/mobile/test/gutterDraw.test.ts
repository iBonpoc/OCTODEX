/** Холст замера Gutters M4b (docs/specs/33-gutters-canvas.md П20.4): правка пальцем, «назад», строки как в П19. */
import { describe, expect, it } from "vitest";
import { addDownspout, addRun, endAt, finishStroke, hitTest, moveEnd, MIN_RUN_IN, pushHistory, redo, removeElement, restoreRemoved, setStory, startAt, undo, type History } from "../src/modules/gutters/canvas/edit";
import { makeLocalStore, makeSaver, type KV } from "../src/modules/gutters/canvas/draftStore";
import { applyChange, DEFAULT_DS_ATTRS, DEFAULT_RUN_ATTRS, diffElements, fromElements, toElements } from "../src/modules/gutters/canvas/model";
import type { Drawing } from "../src/modules/gutters/geometry";
import { toMeasurement } from "../src/modules/gutters/geometry";

const empty: Drawing = { runs: [], downspouts: [] };
const line = (d: Drawing, id: string, a: [number, number], b: [number, number]) => addRun(d, id, a, b, DEFAULT_RUN_ATTRS);
const L = (d: Drawing) => line(line(empty, "r1", [0, 0], [480, 0]), "r2", [480, 0], [480, 240]);

describe("drawing a line", () => {
  it("a slip shorter than 1 ft is not a line", () => {
    expect(line(empty, "x", [0, 0], [MIN_RUN_IN - 1, 0]).runs).toHaveLength(0);
    expect(line(empty, "x", [0, 0], [MIN_RUN_IN, 0]).runs).toHaveLength(1);
  });
  it("starts on an existing end when the finger is near it", () => {
    const d = L(empty);
    expect(startAt(d, [470, 8], 18)).toEqual([480, 0]);
    expect(startAt(d, [400, 100], 18)).toEqual([400, 100]);
  });
  it("ends on an existing end first; else the direction snaps to 45°", () => {
    const d = L(empty);
    expect(endAt(d, [0, 240], [470, 236], 18)).toEqual([480, 240]);
    expect(endAt(d, [0, 300], [200, 310], 18)).toEqual([200, 300]);
  });
  it("new line takes the default stock: 5″ K aluminum .027 white, story 1, hidden hangers on fascia", () => {
    expect(L(empty).runs[0]!.attrs).toEqual(DEFAULT_RUN_ATTRS);
    expect(DEFAULT_RUN_ATTRS).toMatchObject({ profile: "k", size: "5", story: 1, hanger: "hidden" });
  });
});

describe("what is under the finger", () => {
  const d = addDownspout(L(empty), "d1", [240, 5], 36, DEFAULT_DS_ATTRS);
  it("a downspout first, then a line's end, then the line", () => {
    expect(hitTest(d, [242, 3], 20)).toEqual({ kind: "ds", id: "d1" });
    expect(hitTest(d, [478, 230], 20)).toEqual({ kind: "end", id: "r2", end: 1 });
    expect(hitTest(d, [100, 6], 20)).toEqual({ kind: "run", id: "r1" });
    expect(hitTest(d, [300, 200], 20)).toBeNull();
  });
});

describe("downspouts", () => {
  it("sit on the nearest line, at the foot of the finger along it", () => {
    const d = addDownspout(L(empty), "d1", [120, 10], 36, DEFAULT_DS_ATTRS);
    expect(d.downspouts[0]).toMatchObject({ id: "d1", runId: "r1", atIn: 120, size: "2x3" });
  });
  it("nothing near → no downspout", () => expect(addDownspout(L(empty), "d1", [200, 200], 36, DEFAULT_DS_ATTRS).downspouts).toHaveLength(0));
  it("with a typed length, the position is along the typed length", () => {
    const d0 = L(empty);
    const d = { ...d0, runs: d0.runs.map((r) => (r.id === "r1" ? { ...r, lengthIn: 960 } : r)) };
    expect(addDownspout(d, "d1", [240, 0], 36, DEFAULT_DS_ATTRS).downspouts[0]!.atIn).toBe(480);
  });
});

describe("moving an end", () => {
  it("sticks to another line's end and drops the typed length", () => {
    const d0 = line(L(empty), "r3", [0, 240], [200, 240]);
    const d = { ...d0, runs: d0.runs.map((r) => (r.id === "r3" ? { ...r, lengthIn: 999 } : r)) };
    const m = moveEnd(d, "r3", 1, [470, 236], 18);
    expect(m.runs.find((r) => r.id === "r3")).toMatchObject({ a: [0, 240], b: [480, 240] });
    expect(m.runs.find((r) => r.id === "r3")!.lengthIn).toBeUndefined();
  });
  it("a downspout past the new end comes back onto the line", () => {
    const d = addDownspout(L(empty), "d1", [400, 0], 36, DEFAULT_DS_ATTRS);
    expect(moveEnd(d, "r1", 1, [200, 0], 5).downspouts[0]!.atIn).toBe(200);
  });
  it("not shorter than 1 ft", () => expect(moveEnd(L(empty), "r1", 1, [5, 0], 1)).toEqual(L(empty)));
});

describe("remove, storey", () => {
  const d = addDownspout(L(empty), "d1", [120, 0], 36, DEFAULT_DS_ATTRS);
  it("removing a line takes its downspouts", () => expect(removeElement(d, "r1")).toMatchObject({ runs: [{ id: "r2" }], downspouts: [] }));
  it("removing a downspout keeps the line", () => expect(removeElement(d, "d1").runs).toHaveLength(2));
  it("storey of one line", () => expect(setStory(d, "r2", 3).runs.map((r) => r.attrs.story)).toEqual([1, 3]));
});

describe("the canvas's own «назад»", () => {
  it("undo and redo walk the snapshots; a new edit clears redo", () => {
    let h: History = { past: [], future: [] };
    const d1 = L(empty);
    h = pushHistory(h, empty);
    const u = undo(h, d1)!;
    expect(u.d).toEqual(empty);
    const r = redo(u.h, u.d)!;
    expect(r.d).toEqual(d1);
    expect(pushHistory(u.h, u.d).future).toEqual([]);
    expect(undo({ past: [], future: [] }, d1)).toBeNull();
  });
  it("keeps at most 50 steps", () => {
    let h: History = { past: [], future: [] };
    for (let i = 0; i < 60; i++) h = pushHistory(h, empty);
    expect(h.past).toHaveLength(50);
  });
});

describe("rows in the shape of the database (П19)", () => {
  const d = addDownspout(L(empty), "d1", [120.4, 0], 36, DEFAULT_DS_ATTRS);
  const rows = toElements(d, "m1");
  it("run and downspout rows: whole inches, attrs = the engine's input, drawn by hand", () => {
    expect(rows.map((r) => [r.kind, r.confidence])).toEqual([["run", "drawn"], ["run", "drawn"], ["downspout", "drawn"]]);
    expect(rows[0]!.geom).toEqual({ a: [0, 0], b: [480, 0] });
    expect(rows[2]!.geom).toEqual({ runId: "r1", atIn: 120 });
    expect(rows.every((r) => JSON.stringify(r.geom).length <= 2000 && JSON.stringify(r.attrs).length <= 8000)).toBe(true);
  });
  it("a typed length is «рулетка» (taped)", () => {
    const t = toElements({ ...d, runs: [{ ...d.runs[0]!, lengthIn: 482 }] , downspouts: [] }, "m1");
    expect(t[0]).toMatchObject({ confidence: "taped", geom: { lengthIn: 482 } });
  });
  it("round trip", () => expect(fromElements(rows)).toEqual(d));
  it("broken rows and a downspout without its line are left out", () => {
    const bad = [...rows, { ...rows[0]!, id: "x", geom: { a: "nope" } }, { ...rows[2]!, id: "y", geom: { runId: "gone", atIn: 1 } }];
    expect(fromElements(bad)).toEqual(d);
  });
  it("diff → what to write: changed and new rows, removed ids; apply gives the new rows", () => {
    const after = toElements(setStory(removeElement(d, "d1"), "r2", 2), "m1");
    const ch = diffElements(rows, after);
    expect(ch.save.map((r) => r.id)).toEqual(["r2"]);
    expect(ch.remove).toEqual(["d1"]);
    expect(applyChange(rows, ch)).toEqual(after);
    expect(diffElements(after, after)).toEqual({ save: [], remove: [] });
  });
  it("the engine reads the drawn lines (corner between r1 and r2)", () => {
    const m = toMeasurement(d);
    expect(m.runs).toHaveLength(2);
    expect(m.corners).toHaveLength(1);
  });
});

describe("review #362: a finished stroke", () => {
  const nr = { id: "n", attrs: DEFAULT_RUN_ATTRS };
  it("a cancelled line (a second finger came for the zoom) adds nothing", () => {
    const d = L(empty);
    expect(finishStroke({ kind: "line", a: [0, 240] }, d, [300, 240], 18, true, nr)).toBe(d);
    expect(finishStroke({ kind: "line", a: [0, 240] }, d, [300, 240], 18, false, nr).runs).toHaveLength(3);
  });
  it("a cancelled end drag goes back; a finished one ends at the lift point (it snaps there)", () => {
    const d = line(L(empty), "r3", [0, 240], [200, 240]);
    const g = { kind: "end" as const, id: "r3", end: 1 as const, before: d };
    expect(finishStroke(g, moveEnd(d, "r3", 1, [300, 240], 18), [470, 236], 18, true, nr)).toBe(d);
    // the last frame drawn was at 300; the lift at 470 snaps to r2's end (480, 240)
    expect(finishStroke(g, moveEnd(d, "r3", 1, [300, 240], 18), [470, 236], 18, false, nr).runs.find((r) => r.id === "r3")!.b).toEqual([480, 240]);
  });
});

describe("review #362: «Отменить» after a delete keeps what was drawn since", () => {
  it("the deleted run and its downspout come back, the new run stays", () => {
    const before = addDownspout(L(empty), "d1", [120, 0], 36, DEFAULT_DS_ATTRS);
    const after = line(removeElement(before, "r1"), "r9", [0, 300], [300, 300]);
    const back = restoreRemoved(after, before, "r1");
    expect(back.runs.map((r) => r.id).sort()).toEqual(["r1", "r2", "r9"]);
    expect(back.downspouts.map((s) => s.id)).toEqual(["d1"]);
  });
  it("a deleted downspout comes back alone; nothing to restore → the same drawing", () => {
    const before = addDownspout(L(empty), "d1", [120, 0], 36, DEFAULT_DS_ATTRS);
    expect(restoreRemoved(removeElement(before, "d1"), before, "d1").downspouts).toHaveLength(1);
    expect(restoreRemoved(before, before, "d1")).toBe(before);
  });
  it("a downspout whose run is gone since stays out", () => {
    const before = addDownspout(L(empty), "d1", [120, 0], 36, DEFAULT_DS_ATTRS);
    const cur = removeElement(removeElement(before, "d1"), "r1");
    expect(restoreRemoved(cur, before, "d1").downspouts).toHaveLength(0);
  });
});

describe("review #362: the storey button makes no empty «назад» step", () => {
  it("the same storey → the same drawing", () => {
    const d = L(empty);
    expect(setStory(d, "r1", 1)).toBe(d);
    expect(setStory(d, "nope", 2)).toBe(d);
  });
});

describe("review #362: the phone's draft store", () => {
  const m = { id: "m1", label: null, status: "draft" as const, propertyId: null, leadId: null };
  const rows = (d: Drawing) => toElements(d, "m1");
  /** a storage whose reads and writes finish in a given order */
  function slowKV(): KV & { data: Map<string, string>; fail: boolean } {
    const data = new Map<string, string>();
    let n = 0;
    const kv = {
      data,
      fail: false,
      getItem: async (k: string) => {
        await new Promise((r) => setTimeout(r, 5 - (n++ % 3)));
        return data.get(k) ?? null;
      },
      setItem: async (k: string, v: string) => {
        await new Promise((r) => setTimeout(r, 1 + (n++ % 4)));
        if (kv.fail) throw new Error("disk full");
        data.set(k, v);
      },
    };
    return kv;
  }
  it("two saves at once do not lose the first one's change (they run in a row)", async () => {
    const kv = slowKV();
    const st = makeLocalStore(kv);
    const d1 = L(empty);
    const d2 = line(empty, "r9", [0, 300], [300, 300]);
    await Promise.all([st.save(m, { save: rows(d1), remove: [] }), st.save(m, { save: rows(d2), remove: [] })]);
    expect((await st.load())!.elements.map((e) => e.id).sort()).toEqual(["r1", "r2", "r9"]);
  });
  it("a failed write is sent again on the next save", async () => {
    const kv = slowKV();
    const saver = makeSaver(makeLocalStore(kv));
    kv.fail = true;
    expect(await saver.flush(m, rows(L(empty)))).toBe("failed");
    kv.fail = false;
    expect(await saver.flush(m, rows(L(empty)))).toBe("saved");
    expect(fromElements((await makeLocalStore(kv).load())!.elements)).toEqual(L(empty));
    expect(await saver.flush(m, rows(L(empty)))).toBe("nothing");
  });
});
