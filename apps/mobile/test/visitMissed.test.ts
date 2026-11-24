import { describe, expect, it, vi } from "vitest";
vi.mock("@/cloud/client", () => ({ supabase: {} }));
import { visitMissed, visitStatus } from "../src/features/visitStatus";
import type { Visit } from "../src/data/types";

/**
 * Prototype audit 12 §2.3: «Опаздывает» hung on the 8:30 visit at 18:40, when its window 8:30–12:30 was long over. A visit nobody
 * started whose window has ended is «Пропущен» (bad), not «Опаздывает»; inside the window the late rule (lateKind) is unchanged.
 */
const members = [{ id: "m1" }];
const START = Date.parse("2026-11-20T16:30:00Z"); // 8:30 AM in Los Angeles
const visit = (patch: Partial<Visit> = {}): Visit =>
  ({ id: "v1", jobId: "j1", kind: "work", techId: "m1", assigneeIds: ["m1"], start: new Date(START).toISOString(), durationMin: 240, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0, ...patch }) as Visit;
const at = (min: number) => START + min * 60_000;

describe("unit:visitMissed — a visit whose window is over is «Пропущен», not «Опаздывает»", () => {
  it("inside the window, past the threshold: still «Опаздывает · не выехал»", () => {
    expect(visitStatus(visit(), members, at(60), 15).label).toBe("late.notLeft");
    expect(visitMissed(visit(), members, at(60))).toBe(false);
  });
  it("the window is over and nobody started: «Пропущен», the bad tone", () => {
    const s = visitStatus(visit(), members, at(10 * 60 + 10), 15);
    expect(s).toEqual({ status: "bad", label: "st.missed" });
    expect(visitMissed(visit(), members, at(240))).toBe(true);
  });
  it("started (on the way, on site, a ticked item), closed, all day or nobody on it: never «Пропущен»", () => {
    const late = at(10 * 60);
    expect(visitMissed(visit({ step: "en_route" }), members, late)).toBe(false);
    expect(visitMissed(visit({ step: "on_site" }), members, late)).toBe(false);
    expect(visitMissed(visit({ checklist: [{ id: "c", label: "x", done: true }] as Visit["checklist"] }), members, late)).toBe(false);
    expect(visitMissed(visit({ closed: true } as Partial<Visit>), members, late)).toBe(false);
    expect(visitMissed(visit({ allDay: true } as Partial<Visit>), members, late)).toBe(false);
    expect(visitStatus(visit({ techId: undefined, assigneeIds: [] }), members, late).label).toBe("st.unassigned");
  });
  it("on the way past the window stays «Опаздывает · в пути» (the tech is coming)", () => {
    expect(visitStatus(visit({ step: "en_route" }), members, at(5 * 60), 15).label).toBe("late.enRoute");
  });
});
