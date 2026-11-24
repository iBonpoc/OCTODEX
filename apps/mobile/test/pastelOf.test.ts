import { describe, expect, it } from "vitest";
import { pastelOf } from "../src/ui/pastelOf";

describe("pastelOf", () => {
  it("the same name — the same pastel, whatever the spaces around it", () => {
    expect(pastelOf("Linda Alvarez")).toBe("peach");
    expect(pastelOf("  Linda Alvarez ")).toBe(pastelOf("Linda Alvarez"));
  });
  it("one of the four, an empty name too", () => {
    for (const n of ["", "David Kim", "Sarah Mitchell", "Robert Chen", "Maria Gonzalez"]) expect(["lav", "mint", "butter", "peach"]).toContain(pastelOf(n));
  });
});
