import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ru } from "../src/i18n/ru";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";

const d = (x: unknown) => x as Record<string, string>;
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

// estimate audit MAP §7–§8 (#2633): one word per concept
describe("estimate words (MAP §7–§8)", () => {
  it("«Примечания», not «Заметка для клиента»; «по типам», not «по видам»", () => {
    expect(d(ru)["est.nt.notes"]).toBe("Примечания");
    expect(d(ru)["est.sec.layout"]).toBe("Разложить по типам");
    expect(d(ru)["est.sec.laidOut"]).toBe("Разложено по типам");
    expect(d(en)["est.sec.layout"]).toBe("Group by type");
  });
  it("ES: «presupuesto» for the estimate — no «cotización», no «estimado» in the editor", () => {
    const keys = Object.keys(d(es)).filter((k) => !k.startsWith("mod.gutters."));
    expect(keys.filter((k) => /cotizaci[oó]n/i.test(d(es)[k]) || /\bestimado\b/i.test(d(es)[k]))).toEqual([]);
  });
  it("dead code is gone: EstimatesBoard, the old deposit step and sheet of the card", () => {
    expect(src("features/boards.tsx")).not.toContain("EstimatesBoard");
    const card = src("features/EstimateCard.tsx");
    expect(card).not.toContain("est-deposit-main");
    expect(card).not.toContain("est-deposit-sheet");
  });
});
