/**
 * unit:jobCancelOp — #2015 (spec 38 §12, С10): the cancel goes to the server as public.cancel_job(p_job, p_reason); a refusal of
 * the server (paid, invoice open, on site, done) is a refusal for good (no retry) and leaves one card in our own words.
 */
import { describe, expect, it, vi } from "vitest";

const calls: { name: string; args: Record<string, unknown> }[] = [];
const next = { error: null as null | { message: string; code?: string; hint?: string } };
vi.mock("@/cloud/client", () => ({
  supabase: { rpc: (name: string, args: Record<string, unknown>) => (calls.push({ name, args }), Promise.resolve({ data: { status: "cancelled" }, error: next.error, status: next.error ? 400 : 200 })) },
}));
import { applyOp } from "../src/cloud/ops";
import { classify } from "../src/data/outboxRetry";
import { rejectedOf, rejectReasonKey, rejectReasonOf } from "../src/data/outboxRejected";
import type { OwnedItem } from "../src/data/outboxOwner";

const who = { userId: "u1", companyId: "c1" };
const item = { id: "o1", tries: 0, op: { k: "job.cancel", jobId: "j1", reason: "Changed mind" }, owner: who } as unknown as OwnedItem;

describe("unit:jobCancelOp — #2015", () => {
  it("С10. the op calls cancel_job with the job and the reason", async () => {
    calls.length = 0;
    next.error = null;
    await applyOp(item.op, "c1", "u1");
    expect(calls).toEqual([{ name: "cancel_job", args: { p_job: "j1", p_reason: "Changed mind" } }]);
  });
  for (const [hint, key] of [["job_paid", "job.cancel.rej.paid"], ["job_invoice_open", "job.cancel.rej.invoiceOpen"], ["job_visit_on_site", "job.cancel.rej.onSite"], ["job_done", "job.cancel.rej.done"]] as const) {
    it(`С10. the refusal «${hint}» (23514) is for good and the card says why`, () => {
      const err = { code: "23514", message: "job:x", hint, status: 400 };
      expect(classify(err)).toBe("refusal");
      const card = rejectedOf(item, "job:x", Date.parse("2026-11-17T20:00:00Z"), who, hint)!;
      expect(card).toMatchObject({ kind: "job.cancel", what: "job", href: "/job/j1", labelKey: "job.cancel.rej.title", reason: hint });
      expect(rejectReasonKey(rejectReasonOf(hint)!)).toBe(key);
    });
  }
});
