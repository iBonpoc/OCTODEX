/**
 * #2990 (founder 27.11: «привязал чертёж к лиду Linda Alvarez. Что должно произойти? Непонятно»): once linked, the card says what the lead or the
 * client's address already has — an estimate WITHOUT this measurement's lines — instead of a bare «Без сметы» (the old card offered «Сделать
 * смету» and silently made a second one). Declined ones never count; the measurement's own estimate is not «another».
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/cloud/client", () => ({ supabase: {} }));
import type { Estimate } from "../src/data/types";
import { otherEstimates } from "../src/modules/gutters/estimateLink";

const est = (o: Partial<Estimate> & { id: string }): Estimate => ({ customerId: "", propertyId: "", totalCents: 0, status: "sent", ...o }) as Estimate;
const own = { options: [{ lines: [{ source: { module: "gutters", measurementId: "m1" } }] }] } as unknown as Estimate["doc"];

describe("otherEstimates", () => {
  it("a draft without a lead or an address: none", () => {
    expect(otherEstimates({ estimates: [est({ id: "e1", leadId: "l1" })] }, { id: "m1", leadId: null, propertyId: null })).toEqual([]);
  });
  it("the lead's estimate without this drawing: shown, the newest number first; declined ones left out", () => {
    const db = { estimates: [est({ id: "a", leadId: "l1", number: "EST-0006" }), est({ id: "b", leadId: "l1", number: "EST-0011" }), est({ id: "c", leadId: "l1", number: "EST-0012", status: "declined" }), est({ id: "d", leadId: "l2", number: "EST-0020" })] };
    expect(otherEstimates(db, { id: "m1", leadId: "l1", propertyId: null }).map((e) => e.number)).toEqual(["EST-0011", "EST-0006"]);
  });
  it("the client's address: its estimates count too", () => {
    const db = { estimates: [est({ id: "a", propertyId: "p1", number: "EST-0002" })] };
    expect(otherEstimates(db, { id: "m1", leadId: null, propertyId: "p1" }).map((e) => e.id)).toEqual(["a"]);
  });
  it("the measurement's own estimate is not «another»", () => {
    const db = { estimates: [est({ id: "a", leadId: "l1", number: "EST-0006", doc: own })] };
    expect(otherEstimates(db, { id: "m1", leadId: "l1", propertyId: null })).toEqual([]);
  });
});
