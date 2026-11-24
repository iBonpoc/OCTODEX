/** SectionStrip `steps` (BUILD-SPEC §1): passed / current / ahead from the current step. */
import { describe, expect, it } from "vitest";
import { stepStates } from "../src/ui/viewTabsLogic";

const visit = ["way", "here", "work", "sign", "pay"];

describe("ViewSteps — the states of the steps", () => {
  it("before the current — passed, the current — now, after — ahead", () => {
    expect(stepStates(visit, "way")).toEqual(["now", "next", "next", "next", "next"]);
    expect(stepStates(visit, "work")).toEqual(["done", "done", "now", "next", "next"]);
    expect(stepStates(visit, "pay")).toEqual(["done", "done", "done", "done", "now"]);
  });
  it("all passed when the visit is closed; an unknown step — nothing passed yet", () => {
    expect(stepStates(visit, "done")).toEqual(["done", "done", "done", "done", "done"]);
    expect(stepStates(visit, "nope")).toEqual(["next", "next", "next", "next", "next"]);
    expect(stepStates([], "way")).toEqual([]);
  });
  it("exactly one current step at most", () => {
    for (const k of visit) expect(stepStates(visit, k).filter((s) => s === "now")).toHaveLength(1);
  });
});
