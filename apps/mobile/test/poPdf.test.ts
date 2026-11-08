/**
 * unit:poPdf — spec 37 §6: the purchase order PDF is in English whatever the app's language, never prints the
 * client's name, prints prices only when asked and every line has its cost (engine sums), shows pickup or the address.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/cloud/client", () => ({ supabase: {} }));
import { makeSeed } from "../src/data/seed";
import type { DB, PurchaseOrder } from "../src/data/types";
import { poHtml } from "../src/features/poPdf";
import { companyForPortal } from "../src/cloud/portal";

const db = (): DB => makeSeed();
const order = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: "o1", number: "PO-0042", supplierId: "sup-hd", jobId: "j1", status: "sent", revision: 1, fulfillment: "delivery", deliverTo: "12 Oak St, Pasadena",
  printPrices: false, createdAt: "2026-11-08T12:00:00Z", sentAt: "2026-11-08T12:00:00Z", supplierName: "Home Depot",
  lines: [
    { id: "l1", position: 0, name: "Hanger (test)", supplierSku: "H-50", qty: "2", unit: "box", receivedQty: "0", checkPack: false, costCents: 1850 },
    { id: "l2", position: 1, name: "Screw (test)", qty: "1.5", unit: "lb", receivedQty: "0", checkPack: true, costCents: 333 },
  ],
  ...over,
});

describe("unit:poPdf", () => {
  it("English, the number, the job's number, the address; never the client's name; no prices by default", () => {
    const d = db();
    const html = poHtml(d, order(), companyForPortal(d, "Test Co"), { lang: "en" });
    expect(html).toContain("Purchase order PO-0042");
    expect(html).toContain("JOB-0001");
    expect(html).toContain("12 Oak St, Pasadena");
    expect(html).toContain("H-50");
    const client = d.customers.find((c) => c.id === "c1")!.name;
    expect(html).not.toContain(client);
    expect(html).not.toContain("$");
  });
  it("prices only when asked: $18.50 × 2 + $3.33 × 1.5 = $42.00 before tax (engine)", () => {
    const d = db();
    const html = poHtml(d, order({ printPrices: true }), companyForPortal(d, "Test Co"), { lang: "en" });
    expect(html).toContain("$18.50");
    expect(html).toContain("Total before tax");
    expect(html).toContain("$42");
  });
  it("a line without its cost: no prices at all (never a half-priced order)", () => {
    const d = db();
    const o = order({ printPrices: true });
    o.lines[1] = { ...o.lines[1]!, costCents: undefined };
    expect(poHtml(d, o, companyForPortal(d, "Test Co"), { lang: "en" })).not.toContain("$");
  });
  it("pickup: «Will call», no address", () => {
    const d = db();
    const html = poHtml(d, order({ fulfillment: "pickup" }), companyForPortal(d, "Test Co"), { lang: "en" });
    expect(html).toContain("Will call (pickup)");
    expect(html).not.toContain("12 Oak St");
  });
});
