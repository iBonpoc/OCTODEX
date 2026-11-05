/** П3c (docs/specs/03, решение 3): the «left at» time goes with the step from the phone and to the server as is. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { table: string; row: Record<string, unknown> }[] = [];
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (table: string) => ({
      update: (row: Record<string, unknown>) => {
        calls.push({ table, row });
        const q = { eq: () => q, then: (ok: (r: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok) };
        return q;
      },
    }),
  },
}));
import { applyOp } from "../src/cloud/ops";
import { stepChange } from "../src/features/schedule";
import type { Visit } from "../src/data/types";

const V = (p: Partial<Visit>): Visit => ({ id: "v", techId: "m1", start: "2026-11-05T18:00:00.000Z", durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0, ...p });
const T = "2026-11-05T18:20:00.000Z";

describe("store: the step carries the phone time", () => {
  it("«on the way» takes the time of the tap; a repeat keeps the first one", () => {
    expect(stepChange(V({}), T)).toEqual({ step: "en_route", at: T });
    expect(stepChange(V({ step: "scheduled", enRouteAt: "2026-11-05T18:05:00.000Z" }), T)).toEqual({ step: "en_route", at: "2026-11-05T18:05:00.000Z" });
  });
  it("other steps carry no time", () => {
    expect(stepChange(V({ step: "en_route", enRouteAt: T }), T)).toEqual({ step: "on_site" });
  });
});

describe("ops: visit.step to the server", () => {
  beforeEach(() => void calls.splice(0));
  it("«on the way» sends the phone time as en_route_at", async () => {
    await applyOp({ k: "visit.step", visitId: "v", to: "en_route", at: T }, "c", "u");
    expect(calls).toEqual([{ table: "visits", row: { status: "en_route", en_route_at: T } }]);
  });
  it("an op queued by an older build (no time) sends the status only — the server notes now()", async () => {
    await applyOp({ k: "visit.step", visitId: "v", to: "en_route" }, "c", "u");
    expect(calls).toEqual([{ table: "visits", row: { status: "en_route" } }]);
  });
  it("«on site» does not touch the time", async () => {
    await applyOp({ k: "visit.step", visitId: "v", to: "on_site" }, "c", "u");
    expect(calls).toEqual([{ table: "visits", row: { status: "on_site" } }]);
  });
});
