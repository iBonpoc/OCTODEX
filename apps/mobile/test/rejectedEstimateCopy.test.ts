/**
 * #2478 (спека 65 §3.5, С7, В3 по умолчанию): правили отправленную смету без сети, клиент тем временем подписал —
 * сервер отказал (estimate_signed_meanwhile). Подпись клиента остаётся, а правки не пропадают: отказ хранит их
 * (RejectedOp.estimateEdit), «Сделать копию» делает из них новую смету-черновик (новые id вариантов и строк,
 * себестоимость на месте; клиент, объект, лид и название — те же), «Сбросить» — убрать карточку. Pure part.
 */
import { describe, expect, it } from "vitest";
import type { Op } from "../src/cloud/ops";
import { rejectedOf } from "../src/data/outboxRejected";
import { copyOfRejectedEstimate } from "../src/data/rejectedEstimateCopy";

const doc = {
  options: [
    { id: "o1", name: "Good", lines: [{ id: "l1", name: "Work (test)", group: "labor", quantity: "2", unit: "ea", unitPriceCents: 1000 }, { id: "l2", name: "Part (test)", group: "materials", quantity: "1", unit: "ea", unitPriceCents: 500 }] },
  ],
  settings: { tax: { enabled: false, rateBps: 0, groups: {} }, deposit: { kind: "none" }, discount: null },
};
const save = { k: "estimate.save", id: "e-1", versionId: "v-new", customerId: "c-1", propertyId: "p-1", leadId: "lead-1", templateId: "tpl-1", title: "Gutters (test)", doc, costs: { l2: 300 }, totalCents: 2500, depositCents: 0, marginPct: null } as unknown as Op;
const at = Date.parse("2026-11-25T12:00:00Z");

describe("unit:rejectedEstimateCopy — #2478", () => {
  it("the refusal keeps the edits: title, client, place, lead, document, costs", () => {
    const rej = rejectedOf({ id: "ob-1", op: save, tries: 4 } as never, "refused", at, null, "estimate_signed_meanwhile");
    expect(rej?.estimateEdit).toEqual({ title: "Gutters (test)", customerId: "c-1", propertyId: "p-1", leadId: "lead-1", templateId: "tpl-1", doc, costs: { l2: 300 } });
  });
  it("another refusal of a save keeps nothing extra", () => {
    const rej = rejectedOf({ id: "ob-1", op: { ...save, k: "estimate.send" } as never, tries: 4 } as never, "refused", at, null, "estimate_lines_mismatch");
    expect(rej && "estimateEdit" in rej).toBe(false);
  });
  it("the copy: new ids for options and lines, costs back on their lines, everything else the same", () => {
    const rej = rejectedOf({ id: "ob-1", op: save, tries: 4 } as never, "refused", at, null, "estimate_signed_meanwhile")!;
    let n = 0;
    const c = copyOfRejectedEstimate(rej.estimateEdit!, () => `n${++n}`);
    expect(c.customerId).toBe("c-1");
    expect(c.propertyId).toBe("p-1");
    expect(c.leadId).toBe("lead-1");
    expect(c.title).toBe("Gutters (test)");
    const o = c.doc.options[0]!;
    expect(o.id).not.toBe("o1");
    expect(o.lines.map((l) => l.id)).not.toContain("l1");
    expect(o.lines.map((l) => [l.name, l.quantity, l.unitPriceCents, l.unitCostCents])).toEqual([["Work (test)", "2", 1000, undefined], ["Part (test)", "1", 500, 300]]);
    expect(c.doc.settings).toEqual(doc.settings);
    // the refused document itself is not changed
    expect(doc.options[0]!.id).toBe("o1");
  });
});
