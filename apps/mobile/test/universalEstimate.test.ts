import { describe, it, expect } from "vitest";
import { clientDoc, kitPrice, linesFromCatalog, summarize, withAddons, mainOption, optionTotals, catalogUnitPrice } from "../src/features/estimateDoc";
import { SEED_CATALOG, makeSeed } from "../src/data/seed";

describe("universal estimate (app helpers)", () => {
  it("catalog material price = supplier price + supplier tax + markup", () => {
    const bracket = SEED_CATALOG.find((x) => x.id === "cat-bracket")!;
    expect(catalogUnitPrice(bracket)).toBe(1213); // $10 + 10.25% + 10%
  });
  it("kit expands into lines of their own groups", () => {
    const kit = SEED_CATALOG.find((x) => x.id === "kit-railing")!;
    const lines = linesFromCatalog(kit, SEED_CATALOG);
    expect(lines.map((l) => [l.group, String(l.quantity), l.unitPriceCents])).toEqual([
      ["labor", "1", 25000],
      ["material", "12", 1213],
    ]);
    expect(lines[1]!.unitCostCents).toBe(1103);
    expect(kitPrice(kit, SEED_CATALOG)).toBe(25000 + 12 * 1213);
  });
  it("demo handyman estimate: tax only on materials, add-on excluded until chosen", () => {
    const e = makeSeed().estimates.find((x) => x.id === "e6")!;
    const doc = e.doc!;
    const o = mainOption(doc);
    const t = optionTotals(doc, o);
    // services 15000; labor 18000+25000+2500; materials 14556+728
    expect(t.groupSubtotals).toEqual({ service: 15000, labor: 45500, material: 15284 });
    expect(t.tax).toBe(1452); // 15284 × 9.5% = 1451.98
    expect(e.totalCents).toBe(75784 + 1452);
    const withClean = optionTotals(doc, withAddons(o, ["l-e6-7"]));
    expect(withClean.total).toBe(75784 + 9000 + 1452);
    expect(summarize(doc, { optionId: o.id, addonIds: ["l-e6-7"] }).totalCents).toBe(withClean.total);
  });
  it("client copy has no costs", () => {
    const doc = makeSeed().estimates.find((x) => x.id === "e6")!.doc!;
    expect(JSON.stringify(clientDoc(doc))).not.toContain("unitCostCents");
    expect(JSON.stringify(doc)).toContain("unitCostCents");
  });
});

import { buildAttention } from "../src/features/attention";
describe("signed estimate waits for a date", () => {
  it("unscheduled job without visits is in 'needs attention'; disappears once a visit exists", () => {
    const db = makeSeed();
    db.jobs.push({ id: "jx", propertyId: "p3", title: "Handyman", status: "unscheduled", amountCents: 77236, estimateId: "e6" });
    expect(buildAttention(db).find((a) => a.kind === "schedule")?.refId).toBe("jx");
    db.visits.push({ id: "vx", jobId: "jx", techId: null, start: new Date().toISOString(), durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0 });
    expect(buildAttention(db).some((a) => a.kind === "schedule")).toBe(false);
  });
});

describe("lead funnel", () => {
  it("lead attention follows whose turn: no step → remind → lost or wait; closed leads leave", () => {
    const db = makeSeed();
    const l5 = db.leads.find((l) => l.id === "l5")!;
    l5.status = "estimate_sent";
    db.tasks = db.tasks.filter((t) => t.subjectId !== "l5");
    db.estimates = db.estimates.map((e) => (e.leadId === "l5" ? { ...e, sentAt: new Date(Date.now() - 4 * 86_400_000).toISOString() } : e));
    l5.lastOutboundAt = new Date(Date.now() - 4 * 86_400_000).toISOString();
    expect(buildAttention(db).find((a) => a.refId === "l5")?.label).toBe("att.leadRemind");
    // the estimate went out 20 days ago, the reminder 15 days ago
    db.estimates = db.estimates.map((e) => (e.leadId === "l5" ? { ...e, sentAt: new Date(Date.now() - 20 * 86_400_000).toISOString() } : e));
    l5.remindedAt = new Date(Date.now() - 15 * 86_400_000).toISOString();
    expect(buildAttention(db).find((a) => a.refId === "l5")?.label).toBe("att.leadLostOrWait");
    l5.status = "won";
    expect(buildAttention(db).some((a) => a.refId === "l5")).toBe(false);
  });
});
