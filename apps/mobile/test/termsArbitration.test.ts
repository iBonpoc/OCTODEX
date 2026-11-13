/** unit:termsArbitration — #1325: Terms that speak of arbitration (en / es / ru) get the B&P §7191 warning. Test data. */
import { describe, expect, it } from "vitest";
import { mentionsArbitration } from "../src/features/termsArbitration";

describe("unit:termsArbitration — #1325", () => {
  it("finds arbitration in English, Spanish and Russian, in any form and case", () => {
    for (const t of [
      "Any dispute shall be resolved by binding ARBITRATION (test).",
      "The parties agree to arbitrate (test).",
      "decided by an arbitrator (test)",
      "Cualquier disputa se resolverá mediante arbitraje (prueba).",
      "decidido por un árbitro (prueba)",
      "Споры решаются в арбитражном порядке (тест).",
      "через третейский суд (тест)",
    ])
      expect(mentionsArbitration(t), t).toBe(true);
  });
  it("ordinary Terms — no warning; nothing — no warning", () => {
    for (const t of ["Warranty: 1 year on labor (test).", "Garantía de 1 año (prueba).", "Гарантия 1 год (тест).", "", undefined, null])
      expect(mentionsArbitration(t as string)).toBe(false);
  });
});
