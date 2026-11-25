/**
 * ДС волна А1-2 (#2500): «черновик» и «нет / отменён» — два разных значка у одной серой плашки (DS §3.3).
 * Статусы как данные не менялись: признак `draft` — только вид.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { icons, statusGlyph, statusIcon, type StatusName } from "@octo/design-tokens";
import { estimateStatusView } from "@/features/estimateStatus";
import { PO_DRAFT } from "@/features/purchaseOrders";
import type { EstimateStatus } from "@/data/types";

const ALL: EstimateStatus[] = ["draft", "sent", "awaiting_countersign", "approved", "declined"];

describe("значки статуса: черновик ≠ нет / отменён", () => {
  it("draft — штрих-пунктир, neutral — кружок с чертой, пути разные", () => {
    expect(icons.draft).toMatch(/^M13\.10 3\.07A9 9 0 0 1/);
    expect(icons.neutral).toBe("M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0ZM8 12h8");
    expect(icons.draft).not.toBe(icons.neutral);
  });
  it("statusGlyph: draft только у серого и только с признаком", () => {
    expect(statusGlyph("neutral", true)).toBe("draft");
    expect(statusGlyph("neutral")).toBe("neutral");
    expect(statusGlyph("neutral", false)).toBe("neutral");
    for (const s of ["ok", "info", "warn", "bad"] as StatusName[]) expect(statusGlyph(s, true)).toBe(statusIcon[s]);
  });
  it("черновик сметы помечен во всех таблицах видов, остальные — нет", () => {
    for (const s of ALL) {
      expect(estimateStatusView(s).d === true).toBe(s === "draft");
    }
  });
  it("черновик заказа поставщику — draft, отменён — нет", () => {
    expect(PO_DRAFT).toEqual({ draft: true, cancelled: false, sent: false, partially_received: false, received: false });
  });
  it("слово плашки статуса — `caption` 13/600 как в «Графите», не `micro` 12", () => {
    const src = readFileSync(join(__dirname, "../src/ui/statusPill.tsx"), "utf8");
    expect(src).toMatch(/<T v="caption" w="semibold" capped/);
    expect(src).not.toMatch(/v="micro"/);
  });
});
