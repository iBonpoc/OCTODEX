import { describe, expect, it } from "vitest";
import { colorChoices } from "../src/modules/gutters/draw/colorChoices";
import { colorHex } from "../src/modules/gutters/colorHex";

/** #2412 G1 PR2 (DS §9б.6): one colour field for a gutter and a downspout — a sample beside every name */
const words = { asRun: (c: string) => `As gutter · ${c}`, mill: "Unpainted", notOffered: "not offered", color: (c: string) => c };

describe("colorChoices", () => {
  it("a gutter: «Unpainted» first (a struck ring), then the palette with samples", () => {
    const { value, colors } = colorChoices({ material: "aluminum", color: "white" }, ["white", "black"], words);
    expect(value).toBe("white");
    expect(colors).toEqual([
      { key: "@mill", label: "Unpainted", top: true, none: true },
      { key: "white", label: "white", hex: colorHex("white") },
      { key: "black", label: "black", hex: colorHex("black") },
    ]);
  });
  it("a downspout: «As gutter» with the gutter's sample, chosen when it is the gutter's colour", () => {
    const { value, colors } = colorChoices({ material: "aluminum", color: "black" }, ["white", "black"], words, { material: "aluminum", color: "black" });
    expect(value).toBe("@run");
    expect(colors[0]).toEqual({ key: "@run", label: "As gutter · black", top: true, hex: colorHex("black") });
  });
  it("a bare gutter: «As gutter · Unpainted» with the ring; a copper gutter — no «As gutter»", () => {
    expect(colorChoices({ material: "aluminum", finish: "mill" }, ["white"], words, { material: "aluminum", finish: "mill" }).colors[0]).toEqual({ key: "@run", label: "As gutter · Unpainted", top: true, none: true });
    expect(colorChoices({ material: "aluminum", color: "white" }, ["white"], words, { material: "copper" }).colors.some((c) => c.key === "@run")).toBe(false);
  });
  it("a colour the company does not install stays, said «not offered»; a company's own name has no sample (never the «no colour» ring)", () => {
    const { colors } = colorChoices({ material: "aluminum", color: "Sunset" }, ["white"], words);
    expect(colors.find((c) => c.key === "Sunset")).toEqual({ key: "Sunset", label: "Sunset · not offered", hex: undefined });
  });
  it("samples by name, case ignored; the founder's palette all have one", () => {
    expect(colorHex("Royal Brown")).toBe(colorHex("royal brown"));
    expect(colorHex("constructor")).toBeUndefined();
  });
});
