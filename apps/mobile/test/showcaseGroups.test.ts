import { describe, expect, it } from "vitest";
import { SCREENS, SECTIONS } from "../src/features/showcase/registry";

// #2745 (founder 25.11, #2744): «все токены вживую» — every screen that draws token groups is a row of the list, in the group «Токены»
describe("showcase: the token screens are rows of the list", () => {
  const tokenScreens = [...new Set(SECTIONS.filter((s) => s.tokenGroups.length && s.screen !== "proto" && s.screen !== "icons").map((s) => s.screen))];
  it("the token screens exist", () => expect(tokenScreens.sort()).toEqual(["base", "motion", "spacing"]));
  for (const id of tokenScreens) {
    const s = SCREENS.find((x) => x.id === id)!;
    it(`${id} is not hidden and stands in the tokens group`, () => {
      expect(s.hidden).toBeFalsy();
      expect(s.group).toBe("tokens");
    });
  }
  it("only token screens are in the tokens group", () => {
    for (const s of SCREENS.filter((x) => x.group === "tokens")) expect(tokenScreens).toContain(s.id);
  });
});
