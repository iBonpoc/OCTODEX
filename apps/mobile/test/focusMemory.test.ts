import { beforeEach, describe, expect, it } from "vitest";
import { clearFocusMemory, rememberFocus, takeFocus } from "../src/nav/focusMemory";

describe("focus memory: back UP returns the focus where you left (spec 10, Н3а)", () => {
  beforeEach(clearFocusMemory);
  it("gives back what was focused when the screen was left, once", () => {
    const card = { id: "sarah" };
    rememberFocus("/clients", card);
    expect(takeFocus("/clients")).toBe(card);
    expect(takeFocus("/clients")).toBeUndefined();
  });
  it("each screen keeps its own", () => {
    rememberFocus("/clients", "card");
    rememberFocus("/client/c1", "job-row");
    expect(takeFocus("/client/c1")).toBe("job-row");
    expect(takeFocus("/clients")).toBe("card");
  });
  it("leaving with nothing focused forgets the old one; a screen never left has nothing", () => {
    rememberFocus("/clients", "card");
    rememberFocus("/clients", null);
    expect(takeFocus("/clients")).toBeUndefined();
    expect(takeFocus("/today")).toBeUndefined();
  });
});
