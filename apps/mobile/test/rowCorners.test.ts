// #2427 (founder 23.11, TestFlight: «с левой стороны нет закруглений на каждой позиции»): on a phone every folded line lies in its
// swipe (SwipeRow) whose opaque square ground covered the group card's corners — the left ones (the right ones are the «≡» column,
// outside the swipe). The web has no swipe, so e2e cannot see it (rule 27): the corners are proved here, and the guard below keeps the
// folded row clipped by them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { radius } from "@octo/design-tokens";
import { rowCorners, rowClip } from "../src/features/rowCorners";

const first = { backgroundColor: "#000", borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card };
const last = { backgroundColor: "#000", borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card };

describe("a group line's corners (#2427)", () => {
  it("the first line: the top corners of the card, the bottom ones square", () => {
    expect(rowCorners(first)).toEqual({ borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 });
  });
  it("the last line: the bottom corners", () => {
    expect(rowCorners(last)).toEqual({ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card });
  });
  it("a middle line: square (one card, rule 12)", () => {
    expect(rowCorners({ backgroundColor: "#000" })).toEqual({ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 });
  });
  it("no look (a section title): no corners of a group", () => {
    expect(rowCorners(undefined)).toBeUndefined();
  });
  it("the clip of a folded line cuts what lies inside (the swipe's ground, its buttons) by those corners", () => {
    const c = rowClip(first, false);
    expect(c).toMatchObject({ overflow: "hidden", borderTopLeftRadius: radius.card, borderBottomLeftRadius: 0 });
  });
  it("a section title (its look is only a top margin) is not clipped", () => {
    expect(rowClip({ marginTop: 12 }, false)).toBeUndefined();
  });
  it("an open line is not clipped (it has no swipe; its own content stays free)", () => {
    expect(rowClip(first, true)).toBeUndefined();
  });
});

describe("the sortable row draws the clip (#2427)", () => {
  const src = readFileSync(join(__dirname, "../src/features/SortableList.tsx"), "utf8");
  it("the row's inner view (around the swipe) takes rowClip — on a phone, and held: the carried row's corners", () => {
    expect(src).toMatch(/const clip = Platform\.OS === "web" \? undefined : rowClip\(look, open\)/);
    expect(src).toMatch(/<Animated\.View style=\{\[\{ flexDirection: "row", alignItems: "center" \}, lookInner, clip, clipStyle\]\}>/);
    expect(src).toMatch(/const r = mine && held\.value > 0\.5 \? radius\.inner : null;/);
  });
});
