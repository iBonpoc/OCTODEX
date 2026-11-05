import { describe, expect, it } from "vitest";
import { buildAttention } from "../src/features/attention";
import { makeSeed } from "../src/data/seed";
import type { DB, Role, Visit } from "../src/data/types";

describe("needs-attention queue", () => {
  const items = buildAttention(makeSeed());
  it("puts unanswered leads first", () => {
    expect(items[0]!.kind).toBe("lead");
  });
  it("includes overdue invoice, unassigned visit and stale estimates (late: below, with its own clock)", () => {
    const kinds = new Set(items.map((i) => i.kind));
    for (const k of ["overdue", "unassigned", "estimate"]) expect(kinds.has(k as never)).toBe(true);
  });
  it("estimate 2–4 days = warn, 5+ days = bad (HANDOFF timing rule)", () => {
    const est = items.filter((i) => i.kind === "estimate");
    for (const e of est) expect(e.status).toBe(Number(e.params.d) >= 5 ? "bad" : "warn");
  });
  it("lead waiting ≥ 15 min is critical", () => {
    const l = items.find((i) => i.kind === "lead" && Number(i.params.m) >= 15);
    expect(l?.status).toBe("bad");
  });
  it("paid and future invoices are not flagged", () => {
    expect(items.some((i) => i.refId === "i3" || i.refId === "i2")).toBe(false);
  });
});

/** П3c (docs/specs/03): visits in «Требует внимания» — one rule, today and tomorrow, only for the people who plan */
describe("needs attention: visits (П3c)", () => {
  // local noon, so «today» and «tomorrow» do not depend on the time zone of the machine
  const noon = new Date(); noon.setHours(12, 0, 0, 0);
  const NOW = noon.getTime();
  const min = (m: number) => new Date(NOW + m * 60_000).toISOString();
  const day = (d: number) => new Date(NOW + d * 86_400_000).toISOString();
  const base = makeSeed();
  const pid = base.properties[0]!.id;
  const V = (id: string, p: Partial<Visit>): Visit => ({ id, propertyId: pid, techId: "m-ivan", assigneeIds: ["m-ivan"], start: min(60), durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0, ...p });
  const run = (visits: Visit[], role: Role = "director") => buildAttention({ ...base, visits } as DB, role, NOW).filter((i) => i.kind === "unassigned" || i.kind === "late");

  it("«Не назначено» today and tomorrow, not the day after; by everyone on it, not only techId", () => {
    const got = run([
      V("t", { techId: null, assigneeIds: [] }),
      V("tm", { techId: null, assigneeIds: [], start: day(1) }),
      V("af", { techId: null, assigneeIds: [], start: day(2) }),
      V("second", { techId: null, assigneeIds: ["m-sub"] }),
      V("done", { techId: null, assigneeIds: [], step: "done", kind: "inspection" }),
    ]);
    expect(got.map((i) => i.refId).sort()).toEqual(["t", "tm"]);
    const tm = got.find((i) => i.refId === "tm")!;
    expect(tm.label).toBe("late.unassignedTomorrow");
    expect(tm.chip).toBe("late.unassignedTomorrowChip");
    expect(got.find((i) => i.refId === "t")!.score).toBeGreaterThan(tm.score);
  });
  it("«Опаздывает» by the rule: not left / on the way; gone on site; no flag", () => {
    const got = run([
      V("notLeft", { start: min(-16) }),
      V("onWay", { start: min(-40), step: "en_route", enRouteAt: min(-30) }),
      V("early", { start: min(-14) }),
      V("onSite", { start: min(-40), step: "on_site" }),
      V("ticked", { start: min(-40), checklist: [{ id: "c", label: "x", done: true }] }),
    ]);
    expect(got.map((i) => [i.refId, i.chip])).toEqual([["notLeft", "late.notLeft"], ["onWay", "late.enRoute"]]);
    for (const i of got) expect(i.status).toBe("warn");
  });
  it("a tech and sales see no visit items (bug: they saw the office's «Не назначено» and «Опаздывает»)", () => {
    const visits = [V("t", { techId: null, assigneeIds: [] }), V("notLeft", { start: min(-16) })];
    expect(run(visits, "director")).toHaveLength(2);
    expect(run(visits, "dispatcher")).toHaveLength(2);
    expect(run(visits, "tech")).toEqual([]);
    expect(run(visits, "sales")).toEqual([]);
  });
});
