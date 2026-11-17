/**
 * The «?» of a sheet (DS Б1, Б7): the help opens as a PAGE inside the same sheet — never a second sheet (nested sheets
 * are forbidden). The content stays mounted underneath (its state is kept); the place it was scrolled to is kept here and
 * given back on «‹ Назад». Without React, so the rules are tested (test/sheetHelp.test.ts).
 */
export type HelpPage = { on: boolean; keep: number };

export const helpClosed: HelpPage = { on: false, keep: 0 };

/** «?»: the help page, the content's scroll kept */
export function helpOpen(s: HelpPage, scrolled: number): HelpPage {
  return s.on ? s : { on: true, keep: Math.max(0, scrolled) };
}

/** «‹ Назад» on the help page: back to the content; `restore` — where its scroll goes back to */
export function helpBack(s: HelpPage): { state: HelpPage; restore: number | null } {
  return s.on ? { state: { on: false, keep: s.keep }, restore: s.keep } : { state: s, restore: null };
}

/** the help's title: its own, else «Справка: <sheet title>» — the same words the screen reader says for «?» */
export function helpTitle(title: string | undefined, help: { title?: string }, helpWord: string): string {
  return help.title ?? (title ? `${helpWord}: ${title}` : helpWord);
}

/**
 * The help page's way in and out (DS Б1): it slides in from the right, the content comes back from the left, over `durBase`;
 * the body's height goes from what it was to what the new page needs, never past the room the window has (`room` — how much
 * more the window may grow). Reduced motion: no slide, the height is at once.
 */
export function pageSwitch(dir: "in" | "back", width: number, bodyH: number, room: number, contentH: number): { fromX: number; fromH: number; toH: number } {
  return { fromX: dir === "in" ? width : -width, fromH: bodyH, toH: Math.min(contentH, bodyH + Math.max(0, room)) };
}

/**
 * What the header shows and what «‹» / Esc / Android «Назад» does: on the help page — the help's title and back to the
 * content (first, before the sheet's own page or a close); else the sheet's own title and its own `onBack`, if any.
 */
export function sheetHeader(
  s: HelpPage,
  sheet: { title?: string; hasBack: boolean; help?: { title?: string; body?: unknown } },
  helpWord = "Справка",
): { title: string; back: "help" | "page" | null; showHelp: boolean } {
  if (s.on && sheet.help) return { title: helpTitle(sheet.title, sheet.help, helpWord), back: "help", showHelp: false };
  return { title: sheet.title ?? "", back: sheet.hasBack ? "page" : null, showHelp: !!sheet.help };
}
