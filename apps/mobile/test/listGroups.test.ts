/** Estimate list groups: the contractor's turn first (spec 06, PR4). */
import { describe, expect, it } from "vitest";
import { timing } from "@octo/design-tokens";
import { estimateGroup, inEstimateFilter } from "@/features/listGroups";

const NOW = new Date("2026-11-05T15:00:00").getTime();
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
