/**
 * #2098 (founder 18.11): «не обслуживаем» is reversible. Who may lift it (the director and the office — the server's t45),
 * what opens again, and the history keeps both the mark (with its reason) and its lifting (who).
 */
import { describe, expect, it } from "vitest";
import { canMarkNoService, canServe, clientHistory, statusChoices } from "../src/features/clients";
import { makeSeed } from "../src/data/seed";
import type { Activity, DB } from "../src/data/types";

describe("«Снова обслуживать» (#2098)", () => {
  it("С1/С2 only the director and the office lift the mark; sales and the tech cannot", () => {
    expect(canMarkNoService("director") && canMarkNoService("dispatcher")).toBe(true);
    expect(canMarkNoService("sales") || canMarkNoService("tech")).toBe(false);
    expect(statusChoices("do_not_service", "director")).toContain("active");
    expect(statusChoices("do_not_service", "sales")).toEqual([]);
  });
  it("С1 lifted: new work is allowed again", () => {
    const db = makeSeed();
    const marked: DB = { ...db, customers: db.customers.map((c) => (c.id === "c3" ? { ...c, status: "do_not_service", statusReason: "x" } : c)) };
    expect(canServe(marked, "c3")).toBe(false);
    const lifted: DB = { ...marked, customers: marked.customers.map((c) => (c.id === "c3" ? { ...c, status: "active", statusReason: undefined } : c)) };
    expect(canServe(lifted, "c3")).toBe(true);
  });
  it("С4 the history keeps the mark with its reason and the lifting with who did it (the server's trace)", () => {
    const db = makeSeed();
    const me = db.members.find((m) => m.id === db.me)!;
    const act = (id: string, at: string, meta: Record<string, string>): Activity => ({ id, subjectType: "customer", subjectId: "c3", kind: "status", meta, at, actorId: me.id });
    const d: DB = {
      ...db,
      activities: [
        ...db.activities,
        act("a1", "2026-11-10T10:00:00Z", { action: "do_not_service_set", reason: "Did not pay twice" }),
        act("a2", "2026-11-18T10:00:00Z", { action: "do_not_service_lifted" }),
        act("a3", "2026-11-18T10:05:00Z", { action: "do_not_service_set", reason: "Did not pay twice" }),
      ],
    };
    const h = clientHistory(d, "c3", "director");
    const set = h.filter((x) => x.title === "client.h.noServiceSet");
    const lifted = h.find((x) => x.title === "client.h.noServiceLifted");
    expect(set).toHaveLength(2); // «Отменить» marks again: a second line, not a rollback
    expect(set[0]!.detail).toBe("Did not pay twice");
    expect(lifted?.detail).toBe(me.name);
  });
});
