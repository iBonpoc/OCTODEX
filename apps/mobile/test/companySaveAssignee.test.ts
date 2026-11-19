/** Р-7: company.save sends the default lead assignee by its own request, after the rest — a refusal (the chosen one has
 *  left the team, 42501) drops only the assignee, not the name, hours and brand (review of #2236). */
import { beforeEach, describe, expect, it, vi } from "vitest";

const updates: Record<string, unknown>[] = [];
let stored: Record<string, unknown> = {};
let refuseAssignee = false;
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: () => ({
      select: () => {
        const q = { eq: () => q, maybeSingle: () => Promise.resolve({ data: stored, error: null }) };
        return q;
      },
      update: (row: Record<string, unknown>) => {
        updates.push(row);
        const error = refuseAssignee && "lead_default_assignee_id" in row ? { message: "the default lead assignee must be an active member of the company", code: "42501" } : null;
        const q = { eq: () => q, then: (ok: (r: { error: unknown; status: number }) => unknown) => Promise.resolve({ error, status: error ? 403 : 200 }).then(ok) };
        return q;
      },
    }),
  },
}));
import { applyOp, PermanentError } from "../src/cloud/ops";
import { companyFromDb } from "../src/cloud/companyMap";
import { isAccessDenied, LEAD_ASSIGNEE_GONE } from "../src/data/outboxRetry";

const company = (assignee: string | null) => ({ ...companyFromDb({ id: "c", name: "New Name", lead_default_assignee_id: assignee }, undefined, [], []) });

describe("company.save and the default lead assignee (Р-7)", () => {
  beforeEach(() => { updates.splice(0); stored = { lead_default_assignee_id: "u-gone" }; refuseAssignee = false; });

  it("a save that did not choose the assignee does not send it — a stored one who has left blocks nothing", async () => {
    refuseAssignee = true;
    await applyOp({ k: "company.save", company: company("u-gone"), einChanged: false, assigneeChanged: false }, "c", "u");
    expect(updates).toHaveLength(1);
    expect(updates[0].name).toBe("New Name");
    expect("lead_default_assignee_id" in updates[0]).toBe(false);
  });

  it("an older op (no flag) with a cached assignee other than the stored one: the settings first, the refusal drops only the assignee", async () => {
    refuseAssignee = true;
    const err = await applyOp({ k: "company.save", company: company("u-old"), einChanged: false }, "c", "u").catch((e: unknown) => e);
    expect(updates[0].name).toBe("New Name");
    expect("lead_default_assignee_id" in updates[0]).toBe(false);
    expect(updates[1]).toEqual({ lead_default_assignee_id: "u-old" });
    expect(err).toBeInstanceOf(PermanentError);
    expect((err as PermanentError).hint).toBe(LEAD_ASSIGNEE_GONE);
    expect(isAccessDenied(err)).toBe(false);
  });

  it("chosen in this save: sent by its own request (null = the owner)", async () => {
    await applyOp({ k: "company.save", company: company(null), einChanged: false, assigneeChanged: true }, "c", "u");
    expect(updates).toEqual([expect.objectContaining({ name: "New Name" }), { lead_default_assignee_id: null }]);
  });
});
