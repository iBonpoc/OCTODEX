import { describe, expect, it } from "vitest";
import { buildAttention } from "../src/features/attention";
import { makeSeed } from "../src/data/seed";

describe("needs-attention queue", () => {
  const items = buildAttention(makeSeed());
  it("puts unanswered leads first", () => {
    expect(items[0]!.kind).toBe("lead");
  });
  it("includes overdue invoice, unassigned visit, late tech and stale estimates", () => {
    const kinds = new Set(items.map((i) => i.kind));
    for (const k of ["overdue", "unassigned", "late", "estimate"]) expect(kinds.has(k as never)).toBe(true);
  });
  it("estimate 2–4 days = warn, 5+ days = bad (HANDOFF timing rule)", () => {
    const est = items.filter((i) => i.kind === "estimate");
    for (const e of est) expect(e.status).toBe(Number(e.params.d) >= 5 ? "bad" : "warn");
  });
  it("lead waiting ≥ 15 min is critical", () => {
    const l = items.find((i) => i.kind === "lead" && Number(i.params.m) >= 15);
    expect(l?.status).toBe("bad");
  });
  it("paid and future invoices are not flagged", () => {
    expect(items.some((i) => i.refId === "i3" || i.refId === "i2")).toBe(false);
  });
});
