/**
 * unit:opsApproveOnSite — the client signs on an employee's device (docs/specs/35-stripe.md §4д п.10). Before: the op sent the
 * estimate first and a tech (who may not send) was refused there — the op was dropped, the client's signature never reached the
 * server. Now: a send refused as «not allowed» (42501) is not the end; the signature goes by the estimate's id (accept_on_site),
 * no token. Other refusals of the send (changed lines) still stop it; a signature by link keeps portal_accept.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const calls: { fn: string; args: Record<string, unknown> }[] = [];
let answers: Record<string, { error: { message: string; code?: string; hint?: string } | null }> = {};
const chain = (): Record<string, unknown> => {
  const done = Promise.resolve({ data: null, error: null });
  const c: Record<string, unknown> = { then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => done.then(r, j) };
  for (const k of ["select", "update", "insert", "upsert", "eq", "neq", "is", "in", "order", "limit"]) c[k] = () => c;
  c.maybeSingle = () => done;
  c.single = () => done;
  return c;
};
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: () => chain(),
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: null, error: answers[fn]?.error ?? null, status: answers[fn]?.error ? 400 : 200 });
    },
  },
}));

import { applyOp, PermanentError, type Op } from "../src/cloud/ops";

const E = "e1420000-0000-4000-8000-000000000001";
const approve = (channel: "on_site" | "portal"): Op => ({
  k: "estimate.approve", id: E, token: "tokFromThePhone0123456789abcdef", optionId: "o-1", addonIds: [], signer: "Ann Client",
  svg: "M0 0 L1 1", channel, jobId: "11111111-1111-4111-8111-111111111111", invoiceId: "22222222-2222-4222-8222-222222222222",
});

afterEach(() => {
  calls.length = 0;
  answers = {};
});

describe("estimate.approve on site", () => {
  it("a tech (the send is refused 42501): the signature still goes — by the estimate's id, no token", async () => {
    answers = { send_estimate: { error: { message: "only the office or the director sends an estimate", code: "42501" } } };
    await applyOp(approve("on_site"), "co-1", "u-tech");
    const sign = calls.find((c) => c.fn === "accept_on_site");
    expect(sign?.args).toEqual({
      p_estimate_id: E, p_option_id: "o-1", p_addon_ids: [], p_signer: "Ann Client", p_svg: "M0 0 L1 1", p_consent: true, p_job_id: "11111111-1111-4111-8111-111111111111", p_invoice_id: "22222222-2222-4222-8222-222222222222",
    });
    expect(JSON.stringify(sign?.args)).not.toContain("tokFromThePhone");
    expect(calls.some((c) => c.fn === "portal_accept")).toBe(false);
  });
  it("the office: sends first with the phone's token (a draft gets its locked version), then the same door", async () => {
    await applyOp(approve("on_site"), "co-1", "u-office");
    expect(calls.map((c) => c.fn)).toEqual(["send_estimate", "accept_on_site"]);
    expect(calls[0].args).toEqual({ p_estimate_id: E, p_token: "tokFromThePhone0123456789abcdef" });
  });
  it("a server without the new door yet (PGRST202): the old way by the token — nothing hangs", async () => {
    answers = { accept_on_site: { error: { message: "Could not find the function public.accept_on_site", code: "PGRST202" } } };
    await applyOp(approve("on_site"), "co-1", "u-office");
    expect(calls.map((c) => c.fn)).toEqual(["send_estimate", "accept_on_site", "send_estimate", "portal_accept"]);
    expect(calls[3].args.p_channel).toBe("on_site");
  });
  it("lines that changed (the send's own refusal) still stop it: no signature on a version the client did not see", async () => {
    answers = { send_estimate: { error: { message: "lines", code: "22023", hint: "estimate_lines_mismatch" } } };
    await expect(applyOp(approve("on_site"), "co-1", "u-office")).rejects.toBeInstanceOf(PermanentError);
    expect(calls.some((c) => c.fn === "accept_on_site")).toBe(false);
  });
  it("the server refuses the signature itself (no right to sign): the op fails, nothing silent", async () => {
    answers = { accept_on_site: { error: { message: "on-site signature requires an employee who may sign contracts", code: "42501" } } };
    await expect(applyOp(approve("on_site"), "co-1", "u-office")).rejects.toBeInstanceOf(PermanentError);
  });
  it("by link (the client's page in the app): the old way, portal_accept with the token", async () => {
    await applyOp(approve("portal"), "co-1", "u-office");
    expect(calls.map((c) => c.fn)).toEqual(["send_estimate", "portal_accept"]);
    expect(calls[1].args.p_token).toBe("tokFromThePhone0123456789abcdef");
  });
});

import { canSeeClientLink, canSignDraftOnSite } from "../src/features/estimateSign";
import { tFor } from "../src/i18n/translate";
import { rejectedOf } from "../src/data/outboxRejected";

describe("the client's page and a lost signature", () => {
  it("«Open as client» — the office side only, never a tech", () => {
    expect((["director", "sales", "dispatcher", "tech"] as const).map((r) => canSeeClientLink(r))).toEqual([true, true, true, false]);
  });
  it("a draft is signed on site only by the office side (a tech may not send it — the server would refuse)", () => {
    expect((["director", "sales", "dispatcher", "tech"] as const).map((r) => canSignDraftOnSite(r, "draft"))).toEqual([true, true, true, false]);
    expect(canSignDraftOnSite("tech", "sent")).toBe(true);
    expect(tFor("ru")("est.signOnSite.afterSend")).toMatch(/после того, как офис отправит смету/);
  });
  it("a refused on-site signature says it is the client's signature, not «a deposit»", () => {
    const r = rejectedOf({ id: "x", op: approve("on_site") } as never, "refused", Date.parse("2026-11-08T12:00:00Z"), null);
    expect(r?.labelKey).toBe("est.rej.signatureLost");
    expect(r?.href).toBe(`/estimate/${E}`);
    expect(tFor("ru")(r!.labelKey as never)).toBe("Подпись клиента не записана на сервере");
  });
});
