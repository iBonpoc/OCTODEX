/**
 * Wave 7б-2 (docs/specs/03 §12): what loadCompanyDB reads about location. The company flag comes from
 * company_location_sharing, the consent from memberships, the points from user_locations (newest first: the phone keeps
 * the last one per person and visit). On a base without the migration everything about location stays off and the
 * rest of the company still loads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rows: Record<string, Record<string, unknown>[]> = {};
const missing = new Set<string>();
let flag: boolean | "no-function" = true;
function builder(table: string) {
  const b: Record<string, unknown> = {};
  let cols = "";
  b.select = (c?: string) => ((cols = c ?? "*"), b);
  for (const m of ["eq", "is", "order", "limit", "in", "not", "range", "gte"]) b[m] = () => b;
  b.then = (ok: (r: { data: unknown; error: { message: string } | null }) => unknown) => {
    const gone = cols.split(",").map((x) => x.trim()).find((c) => missing.has(`${table}.${c}`) || missing.has(`${table}.*`));
    return Promise.resolve(gone ? { data: null, error: { message: `column ${table}.${gone} does not exist` } } : { data: rows[table] ?? [], error: null }).then(ok);
  };
  return b;
}
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (t: string) => builder(t),
    rpc: (name: string) =>
      Promise.resolve(name === "company_location_sharing" && flag !== "no-function" ? { data: flag, error: null } : { data: null, error: { message: "no such function" } }),
  },
}));
import { loadCompanyDB } from "../src/cloud/repo";

const ME = "u-me";
beforeEach(() => {
  missing.clear();
  flag = true;
  for (const k of Object.keys(rows)) delete rows[k];
  rows.memberships = [
    { user_id: ME, role: "tech", status: "active", share_location: true, location_notice_ack_at: "2026-11-06T10:00:00Z", users: { full_name: "Mike Tech" } },
    { user_id: "u-2", role: "tech", status: "active", share_location: false, users: { full_name: "Luis Tech" } },
  ];
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  rows.user_locations = [
    { id: "3", visit_id: "v1", user_id: ME, lat: 34.2, lng: -118.2, accuracy_m: 12, recorded_at: ago(2) },
    { id: "2", visit_id: "v1", user_id: ME, lat: 34.1, lng: -118.1, accuracy_m: null, recorded_at: ago(7) },
    { id: "1", visit_id: "v1", user_id: "u-3", lat: 34.0, lng: -118.0, accuracy_m: 30, recorded_at: ago(9) },
  ];
});

describe("loadCompanyDB — location (7б-2)", () => {
  it("the flag, my consent with the notice time, who shares", async () => {
    const db = await loadCompanyDB("co-1", ME);
    expect(db.location).toEqual({ allowed: true, on: true, ackAt: "2026-11-06T10:00:00Z" });
    expect(db.members.find((m) => m.id === "u-2")?.sharesLocation).toBe(false);
    expect(db.members.find((m) => m.id === ME)?.sharesLocation).toBe(true);
  });
  it("the last point per person and visit (rows come newest first)", async () => {
    const db = await loadCompanyDB("co-1", ME);
    expect(db.visitPoints).toHaveLength(2);
    expect(db.visitPoints?.find((p) => p.userId === ME)).toMatchObject({ lat: 34.2, accuracyM: 12 });
  });
  it("the company flag off: my old consent does not count", async () => {
    flag = false;
    const db = await loadCompanyDB("co-1", ME);
    expect(db.location).toMatchObject({ allowed: false, on: false });
  });
  it("a base without the migration: location off, the team still loads", async () => {
    flag = "no-function";
    missing.add("memberships.share_location");
    missing.add("user_locations.*");
    const db = await loadCompanyDB("co-1", ME);
    expect(db.location).toEqual({ allowed: false, on: false });
    expect(db.visitPoints).toEqual([]);
    expect(db.members.map((m) => m.name).sort()).toEqual(["Luis Tech", "Mike Tech"]);
  });
});
