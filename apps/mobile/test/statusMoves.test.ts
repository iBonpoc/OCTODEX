/** Status changes from a list card: only existing store functions, only allowed moves; app-set statuses never by hand (spec 06, map §4–§5). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MOVES, STATUSES, SYSTEM_ONLY, canChangeStatus, pickerOptions, type MoveEntity } from "@/features/statusMoves";

const store = readFileSync(join(__dirname, "../src/data/store.tsx"), "utf8");
const entities = Object.keys(MOVES) as MoveEntity[];

describe("manual status moves", () => {
  it("every move calls a function the store already has", () => {
    for (const e of entities)
      for (const moves of Object.values(MOVES[e]))
        for (const m of moves) expect(store, `${e} → ${m.to} via ${m.via}`).toMatch(new RegExp(`\\n\\s+${m.via}: \\(`));
  });
  it("from and to are real statuses of the entity", () => {
    for (const e of entities)
      for (const [from, moves] of Object.entries(MOVES[e])) {
        expect(STATUSES[e], `${e} from ${from}`).toContain(from);
        for (const m of moves) expect(STATUSES[e], `${e} → ${m.to}`).toContain(m.to);
      }
  });
  it("statuses only the app sets are never a manual target", () => {
    for (const e of entities)
      for (const moves of Object.values(MOVES[e])) for (const m of moves) expect(SYSTEM_ONLY[e], `${e} → ${m.to}`).not.toContain(m.to);
  });
  it("in the picker app-set statuses are locked", () => {
    for (const e of entities)
      for (const from of STATUSES[e])
        for (const o of pickerOptions(e, from)) if (SYSTEM_ONLY[e].includes(o.status)) expect(o.enabled, `${e} ${from} → ${o.status}`).toBe(false);
  });
  it("estimate, job and visit are read only on a card (no store mutation for a hand move)", () => {
    for (const e of ["estimate", "job", "visit"] as const) for (const s of STATUSES[e]) expect(canChangeStatus(e, s)).toBe(false);
  });
  it("closing a lead or making it a client needs a reason → opens the existing form", () => {
    const o = pickerOptions("lead", "replied");
    expect(o.find((x) => x.status === "lost")).toMatchObject({ enabled: true, how: "form", via: "closeLead" });
    expect(o.find((x) => x.status === "won")).toMatchObject({ enabled: true, how: "form", via: "convertLead" });
    expect(o.find((x) => x.status === "estimate_sent")!.enabled).toBe(false);
  });
  it("a lost lead is reopened in one tap", () => {
    expect(pickerOptions("lead", "lost").find((x) => x.status === "replied")).toMatchObject({ enabled: true, how: "direct", via: "reopenLead" });
  });
  it("a client goes to the archive in one tap; «do not service» needs a reason", () => {
    const o = pickerOptions("customer", "active");
    expect(o.find((x) => x.status === "archived")).toMatchObject({ enabled: true, how: "direct" });
    expect(o.find((x) => x.status === "do_not_service")).toMatchObject({ enabled: true, how: "form" });
    expect(o.find((x) => x.status === "prospect")!.enabled).toBe(false);
  });
  it("the current status is marked and not selectable", () => {
    const o = pickerOptions("task", "open");
    expect(o.find((x) => x.status === "open")).toMatchObject({ current: true, enabled: false });
    expect(o.find((x) => x.status === "done")).toMatchObject({ enabled: true, how: "direct", via: "saveTask" });
  });
});
