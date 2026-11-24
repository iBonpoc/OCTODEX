import { describe, expect, it } from "vitest";
import { jobHeadParts } from "../src/features/job/headName";

describe("the job's name in the header (v2 «Имя | строка», #2350)", () => {
  it("up to «:» is the name, the rest the line", () => expect(jobHeadParts("Bathroom remodel: vanity, toilet, tile")).toEqual({ name: "Bathroom remodel", rest: "vanity, toilet, tile" }));
  it("«, » and « — » split too", () => {
    expect(jobHeadParts("Interior painting, 2 bedrooms")).toEqual({ name: "Interior painting", rest: "2 bedrooms" });
    expect(jobHeadParts("Roof repair — north side")).toEqual({ name: "Roof repair", rest: "north side" });
  });
  it("no mark — the whole name; a mark at the very start — the whole name", () => {
    expect(jobHeadParts("Panel upgrade 200A")).toEqual({ name: "Panel upgrade 200A" });
    expect(jobHeadParts("A: b")).toEqual({ name: "A: b" });
    expect(jobHeadParts("Ends with colon:")).toEqual({ name: "Ends with colon:" });
  });
});
