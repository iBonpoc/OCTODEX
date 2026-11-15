import { describe, expect, it } from "vitest";
import { fitsSegment, SEGMENT_MAX_LABEL, SEGMENT_MAX_OPTIONS } from "../src/ui/segmentFit";

describe("fitsSegment — a choice in one line, or a field with a menu (#1095)", () => {
  it("up to 4 short options fit; the 5th never does", () => {
    expect(fitsSegment(["Да", "Нет"])).toBe(true);
    expect(fitsSegment(["Раз", "Два", "Три", "Пять"])).toBe(true);
    expect(fitsSegment(["Раз", "Два", "Три", "Пять", "Шесть"])).toBe(false);
    expect(SEGMENT_MAX_OPTIONS).toBe(4);
  });
  it("one long label sends the choice to a field, even when the sum is small", () => {
    expect(fitsSegment(["A", "A".repeat(SEGMENT_MAX_LABEL)])).toBe(true);
    expect(fitsSegment(["A", "A".repeat(SEGMENT_MAX_LABEL + 1)])).toBe(false);
  });
  it("the sum counts the padding: four 10-letter options overflow a phone card (4×70 + 4×26 = 384 > 320), three do not (288)", () => {
    expect(fitsSegment(Array(4).fill("1234567890"))).toBe(false);
    expect(fitsSegment(Array(3).fill("1234567890"))).toBe(true);
  });
  it("the real sets: Russian", () => {
    expect(fitsSegment(["Установка", "Ремонт", "Обслуживание", "Гарантия", "Другое"])).toBe(false);
    expect(fitsSegment(["Как у объекта", "Другой адрес"])).toBe(true);
    expect(fitsSegment(["SMACNA (5 мин, осторожно)", "По коду (60 мин)"])).toBe(false);
  });
  it("the real sets: Spanish (the ones that used to run out of the card)", () => {
    expect(fitsSegment(["Instalación", "Reparación", "Limpieza de canaletas"])).toBe(false);
    expect(fitsSegment(["4512 Ventura Canyon Ave", "Nueva dirección"])).toBe(false);
    expect(fitsSegment(["Como el objeto", "Otra dirección"])).toBe(true);
  });
  it("nothing to choose from is not a segment", () => {
    expect(fitsSegment([])).toBe(false);
  });
});
