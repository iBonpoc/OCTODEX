/**
 * unit:repoLinks — the client link of an estimate on the phone (docs/specs/35-stripe.md §4е, step 2): it comes from
 * public.estimate_links (the office side gets it, a tech gets none), not from the estimate row, which the server keeps
 * empty. A server before the migration (no such function, PGRST202): the row's public_token, as before. Any other
 * failure of the read fails the load (a list without links would make the office's next send add a needless one).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rows: Record<string, Record<string, unknown>[]> = {};
let links: { data: unknown; error: { message: string; code?: string } | null } = { data: [], error: null };
function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "order", "limit", "in", "not", "range", "gte"]) b[m] = () => b;
  b.then = (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) =>
    Promise.resolve(table === "estimate_links" ? links : { data: rows[table] ?? [], error: null }).then(ok, bad);
  return b;
}
vi.mock("../src/cloud/client", () => ({
  supabase: { from: (t: string) => builder(t), rpc: (fn: string) => (fn === "estimate_links" ? builder(fn) : Promise.resolve({ data: null, error: null })) },
}));
import { loadCompanyDB } from "../src/cloud/repo";

beforeEach(() => {
  rows.memberships = [{ user_id: "u-me", role: "office", status: "active", users: { full_name: "Olga Office" } }];
  rows.customers = [{ id: "c-1", display_name: "Ann Client", status: "active" }];
  rows.properties = [{ id: "p-1", customer_id: "c-1", address_line1: "1 Elm St", address_city: "Pasadena" }];
  rows.estimates = [
    { id: "e-1", customer_id: "c-1", property_id: "p-1", title: "Gutters", status: "sent", number: "EST-1", public_token: null },
    { id: "e-2", customer_id: "c-1", property_id: "p-1", title: "Roof", status: "sent", number: "EST-2", public_token: "rowTokenOfAnOldServer0123" },
  ];
  links = { data: [], error: null };
});

describe("the client link comes from estimate_links", () => {
  it("the office side: the link of each estimate from the door, not from the row", async () => {
    links = { data: [{ estimate_id: "e-1", token: "doorTokenE1_0123456789abc" }], error: null };
    const db = await loadCompanyDB("co-1", "u-me");
    expect(db.estimates.find((e) => e.id === "e-1")?.token).toBe("doorTokenE1_0123456789abc");
    expect(db.estimates.find((e) => e.id === "e-2")?.token).toBeUndefined();   // not from the row any more
  });
  it("a tech: the door gives nothing — no link on his phone, even when an old server's row still had one", async () => {
    rows.memberships = [{ user_id: "u-me", role: "tech", status: "active", users: { full_name: "Ted Tech" } }];
    const db = await loadCompanyDB("co-1", "u-me");
    expect(db.members.find((m) => m.id === "u-me")?.roles).toContain("tech");
    expect(db.estimates.every((e) => e.token === undefined)).toBe(true);
  });
  it("a server before the migration (PGRST202): the row's link, as before", async () => {
    links = { data: null, error: { message: "Could not find the function public.estimate_links", code: "PGRST202" } };
    const db = await loadCompanyDB("co-1", "u-me");
    expect(db.estimates.find((e) => e.id === "e-2")?.token).toBe("rowTokenOfAnOldServer0123");
  });
  it("any other failure fails the load", async () => {
    links = { data: null, error: { message: "TypeError: Failed to fetch", code: "" } };
    await expect(loadCompanyDB("co-1", "u-me")).rejects.toBeTruthy();
  });
});
