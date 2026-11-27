/**
 * The «?» of a sheet (DS Б1, Б7): the help is a page inside the same sheet, never a second sheet; «‹ Назад» brings the
 * content back as it was (its scroll), and on the help page «‹» / Esc go back to the content before anything else.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { helpBack, helpClosed, helpOpen, pageSwitch, sheetHeader } from "../src/ui/sheetHelp";
import { fadeMask, SCROLL_FADE, SCROLL_FADE_X } from "../src/ui/scrollFadeLogic";

const help = { body: "what it is" };

describe("sheet help page", () => {
  it("«?» opens the help inside: «Справка: <title>» (as the screen reader says), «‹» back to the content, no «?» on the help page", () => {
    const s = helpOpen(helpClosed, 0);
    expect(s.on).toBe(true);
    expect(sheetHeader(s, { title: "Позиции", hasBack: false, help }, "Справка")).toEqual({ title: "Справка: Позиции", back: "help", showHelp: false });
    expect(sheetHeader(s, { title: "Items", hasBack: false, help }, "Help").title).toBe("Help: Items");
    expect(sheetHeader(s, { title: "Позиции", hasBack: false, help: { ...help, title: "Что такое позиции" } }).title).toBe("Что такое позиции");
  });
  it("the content page: its own title, «?» shown, its own back only if the sheet has one", () => {
    expect(sheetHeader(helpClosed, { title: "Позиции", hasBack: false, help })).toEqual({ title: "Позиции", back: null, showHelp: true });
    expect(sheetHeader(helpClosed, { title: "Шаг 2", hasBack: true, help })).toEqual({ title: "Шаг 2", back: "page", showHelp: true });
    expect(sheetHeader(helpClosed, { title: "Шаг 2", hasBack: false })).toEqual({ title: "Шаг 2", back: null, showHelp: false });
  });
  it("on the help page the back goes to the content first, even when the sheet has a page of its own", () => {
    expect(sheetHeader(helpOpen(helpClosed, 0), { title: "Шаг 2", hasBack: true, help }).back).toBe("help");
  });
  it("back restores the content's scroll", () => {
    const s = helpOpen(helpClosed, 420);
    const r = helpBack(s);
    expect(r.state.on).toBe(false);
    expect(r.restore).toBe(420);
    expect(sheetHeader(r.state, { title: "Позиции", hasBack: false, help }).showHelp).toBe(true);
  });
  it("a second «?» while the help is open keeps the scroll it saved; back on the content does nothing", () => {
    const s = helpOpen(helpClosed, 300);
    expect(helpOpen(s, 0)).toBe(s);
    expect(helpBack(helpClosed)).toEqual({ state: helpClosed, restore: null });
    expect(helpOpen(helpClosed, -5).keep).toBe(0);
  });
  it("the way between the pages: in from the right, back from the left; the height never past the window's room", () => {
    expect(pageSwitch("in", 380, 600, 0, 120)).toEqual({ fromX: 380, fromH: 600, toH: 120 });
    expect(pageSwitch("back", 380, 120, 480, 1400)).toEqual({ fromX: -380, fromH: 120, toH: 600 });
    expect(pageSwitch("back", 380, 120, -5, 1400).toH).toBe(120);
  });
  it("the scroll's edge fades on the web, but the scroll bar's strip (the side inset, #1339) stays whole", () => {
    expect(fadeMask(false, false, 16)).toBeNull();
    const m = fadeMask(true, true, 16)!;
    expect(m.image).toMatch(new RegExp(`#000 ${SCROLL_FADE}px.*calc\\(100% - ${SCROLL_FADE}px\\).*, linear-gradient\\(#000, #000\\)$`));
    expect(m.size).toBe("100% 100%, 16px 100%");
    expect(m.position).toBe("0 0, 100% 0");
    expect(fadeMask(false, true, 0)!.image).toMatch(/#000 0px/);
  });
  it("a row that scrolls sideways fades at its left / right by tab.fadeW, never keeps a scroll bar strip (#3080, design-review #3066 №11)", () => {
    expect(fadeMask(false, false, 0, true)).toBeNull();
    const m = fadeMask(true, true, 16, true)!;
    expect(m.image).toBe(`linear-gradient(to right, transparent 0, #000 ${SCROLL_FADE_X}px, #000 calc(100% - ${SCROLL_FADE_X}px), transparent 100%)`);
    expect(m.size).toBe("100% 100%");
    expect(fadeMask(false, true, 0, true)!.image).toMatch(/^linear-gradient\(to right, transparent 0, #000 0px/);
  });
  it("the fade keeps only its two flags as state: a scroll frame that changes nothing renders nothing", () => {
    const src = readFileSync(join(__dirname, "../src/ui/scrollFade.tsx"), "utf8");
    expect(src.match(/useState\(/g)?.length).toBe(1);
    expect(src).toMatch(/s\.top === e\.left && s\.bottom === e\.right \? s :/);
  });
  it("the Sheet keeps the content mounted under the help page and never opens a second sheet for it", () => {
    const src = readFileSync(join(__dirname, "../src/ui/overlays.tsx"), "utf8");
    const sheet = src.slice(src.indexOf("export function Sheet("), src.indexOf("export type SheetHelp"));
    expect(sheet).toMatch(/display: helpPage\.on \? "none" : "flex"/);
    expect(sheet).not.toMatch(/<Sheet\b/);
    expect(sheet).not.toMatch(/<HelpButton\b/);
  });
});
