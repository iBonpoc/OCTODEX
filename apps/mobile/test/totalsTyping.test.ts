import { describe, expect, it } from "vitest";
import { totalWhileTyping } from "../src/features/estimate/totalsModes";

/** #2455: the total stays in sight while a totals field is typed in and the keyboard hides the pinned bar */
describe("totalWhileTyping — where «Итого» shows over the keyboard", () => {
  const base = { typing: "deposit" as const, row: "deposit" as const, keyboard: true };
  it("iOS: in the keyboard's own bar", () => expect(totalWhileTyping({ ...base, os: "ios" })).toBe("bar"));
  it("web and Android: a line under the row being typed in", () => {
    expect(totalWhileTyping({ ...base, os: "web" })).toBe("note");
    expect(totalWhileTyping({ ...base, os: "android" })).toBe("note");
  });
  it("only under the row that is typed in", () => {
    expect(totalWhileTyping({ ...base, row: "discount", os: "web" })).toBeNull();
    expect(totalWhileTyping({ ...base, typing: null, os: "web" })).toBeNull();
  });
  it("no keyboard: the pinned bar shows the total itself — nothing is added", () => {
    expect(totalWhileTyping({ ...base, keyboard: false, os: "web" })).toBeNull();
    expect(totalWhileTyping({ ...base, keyboard: false, os: "ios" })).toBeNull();
  });
});
