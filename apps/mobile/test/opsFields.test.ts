/** Wave П-1 (13 §5): the new fields go to the server through the offline queue (cloud/ops.ts). */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { table: string; how: "update" | "upsert"; row: Record<string, unknown>; id?: unknown }[] = [];
vi.mock("../src/cloud/client", () => ({
  supabase: {
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

beforeEach(() => void calls.splice(0));

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
