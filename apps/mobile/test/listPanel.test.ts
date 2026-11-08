import { describe, expect, it } from "vitest";
import { neighbor, panelId, panelKey } from "@/nav/listPanelRule";

// the open card beside the list on 1280 (spec 06 «Панель 1280»)
describe("listPanel", () => {
  const ids = ["a", "b", "c"];
  it("↑/↓ go to the neighbour and stop at the ends", () => {
    expect(neighbor(ids, "b", 1)).toBe("c");
    expect(neighbor(ids, "b", -1)).toBe("a");
    expect(neighbor(ids, "c", 1)).toBe("c");
    expect(neighbor(ids, "a", -1)).toBe("a");
  });
  it("a card not in the list (filtered out) → the first; an empty list → nothing", () => {
    expect(neighbor(ids, "x", 1)).toBe("a");
    expect(neighbor(ids, undefined, -1)).toBe("a");
    expect(neighbor([], "a", 1)).toBeUndefined();
  });
  it("the panel only on the desktop and only for a card this person may open (also one the filter hides)", () => {
    const known = (id: string) => ["a", "b", "c", "hidden"].includes(id);
    expect(panelId("b", true, known)).toBe("b");
    expect(panelId("b", false, known)).toBeUndefined();
    expect(panelId("hidden", true, known)).toBe("hidden");
    expect(panelId("x", true, known)).toBeUndefined();
    expect(panelId(["c", "a"], true, known)).toBe("c");
    expect(panelId(undefined, true, known)).toBeUndefined();
  });
  it("keys: ↑ ↓ Esc; nothing while typing, under a sheet or with a modifier", () => {
    const free = { typing: false, modal: false, onList: true };
    expect(panelKey({ key: "ArrowDown" }, free)).toBe("down");
    expect(panelKey({ key: "ArrowUp" }, free)).toBe("up");
    expect(panelKey({ key: "Escape" }, free)).toBe("close");
    expect(panelKey({ key: "Enter" }, free)).toBeUndefined();
    expect(panelKey({ key: "ArrowDown" }, { typing: true, modal: false, onList: true })).toBeUndefined();
    expect(panelKey({ key: "Escape" }, { typing: false, modal: true, onList: true })).toBeUndefined();
    expect(panelKey({ key: "ArrowDown", shiftKey: true }, free)).toBeUndefined();
    expect(panelKey({ key: "Escape", defaultPrevented: true }, free)).toBeUndefined();
    // ↑/↓ only from the rows (not the panel's scroll, the filter lane, the menu); Esc anywhere, not on a held key
    const off = { typing: false, modal: false, onList: false };
    expect(panelKey({ key: "ArrowDown" }, off)).toBeUndefined();
    expect(panelKey({ key: "Escape" }, off)).toBe("close");
    expect(panelKey({ key: "Escape", repeat: true }, free)).toBeUndefined();
  });
});
