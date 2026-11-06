/** Wave П-1 (13 §5): the new fields go to the server through the offline queue (cloud/ops.ts). */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { table: string; how: "update" | "upsert"; row: Record<string, unknown>; id?: unknown }[] = [];
const rpcs: { fn: string; args: unknown }[] = [];
vi.mock("../src/cloud/client", () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      rpcs.push({ fn, args });
      return { then: (ok: (r: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok) };
    },
    from: (table: string) => {
      const done = (r: { table: string; how: "update" | "upsert"; row: Record<string, unknown> }) => {
        const entry: (typeof calls)[number] = { ...r };
        calls.push(entry);
        const q = {
          eq: (_c: string, v: unknown) => ((entry.id = v), q),
          then: (ok: (r: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok),
        };
        return q;
      };
      return {
        update: (row: Record<string, unknown>) => done({ table, how: "update", row }),
        upsert: (row: Record<string, unknown>) => done({ table, how: "upsert", row }),
      };
    },
  },
}));
import { applyOp } from "../src/cloud/ops";

beforeEach(() => {
  calls.splice(0);
  rpcs.splice(0);
});

describe("ops: customer.update (name parts, address for invoices)", () => {
  it("writes first / last / company name and the billing address", async () => {
    await applyOp({ k: "customer.update", id: "c1", firstName: " Mary ", lastName: "Lee", companyName: "", billing: { line1: "PO Box 12", city: "Pasadena", state: "CA", zip: "91101" } }, "co", "u");
    expect(calls).toEqual([
      {
        table: "customers", how: "update", id: "c1",
        row: {
          first_name: "Mary", last_name: "Lee", company_name: null,
          billing_address_line1: "PO Box 12", billing_address_line2: null, billing_address_unit: null, billing_address_city: "Pasadena", billing_address_state: "CA", billing_address_zip: "91101",
        },
      },
    ]);
  });
  it("billing null clears the address (= the property address)", async () => {
    await applyOp({ k: "customer.update", id: "c1", billing: null }, "co", "u");
    expect(calls[0]!.row).toEqual({
      billing_address_line1: null, billing_address_line2: null, billing_address_unit: null, billing_address_city: null, billing_address_state: null, billing_address_zip: null,
    });
  });
  it("wave 4: the source of the client goes to lead_source_id (cloud uuid only)", async () => {
    await applyOp({ k: "customer.update", id: "c1", sourceId: "7d3f1c2a-1b2c-4d5e-8f90-123456789abc" }, "co", "u");
    expect(calls).toEqual([{ table: "customers", how: "update", id: "c1", row: { lead_source_id: "7d3f1c2a-1b2c-4d5e-8f90-123456789abc" } }]);
    calls.splice(0);
    await applyOp({ k: "customer.update", id: "c1", sourceId: "src-referral" }, "co", "u");
    expect(calls).toEqual([]);
  });
  it("an op queued by an older build (name only) writes only the name", async () => {
    await applyOp({ k: "customer.update", id: "c1", name: "Mary Lee" }, "co", "u");
    expect(calls).toEqual([{ table: "customers", how: "update", id: "c1", row: { display_name: "Mary Lee" } }]);
  });
});

describe("ops: job.update and jobType.save", () => {
  it("description and type of a job; an empty description is cleared", async () => {
    await applyOp({ k: "job.update", id: "j1", description: "  ", jobTypeId: "t2" }, "co", "u");
    expect(calls).toEqual([{ table: "jobs", how: "update", id: "j1", row: { description: null, job_type_id: "t2" } }]);
  });
  it("nothing to change — nothing is sent", async () => {
    await applyOp({ k: "job.update", id: "j1" }, "co", "u");
    expect(calls).toEqual([]);
  });
  it("a new job type is inserted with its company; a known one changes only name, position, archive", async () => {
    await applyOp({ k: "jobType.save", isNew: true, jobType: { id: "t9", name: "Gutter guards", position: 5 } }, "co", "u");
    await applyOp({ k: "jobType.save", isNew: false, jobType: { id: "t2", seedKey: "repair", position: 1, archivedAt: "2026-11-06T00:00:00Z" } }, "co", "u");
    expect(calls).toEqual([
      { table: "job_types", how: "upsert", row: { id: "t9", company_id: "co", seed_key: null, name: "Gutter guards", position: 5, archived_at: null } },
      { table: "job_types", how: "update", id: "t2", row: { name: null, position: 1, archived_at: "2026-11-06T00:00:00Z" } },
    ]);
  });
});

describe("ops: wave П-2a money fields", () => {
  it("customer without tax and its note", async () => {
    await applyOp({ k: "customer.update", id: "c1", taxExempt: true, taxExemptNote: " Cert 12-345 " }, "co", "u");
    expect(calls).toEqual([{ table: "customers", how: "update", id: "c1", row: { tax_exempt: true, tax_exempt_note: "Cert 12-345" } }]);
  });
  it("job tax goes with the other job fields", async () => {
    await applyOp({ k: "job.update", id: "j1", taxEnabled: true, taxRateBps: 1025 }, "co", "u");
    expect(calls).toEqual([{ table: "jobs", how: "update", id: "j1", row: { tax_enabled: true, tax_rate_bps: 1025 } }]);
  });
  it("job tags in one call to the server", async () => {
    await applyOp({ k: "job.tags", id: "j1", tagIds: ["a", "b"] }, "co", "u");
    expect(rpcs).toEqual([{ fn: "set_job_tags", args: { p_job_id: "j1", p_tag_ids: ["a", "b"] } }]);
  });
  it("a new line names its job; an edit never moves it; the total is the server's", async () => {
    const line = { id: "li1", jobId: "j1", position: 0, name: " Gutter ", quantity: "2.5", unitPriceCents: 1999, taxable: true };
    await applyOp({ k: "jobLine.save", isNew: true, line }, "co", "u");
    await applyOp({ k: "jobLine.save", isNew: false, line: { ...line, unitPriceCents: 2100 } }, "co", "u");
    expect(calls[0]).toEqual({
      table: "job_line_items", how: "upsert",
      row: { id: "li1", company_id: "co", job_id: "j1", position: 0, name: "Gutter", description: null, catalog_item_id: null, quantity: "2.5", unit_price_cents: 1999, taxable: true },
    });
    expect(calls[1]).toEqual({
      table: "job_line_items", how: "update", id: "li1",
      row: { position: 0, name: "Gutter", description: null, catalog_item_id: null, quantity: "2.5", unit_price_cents: 2100, taxable: true },
    });
    expect(JSON.stringify(calls)).not.toContain("line_total");
  });
  it("a line removed by mistake comes back (Undo)", async () => {
    await applyOp({ k: "jobLine.restore", id: "li1" }, "co", "u");
    expect(calls).toEqual([{ table: "job_line_items", how: "update", id: "li1", row: { deleted_at: null } }]);
  });
  it("the quantity goes as the database keeps it (4 places), so the engine and the server count the same", async () => {
    await applyOp({ k: "jobLine.save", isNew: false, line: { id: "li1", jobId: "j1", position: 0, name: "x", quantity: "1.00004", unitPriceCents: 12500, taxable: false } }, "co", "u");
    expect(calls[0]!.row.quantity).toBe("1");
  });
  it("a removed line is marked, not deleted", async () => {
    await applyOp({ k: "jobLine.remove", id: "li1" }, "co", "u");
    expect(calls[0]).toMatchObject({ table: "job_line_items", how: "update", id: "li1" });
    expect(Object.keys(calls[0]!.row)).toEqual(["deleted_at"]);
  });
});
