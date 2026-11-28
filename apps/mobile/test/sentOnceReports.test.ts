/**
 * #3059: an estimate edited after it went out (a draft again, #3058) still counts as sent — in the period numbers, the sales
 * report and the lead's wait. One rule: features/estimateStatus sentOnceAt.
 */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { DB, Estimate } from "../src/data/types";
import { periodNumbers } from "../src/features/metrics";
import { salesReport } from "../src/features/reports";
import { leadTurn } from "../src/features/leads";
import { todayKey } from "../src/features/calendar";

const edited = (e: Estimate): Estimate => ({ ...e, status: "draft", lastSentAt: e.sentAt, sentAt: undefined });

describe("an estimate edited after it went out still counts as sent (#3059)", () => {
  const seed = makeSeed();
  const sent = seed.estimates.find((e) => e.status === "sent" && e.sentAt && e.leadId)!;
  const withEdit: DB = { ...seed, estimates: seed.estimates.map((e) => (e.id === sent.id ? edited(e) : e)) };

  it("the period numbers count it as sent", () => {
    const before = periodNumbers(seed, "month", todayKey());
    const after = periodNumbers(withEdit, "month", todayKey());
    expect(after.sent).toBe(before.sent);
  });
  it("the sales report counts it as sent", () => {
    const before = salesReport(seed, "all" as never);
    const after = salesReport(withEdit, "all" as never);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });
  it("the lead still waits on it (the client has the sent version)", () => {
    const lead = seed.leads.find((l) => l.id === sent.leadId)!;
    const now = Date.parse(sent.sentAt!) + 4 * 86_400_000;
    const b = leadTurn(seed, lead, undefined, now);
    const a = leadTurn(withEdit, lead, undefined, now);
    expect(a).toEqual(b);
  });
});
