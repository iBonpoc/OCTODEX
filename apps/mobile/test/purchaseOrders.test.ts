/**
 * unit:purchaseOrders — spec 37 SUP2: what a job needs to buy (the approved option + chosen add-ons, or the job's own
 * lines), only materials of the price list, summed per item, packs of the purchase unit (engine), grouped by supplier;
 * a module's line (slot S11g) replaces the core's; the moves and the status after receiving; the server rows.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/cloud/client", () => ({ supabase: {} }));
import { makeSeed } from "../src/data/seed";
import type { CatalogItem, DB, Estimate, Job, PurchaseOrder } from "../src/data/types";
import { canEditOrders, canMove, canReceive, draftsForJob, jobMaterialNeeds, linesEditable, openDraft, orderTotalCents, statusAfterReceive } from "../src/features/purchaseOrders";
import { posFromRows, poLineToRow, poToRow } from "../src/features/purchaseOrderRows";

const mat = (id: string, over: Partial<CatalogItem> = {}): CatalogItem => ({ id, kind: "material", name: id, unit: "ea", priceCents: 0, costCents: 37, ...over });
const line = (id: string, catalogItemId: string | undefined, quantity: string, over: object = {}) =>
  ({ id, name: id, group: "material", quantity, unit: "ea", unitPriceCents: 0, catalogItemId, ...over }) as never;

function company(): DB {
  const db = makeSeed();
  const catalog = [
    mat("hanger", { supplierId: "s1", packSize: "50", purchaseUnit: "box", supplierSku: "H-50" }),
    mat("screw", { supplierId: "s1" }),
    mat("paint", { supplierId: "s2", packSize: "1", purchaseUnit: "gal" }),
    mat("loose"),
    { id: "svc", kind: "service", name: "Install", unit: "ea", priceCents: 100 } as CatalogItem,
  ];
  const est: Estimate = {
    ...(db.estimates[0] as Estimate), id: "eP", status: "approved",
    doc: {
      settings: { tax: { enabled: false, rateBps: 0, groups: { service: false, labor: false, material: false } }, deposit: { kind: "none" } } as never,
      options: [
        { id: "good", name: "Good", lines: [line("x", "hanger", "10")] },
        { id: "best", name: "Best", lines: [
          line("a", "hanger", "40"), line("b", "hanger", "25"), line("c", "screw", "3.5"), line("d", "paint", "2", { optional: true }),
          line("e", "loose", "1", { optional: true }), line("f", "svc", "1", { group: "service" }), line("g", undefined, "4"),
        ] },
      ],
    },
    approval: { optionId: "best", addonIds: ["d"], signerName: "C", signature: "", at: "", channel: "on_site", totalCents: 0, depositCents: 0 },
  } as Estimate;
  const job: Job = { ...(db.jobs[0] as Job), id: "jP", estimateId: "eP" };
  return { ...db, catalog, estimates: [est, ...db.estimates], jobs: [job, ...db.jobs], purchaseOrders: [] };
}

describe("unit:purchaseOrders — what a job needs", () => {
  it("the approved option + the chosen add-on; materials of the price list only; summed per item", () => {
    expect(jobMaterialNeeds(company(), "jP")).toEqual([
      { catalogItemId: "hanger", qty: "65" },
      { catalogItemId: "screw", qty: "3.5" },
      { catalogItemId: "paint", qty: "2" },
    ]);
  });
  it("a job without an estimate: its own lines", () => {
    const db = { ...company(), jobs: [{ ...company().jobs[0]!, id: "jL", estimateId: undefined }], jobLines: [
      { id: "l1", jobId: "jL", position: 0, name: "s", catalogItemId: "screw", quantity: "2", unitPriceCents: 0, taxable: false, totalCents: 0 },
      { id: "l2", jobId: "jL", position: 1, name: "s", catalogItemId: "screw", quantity: "0.5", unitPriceCents: 0, taxable: false, totalCents: 0 },
    ] } as DB;
    expect(jobMaterialNeeds(db, "jL")).toEqual([{ catalogItemId: "screw", qty: "2.5" }]);
  });
  it("drafts by supplier, in packs: 65 hangers in boxes of 50 → 2 box; no pack size → «check the pack size»", () => {
    const g = draftsForJob(company(), "jP", [], true);
    expect(g.map((x) => x.supplierId)).toEqual(["s1", "s2"]);
    const s1 = g[0]!.lines;
    expect(s1.find((l) => l.catalogItemId === "hanger")).toMatchObject({ qty: "2", unit: "box", bomQty: "65", supplierSku: "H-50", checkPack: false, costCents: 1850 });
    expect(s1.find((l) => l.catalogItemId === "screw")).toMatchObject({ qty: "4", unit: "ea", checkPack: true, costCents: 37 });
  });
  it("who does not see costs gets no cost in the lines", () => {
    expect(draftsForJob(company(), "jP", [], false)[0]!.lines.every((l) => l.costCents === undefined)).toBe(true);
  });
  it("slot S11g: a module's line replaces the core's for the same item; packed is not divided; a new item is added", () => {
    const g = draftsForJob(company(), "jP", [
      { catalogItemId: "hanger", qty: "3", packed: true, note: "white" },
      { catalogItemId: "loose", qty: "7" },
    ], false);
    const all = g.flatMap((x) => x.lines);
    expect(all.find((l) => l.catalogItemId === "hanger")).toMatchObject({ qty: "3", note: "white" });
    expect(all.find((l) => l.catalogItemId === "hanger")!.bomQty).toBeUndefined();
    // an item without a supplier → the group without one (pick it in the order)
    expect(g.find((x) => !x.supplierId)!.lines[0]).toMatchObject({ catalogItemId: "loose", qty: "7", checkPack: true });
  });
  it("two module lines of one item are summed, their notes kept (review SUP2-а №4)", () => {
    const all = draftsForJob(company(), "jP", [
      { catalogItemId: "screw", qty: "10", note: "front" },
      { catalogItemId: "screw", qty: "5.5", note: "back" },
    ], false).flatMap((g) => g.lines);
    expect(all.find((l) => l.catalogItemId === "screw")).toMatchObject({ qty: "16", bomQty: "15.5", note: "front, back" });
  });
  it("a bad quantity of one line leaves it out, the rest of the order is made (review SUP2-а №6)", () => {
    const all = draftsForJob(company(), "jP", [{ catalogItemId: "screw", qty: "-3" }, { catalogItemId: "loose", qty: "" }], false).flatMap((g) => g.lines);
    expect(all.map((l) => l.catalogItemId).sort()).toEqual(["hanger", "paint", "screw"]);
  });
  it("an open draft of the job and supplier is found (not doubled)", () => {
    const o = { id: "o1", jobId: "jP", supplierId: "s1", status: "draft", revision: 0, fulfillment: "delivery", printPrices: false, createdAt: "t", lines: [] } as PurchaseOrder;
    const db = { ...company(), purchaseOrders: [o] };
    expect(openDraft(db, "jP", "s1")?.id).toBe("o1");
    expect(openDraft(db, "jP", "s2")).toBeUndefined();
    expect(openDraft({ ...db, purchaseOrders: [{ ...o, status: "sent" }] }, "jP", "s1")).toBeUndefined();
  });
});

describe("unit:purchaseOrders — statuses and rights (map §5)", () => {
  const o = (status: PurchaseOrder["status"], lines: [string, string][]) =>
    ({ status, lines: lines.map(([qty, receivedQty], i) => ({ id: `l${i}`, position: i, name: "x", qty, unit: "ea", receivedQty, checkPack: false })) }) as PurchaseOrder;
  it("the moves as the server's status_transitions", () => {
    expect(canMove("draft", "sent")).toBe(true);
    expect(canMove("draft", "received")).toBe(false);
    expect(canMove("cancelled", "draft")).toBe(false);
    expect(canMove("received", "partially_received")).toBe(true);
    expect(linesEditable({ status: "sent" })).toBe(true);
    expect(linesEditable({ status: "partially_received" })).toBe(false);
  });
  it("after receiving (as po_receive): all → received; some → partially; every tick taken back → sent again", () => {
    expect(statusAfterReceive(o("sent", [["2", "2"], ["1", "1"]]))).toBe("received");
    expect(statusAfterReceive(o("sent", [["2", "2"], ["1", "0"]]))).toBe("partially_received");
    expect(statusAfterReceive(o("received", [["2", "1"], ["1", "1"]]))).toBe("partially_received");
    expect(statusAfterReceive(o("sent", [["2", "0"]]))).toBe("sent");
    expect(statusAfterReceive(o("received", [["2", "0"]]))).toBe("sent");
    expect(statusAfterReceive(o("partially_received", [["2", "0"]]))).toBe("sent");
  });
  it("who: the office edits; the tech receives; sales neither", () => {
    expect(canEditOrders("director") && canEditOrders("dispatcher")).toBe(true);
    expect(canEditOrders("tech") || canEditOrders("sales")).toBe(false);
    expect(canReceive("tech") && canReceive("director")).toBe(true);
    expect(canReceive("sales")).toBe(false);
  });
  it("the expected total: only when every line has a cost (engine, half up)", () => {
    const x = o("draft", [["2", "0"], ["1.5", "0"]]);
    expect(orderTotalCents({ lines: x.lines.map((l, i) => ({ ...l, costCents: [1850, 333][i] })) })).toBe(4200);
    expect(orderTotalCents(x)).toBeUndefined();
  });
});

describe("unit:purchaseOrders — server rows", () => {
  it("an order there and back (costs only when read)", () => {
    const ord: PurchaseOrder = {
      id: "o1", status: "sent", revision: 2, fulfillment: "pickup", printPrices: false, createdAt: "2026-11-08T00:00:00Z", supplierId: "s1", jobId: "j1",
      supplierName: "ABC (test)", sentAt: "2026-11-08T01:00:00Z",
      lines: [{ id: "l1", position: 0, name: "Hanger", qty: "2", unit: "box", receivedQty: "0", checkPack: false, bomQty: "65", catalogItemId: "hanger", costCents: 1850 }],
    };
    const row = poToRow(ord, "c1");
    expect(row).toMatchObject({ company_id: "c1", status: "sent", revision: 2, fulfillment: "pickup", supplier_name: "ABC (test)", deliver_to: null });
    const lr = poLineToRow(ord.lines[0]!, "o1", "c1");
    expect(lr).toMatchObject({ po_id: "o1", qty: 2, bom_qty: "65" });
    expect("received_qty" in lr).toBe(false);
    const back = posFromRows([{ ...row, created_at: ord.createdAt, number: "PO-0007" }], [{ ...lr, received_qty: "0.000" }], [{ line_id: "l1", unit_cost_cents: 1850 }]);
    expect(back).toEqual([{ ...ord, number: "PO-0007" }]);
    expect(posFromRows([{ ...row, created_at: ord.createdAt }], [{ ...lr, received_qty: 0 }], [])[0]!.lines[0]!.costCents).toBeUndefined();
  });
});

describe("unit:purchaseOrders — slot S11g in the registry", () => {
  it("an active module's lines come to the core; a switched-off or failing one adds none", async () => {
    const { registerModule, modulePurchaseLines } = await import("../src/modules/registry");
    registerModule({ key: "t37mod", titleKey: "sup.title", hintKey: "sup.help", trialDays: 7, priceCentsMonthly: 0, purchaseLines: (job: { id: string }) => [{ catalogItemId: "loose", qty: "3", note: job.id }] } as never);
    registerModule({ key: "t37bad", titleKey: "sup.title", hintKey: "sup.help", trialDays: 7, priceCentsMonthly: 0, purchaseLines: () => { throw new Error("x"); } } as never);
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const base = company();
    const on = (keys: string[]) => ({ ...base, company: { ...base.company!, modules: Object.fromEntries(keys.map((k) => [k, { enabled: true, trialEndsAt: future, settings: {}, rowVersion: 1 }])) } }) as DB;
    expect(modulePurchaseLines(on(["t37mod", "t37bad"]), "jP")).toEqual([{ catalogItemId: "loose", qty: "3", note: "jP" }]);
    expect(modulePurchaseLines(on([]), "jP")).toEqual([]);
  });
});
