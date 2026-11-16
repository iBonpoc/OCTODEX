/** The catalog item editor: what «Сохранить» misses, field by field (DS §11 п.3, #1728 PR-3c). */
import { describe, it, expect } from "vitest";
import type { CatalogItem } from "@/data/types";
import { editOk, editProblems } from "@/features/catalogEdit";

const item = (p: Partial<CatalogItem>): CatalogItem => ({
  id: "x",
  kind: "service",
  name: "",
  unit: "ea",
  priceCents: 0,
  ...p,
});

describe("catalog editor — what is missing", () => {
  it("an empty service: only the name (a price of $0 is allowed)", () => {
    expect(editProblems(item({}), false)).toEqual(["name"]);
    expect(editOk(item({ name: "Visit" }), false)).toBe(true);
  });
  it("a material counted from its cost: the name and the supplier's price, in the order of the screen", () => {
    expect(editProblems(item({ kind: "material" }), false)).toEqual([
      "name",
      "cost",
    ]);
    expect(
      editProblems(
        item({ kind: "material", name: "Bracket", costCents: 120 }),
        false,
      ),
    ).toEqual([]);
  });
  it("a material for who does not get our costs: the price is edited as it is — no cost asked", () => {
    expect(
      editProblems(item({ kind: "material", name: "Bracket" }), true),
    ).toEqual([]);
  });
  it("a kit: at least one component", () => {
    expect(editProblems(item({ kind: "kit", name: "Set" }), false)).toEqual([
      "components",
    ]);
    expect(
      editProblems(
        item({
          kind: "kit",
          name: "Set",
          components: [{ itemId: "a", qty: "1" }],
        }),
        false,
      ),
    ).toEqual([]);
  });
});
