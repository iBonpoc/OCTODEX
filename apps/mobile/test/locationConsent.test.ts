/**
 * Wave 7б-2, review #217: the consent changes only itself. «Отменить» or a refusal of the server never takes back a
 * step made in the same moment («Я в пути»); the withdrawal goes through the queue, after ON has finished.
 */
import { describe, expect, it } from "vitest";
import type { Op } from "../src/cloud/ops";
import type { DB, Visit } from "../src/data/types";
import { changeConsent, type ConsentDeps } from "../src/features/locationConsent";

function world(opts: { cloud?: boolean; serverRefuses?: boolean } = {}) {
  let db = {
    me: "me",
    location: { allowed: true, on: false },
    visits: [{ id: "v1", step: "scheduled" } as unknown as Visit],
    visitPoints: [{ visitId: "v1", userId: "me", lat: 1, lng: 2, at: "2026-11-06T12:00:00Z" }],
  } as unknown as DB;
  const queue: Op[] = [];
  const sent: boolean[] = [];
  let resolveOn: (() => void) | null = null;
  const deps: ConsentDeps = {
    get: () => db,
    set: (d) => (db = d),
    cloud: opts.cloud ?? true,
    sendNow: (on) =>
      new Promise<void>((ok, fail) => {
        sent.push(on);
        if (opts.serverRefuses) return fail(new Error("location sharing is off for this company"));
        resolveOn = ok;
      }),
    enqueue: (op) => {
      queue.push(op);
      return () => {
        const i = queue.indexOf(op);
        if (i < 0) return false;
        queue.splice(i, 1);
        return true;
      };
    },
  };
  const stepEnRoute = () => (db = { ...db, visits: db.visits.map((v) => ({ ...v, step: "en_route" as const })) });
  return { deps, db: () => db, queue, sent, stepEnRoute, finishOn: () => resolveOn?.() };
}

describe("the location consent changes only itself (review #217)", () => {
  it("the server refuses ON: the consent goes back off, the step taken meanwhile stays «on the way»", async () => {
    const w = world({ serverRefuses: true });
    const change = changeConsent(w.deps, true);
    w.stepEnRoute();
    expect(await change.done).toBe(false);
    expect(w.db().location?.on).toBe(false);
    expect(w.db().visits[0].step).toBe("en_route");
  });
  it("«Отменить» after ON: the step stays; OFF is queued only after ON has finished (order on → off)", async () => {
    const w = world();
    const change = changeConsent(w.deps, true, "2026-11-06T12:00:00Z");
    expect(w.db().location).toMatchObject({ on: true, ackAt: "2026-11-06T12:00:00Z" });
    w.stepEnRoute();
    change.undo();
    expect(w.db().location?.on).toBe(false);
    expect(w.db().visits[0].step).toBe("en_route");
    expect(w.queue).toEqual([]); // ON has not answered yet: OFF does not overtake it
    w.finishOn();
    await change.done;
    await Promise.resolve();
    expect(w.queue).toEqual([{ k: "me.location", on: false }]);
    expect(w.sent).toEqual([true]);
  });
  it("OFF (a withdrawal) goes through the queue, not straight to the server; my points go from the phone", () => {
    const w = world();
    w.deps.set({ ...w.db(), location: { allowed: true, on: true, ackAt: "2026-11-06T10:00:00Z" } });
    changeConsent(w.deps, false);
    expect(w.queue).toEqual([{ k: "me.location", on: false }]);
    expect(w.sent).toEqual([]);
    expect(w.db().location?.on).toBe(false);
    expect(w.db().visitPoints).toEqual([]);
  });
  it("«Отменить» after OFF while it still waits: taken out of the queue, the consent stays on with its notice time", () => {
    const w = world();
    w.deps.set({ ...w.db(), location: { allowed: true, on: true, ackAt: "2026-11-06T10:00:00Z" } });
    const change = changeConsent(w.deps, false);
    w.stepEnRoute();
    change.undo();
    expect(w.queue).toEqual([]);
    expect(w.db().location).toMatchObject({ on: true, ackAt: "2026-11-06T10:00:00Z" });
    expect(w.db().visits[0].step).toBe("en_route");
  });
  it("the demo keeps it on the phone: no server, no queue", async () => {
    const w = world({ cloud: false });
    const change = changeConsent(w.deps, true);
    expect(await change.done).toBe(true);
    change.undo();
    expect(w.sent).toEqual([]);
    expect(w.queue).toEqual([]);
    expect(w.db().location?.on).toBe(false);
  });
});
