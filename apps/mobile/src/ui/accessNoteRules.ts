/**
 * AccessNote's rules (BUILD-SPEC §1 «AccessNote»): how to get in — a gate code, a key box, «собака во дворе».
 * No note, no code and no pinned note — no block at all. A code not open yet (a tech sees it on the day of the visit and the day
 * before) is not drawn: the line says when it opens instead. What a screen reader hears — the label, the note, the code (spelled
 * out one by one, so «4471» is not read «four thousand…»), the pinned note.
 */
export interface AccessNoteParts {
  text?: string;
  code?: string;
  /** the code is held back: why («Код откроется в день выезда») */
  locked?: string;
  pinned?: string;
}

export function accessNoteShown(p: AccessNoteParts): boolean {
  return !!(p.text?.trim() || p.code?.trim() || p.locked?.trim() || p.pinned?.trim());
}

/** the code a screen reader spells: «# 4 4 7 1» — a digit at a time */
export function spelledCode(code: string): string {
  return code.trim().split("").filter((ch) => ch !== " ").join(" ");
}

export function accessNoteSaid(label: string, p: AccessNoteParts, codeWord: string): string {
  const code = p.locked ? p.locked : p.code?.trim() ? `${codeWord} ${spelledCode(p.code)}` : undefined;
  return [label, p.text?.trim(), code, p.pinned?.trim()].filter(Boolean).join(". ");
}
