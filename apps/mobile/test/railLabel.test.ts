/** #3011: the side rail's captions — two lines between words, the longest word shrinks to fit (never cut inside a word) */
import { describe, expect, it } from "vitest";
import { font } from "@octo/design-tokens";
import { longestWord, railLabelRoom, railLabelScale } from "../src/nav/railLabel";

describe("rail caption (#3011)", () => {
  it("a word that fits keeps its size", () => {
    expect(railLabelScale(50)).toBe(1);
    expect(railLabelScale(railLabelRoom)).toBe(1);
    expect(railLabelScale(0)).toBe(1);
  });
  it("a wider word shrinks to the room, not under the floor", () => {
    expect(railLabelScale(71)).toBeCloseTo(railLabelRoom / 71);
    expect(railLabelScale(1000)).toBe(font.fitMinScale);
  });
  it("the longest word is the one measured", () => {
    expect(longestWord("Заказы поставщикам")).toBe("поставщикам");
    expect(longestWord("Configuración de la empresa")).toBe("Configuración");
    expect(longestWord("Сообщения")).toBe("Сообщения");
  });
});
