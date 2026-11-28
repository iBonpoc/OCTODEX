import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #3154 (founder, build 3144, iPhone): «⋯ → Подписать здесь» on an estimate — a finger on the signature field scrolled the whole
 * screen, nothing could be signed. The pad locks the page through `useScrollLock()` (ScrollLockCtx), but the Screen gave that
 * context only to its `content`: a screen with sticky tabs (the estimate's «Документ · Подпись», every ObjectScreen with sections)
 * draws the open tab as `below`, OUTSIDE the provider — there `useScrollLock()` is the default no-op and the ScrollView keeps
 * `scrollEnabled`. Rule: the content and `below` each stand inside a ScrollLockCtx.Provider; the ScrollView's children keep their
 * order (the sticky tabs are child 1 — `stickyHeaderIndices`), so `below` gets a provider of its own, not one around everything.
 */
const src = readFileSync(join(__dirname, "..", "src", "ui", "surfaces.tsx"), "utf8");
const OPEN = "<ScrollLockCtx.Provider value={setScrollLocked}>";
const CLOSE = "</ScrollLockCtx.Provider>";
const scopes = (() => {
  const out: [number, number][] = [];
  for (let i = src.indexOf(OPEN); i > -1; i = src.indexOf(OPEN, i + 1)) out.push([i, src.indexOf(CLOSE, i)]);
  return out;
})();
const inside = (needle: string) => {
  const at = src.indexOf(needle);
  return at > -1 && scopes.some(([a, b]) => at > a && at < b);
};

describe("the scroll lock reaches every part of the screen's scroll (#3154)", () => {
  it("the screen's own content is inside a provider", () => expect(inside("<ScreenScrollCtx.Provider value={screenScroll}>{content}")).toBe(true));
  it("the tab's content (`below`) is inside a provider — a signature on a tabbed screen can stop the page", () =>
    expect(inside("{below}</View>"), "`{below}` must stand inside <ScrollLockCtx.Provider value={setScrollLocked}>").toBe(true));
  it("the sticky tabs stay the ScrollView's child 1 (no provider wraps the content and the tabs together)", () => {
    expect(src).toContain("stickyHeaderIndices={tabs ? [1] : undefined}");
    const [first] = scopes;
    expect(first).toBeDefined();
    // the first provider closes before the tabs' strip starts
    expect(first![1]).toBeLessThan(src.indexOf("{tabs ? (", first![0]));
  });
});
