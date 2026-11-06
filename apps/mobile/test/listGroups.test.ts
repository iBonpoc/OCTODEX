/** Estimate list groups: the contractor's turn first (spec 06, PR4). */
import { addDays } from "../src/features/calendar";
import { describe, expect, it } from "vitest";
import { timing } from "@octo/design-tokens";
import { estimateGroup, inEstimateFilter, inListFilter, invoiceGroup } from "@/features/listGroups";

// 3 PM on Nov 5 in Los Angeles (the demo company), whatever the machine's zone
const NOW = new Date("2026-11-05T15:00:00-08:00").getTime();
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe("estimate groups", () => {
  it("client signed, waits for our signature → needs action (was hidden from «Open» before)", () => {
    expect(estimateGroup({ status: "awaiting_countersign" }, NOW)).toBe("action");
  });
  it("sent and not answered for estimateWarnDays → needs action; fresh → waiting", () => {
    expect(estimateGroup({ status: "sent", sentAt: ago(timing.estimateWarnDays) }, NOW)).toBe("action");
    expect(estimateGroup({ status: "sent", sentAt: ago(0) }, NOW)).toBe("waiting");
  });
  it("draft → drafts; approved and declined → done", () => {
    expect(estimateGroup({ status: "draft" }, NOW)).toBe("drafts");
    expect(estimateGroup({ status: "approved", sentAt: ago(10) }, NOW)).toBe("done");
    expect(estimateGroup({ status: "declined", sentAt: ago(10) }, NOW)).toBe("done");
  });
  it("filters: open = action + drafts + waiting, closed = done", () => {
    expect(["action", "drafts", "waiting"].every((g) => inEstimateFilter(g as never, "open"))).toBe(true);
    expect(inEstimateFilter("done", "open")).toBe(false);
    expect(inEstimateFilter("done", "closed")).toBe(true);
    expect(inEstimateFilter("waiting", "closed")).toBe(false);
    expect(inEstimateFilter("waiting", "all") && inEstimateFilter("done", "all")).toBe(true);
  });
});

describe("invoice groups", () => {
  const day = (offset: number) => {
    const d = new Date(NOW);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10) + "T12:00:00";
  };
  it("overdue or due today / tomorrow → needs action", () => {
    expect(invoiceGroup({ totalCents: 100, paidCents: 0, dueDate: day(-3) }, NOW)).toBe("action");
    expect(invoiceGroup({ totalCents: 100, paidCents: 50, dueDate: day(1) }, NOW)).toBe("action");
  });
  it("owes, due later → waiting; paid (or overpaid) → done", () => {
    expect(invoiceGroup({ totalCents: 100, paidCents: 0, dueDate: day(10) }, NOW)).toBe("waiting");
    expect(invoiceGroup({ totalCents: 100, paidCents: 100, dueDate: day(-30) }, NOW)).toBe("done");
    expect(invoiceGroup({ totalCents: 100, paidCents: 150, dueDate: day(-30) }, NOW)).toBe("done");
  });
  it("filters work the same for invoices", () => {
    expect(inListFilter("action", "open") && inListFilter("waiting", "open") && !inListFilter("done", "open")).toBe(true);
    expect(inListFilter("done", "closed")).toBe(true);
  });
});
