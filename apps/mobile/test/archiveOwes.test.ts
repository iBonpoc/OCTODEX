/**
 * #3044 (spec 04 §4 «active → archived — нельзя при открытом балансе»; map-keeper 27.11): a client who owes is never made inactive.
 * One rule (canArchive), asked by the store's setCustomerStatus — so neither the header nor the list's swipe goes around it;
 * back from inactive and «не обслуживаем» lifted are manual moves now (map §5:222 «active — вручную»).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { archiveOwes, canArchive } from "../src/features/clients";
import { MOVES, SYSTEM_ONLY } from "../src/features/statusMoves";

const inv = (id: string, customerId: string, totalCents: number, paidCents: number) => ({ id, customerId, totalCents, paidCents }) as never;

describe("a client who owes is not made inactive (#3044)", () => {
  const db = { invoices: [inv("a", "c1", 184000, 0), inv("b", "c2", 24000, 24000)], payments: [] } as never;
  it("owes → no; paid up or no invoices → yes", () => {
    expect(archiveOwes(db, "c1")).toBe(184000);
    expect(canArchive(db, "c1")).toBe(false);
    expect(canArchive(db, "c2")).toBe(true);
    expect(canArchive(db, "c9")).toBe(true);
  });
  it("the store asks it for every manual move to «archived» (header, list) — nothing is queued", () => {
    const src = readFileSync(new URL("../src/data/store.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/setCustomerStatus: \(id, status, reason\) =>\s*status === "archived" && !canArchive\(dbRef\.current, id\)\s*\? NO_UNDO/);
  });
  it("the list's swipe «в архив» is offered only when the rule lets it", () => {
    const src = readFileSync(new URL("../src/app/(tabs)/clients.tsx", import.meta.url), "utf8");
    expect(src).toContain('toArchive && canArchive(db, c.id) ? [{ key: "archive"');
  });
  it("back from inactive and «не обслуживаем» lifted — manual moves; only «prospect» is the app's alone", () => {
    expect(MOVES.customer.archived?.map((m) => m.to)).toEqual(["active", "do_not_service"]);
    expect(MOVES.customer.do_not_service?.map((m) => m.to)).toEqual(["active", "archived"]);
    expect(SYSTEM_ONLY.customer).toEqual(["prospect"]);
  });
});
