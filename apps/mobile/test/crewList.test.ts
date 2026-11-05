/** «Бригады сейчас» (spec 06, PR10a): the visit a tech is on now and the next one. */
import { describe, expect, it } from "vitest";
import { crewNow } from "@/features/crewList";
import type { Visit } from "@/data/types";

const v = (id: string, start: string, step: Visit["step"], extra: Partial<Visit> = {}) => ({ id, start, step, ...extra }) as Visit;

describe("crewNow", () => {
  it("working now + the next scheduled one after it", () => {
    const r = crewNow([v("a", "2026-11-05T08:00", "paid"), v("b", "2026-11-05T10:00", "working"), v("c", "2026-11-05T14:00", "scheduled")]);
    expect([r.current?.id, r.next?.id]).toEqual(["b", "c"]);
  });
  it("nothing started yet → no current, next = the first scheduled", () => {
    const r = crewNow([v("a", "2026-11-05T09:00", "scheduled"), v("b", "2026-11-05T13:00", "scheduled")]);
    expect([r.current, r.next?.id]).toEqual([undefined, "a"]);
  });
  it("all done → free (no current, no next)", () => {
    expect(crewNow([v("a", "2026-11-05T09:00", "paid"), v("b", "2026-11-05T11:00", "done")])).toEqual({ current: undefined, next: undefined });
  });
  it("a closed visit is not «now»", () => {
    const r = crewNow([v("a", "2026-11-05T09:00", "on_site", { closed: true } as Partial<Visit>), v("b", "2026-11-05T12:00", "scheduled")]);
    expect([r.current, r.next?.id]).toEqual([undefined, "b"]);
  });
});
