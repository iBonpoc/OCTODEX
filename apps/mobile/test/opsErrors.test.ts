/**
 * What a failed send tells the outbox (review #244): the server's status and code ride on the error, and a lost
 * connection in the middle of an op is «try later» — never «not visible» (that would drop an estimate).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Answer = { data?: unknown; error: { message: string; code?: string } | null; status?: number };
/** the answer for the n-th request (in order); then «ok, nothing» */
const answers: Answer[] = [];
const asked: string[] = [];
const next = (what: string): Promise<Answer> => {
  asked.push(what);
  return Promise.resolve(answers.shift() ?? { data: null, error: null, status: 200 });
};
/** any chain of PostgREST builder calls; awaiting it asks for the next answer */
const builder = (what: string): unknown =>
  new Proxy(
    {},
    {
      get: (_t, k) => (k === "then" ? (ok: (r: Answer) => unknown, ko?: (e: unknown) => unknown) => next(what).then(ok, ko) : () => builder(what)),
    },
  );
vi.mock("../src/cloud/client", () => ({
  supabase: { from: (t: string) => builder(`from:${t}`), rpc: (fn: string) => builder(`rpc:${fn}`), auth: {} },
}));
import { applyOp, PermanentError, ServerError } from "../src/cloud/ops";
import { classify } from "../src/data/outboxRetry";

const fail = async (p: Promise<unknown>) => p.then(() => undefined, (e: unknown) => e);
const saveOp = { k: "estimate.save", id: "e1", versionId: "v1", customerId: "c1", propertyId: "p1", title: "T", doc: { options: [] } } as unknown as Parameters<typeof applyOp>[0];
beforeEach(() => {
  answers.length = 0;
  asked.length = 0;
});

describe("unit:opsErrors — the server's answer rides on the error", () => {
  it("503 / 429 / an expired sign-in: a ServerError with its status → «not now»", async () => {
    answers.push({ error: { message: "Service Unavailable", code: "" }, status: 503 });
    const e = await fail(applyOp({ k: "notice.read", ids: ["n1"] } as Parameters<typeof applyOp>[0], "co", "u"));
    expect(e).toBeInstanceOf(ServerError);
    expect((e as ServerError).status).toBe(503);
    expect(classify(e)).toBe("transient");
    answers.push({ error: { message: "JWT expired", code: "PGRST301" }, status: 401 });
    expect(classify(await fail(applyOp({ k: "notice.read", ids: ["n1"] } as Parameters<typeof applyOp>[0], "co", "u")))).toBe("transient");
  });
  it("a permission / constraint code: a PermanentError → a refusal", async () => {
    answers.push({ error: { message: "new row violates row-level security policy", code: "42501" }, status: 403 });
    const e = await fail(applyOp({ k: "notice.read", ids: ["n1"] } as Parameters<typeof applyOp>[0], "co", "u"));
    expect(e).toBeInstanceOf(PermanentError);
    expect(classify(e)).toBe("refusal");
  });
  it("no answer at all (status 0, «Failed to fetch») → network", async () => {
    answers.push({ error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 });
    expect(classify(await fail(applyOp({ k: "notice.read", ids: ["n1"] } as Parameters<typeof applyOp>[0], "co", "u")))).toBe("network");
  });
});

describe("unit:opsErrors — the connection drops in the middle of an op (review #244 №2)", () => {
  it("estimate.save: the read after the insert fails — «try later», not «the estimate is not visible»", async () => {
    answers.push({ data: null, error: null, status: 201 }); // the insert went
    answers.push({ data: null, error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 }); // the read did not
    const e = await fail(applyOp(saveOp, "co", "u"));
    expect(asked.slice(0, 2)).toEqual(["from:estimates", "from:estimates"]);
    expect(e).not.toBeInstanceOf(PermanentError);
    expect(classify(e)).toBe("network");
  });
  it("estimate.save: the estimate really is not there — still a refusal", async () => {
    answers.push({ data: null, error: null, status: 201 });
    answers.push({ data: null, error: null, status: 200 });
    const e = await fail(applyOp(saveOp, "co", "u"));
    expect(e).toBeInstanceOf(PermanentError);
    expect(classify(e)).toBe("refusal");
  });
  it("estimate.send: the read of its lead fails — «try later», not «no lead»", async () => {
    answers.push({ data: null, error: null, status: 200 }); // send_estimate went
    answers.push({ data: null, error: { message: "Gateway Timeout", code: "" }, status: 504 });
    const e = await fail(applyOp({ k: "estimate.send", id: "e1" } as Parameters<typeof applyOp>[0], "co", "u"));
    expect(asked.slice(0, 2)).toEqual(["rpc:send_estimate", "from:estimates"]);
    expect(classify(e)).toBe("transient");
  });
});
