/** The pure part of the required-fields form (DS §11 п.3–4): tested without a screen. The hook is ui/requiredForm.tsx. */

export interface Problem {
  /** the field's id — as in `form.field(id)` and in the registry (`features/requiredFields.ts`) */
  id: string;
  /** what to enter: the text under the field */
  text: string;
}
export type Check = (v: string) => string | undefined;

/** the scroll goes to the first wrong field, in the order the form gives */
export function firstProblem(problems: Problem[]): Problem | undefined {
  return problems[0];
}

/** the errors under ALL wrong fields (not only the first) */
export function errorsOf(problems: Problem[]): Record<string, string> {
  return Object.fromEntries(problems.map((p) => [p.id, p.text]));
}

/** the person edits a field: its error goes, or stays with the right text while the value is still wrong (`check`) */
export function afterEdit(errors: Record<string, string>, id: string, v: string, check?: Check): Record<string, string> {
  if (!(id in errors)) return errors;
  const text = check?.(v);
  if (text === undefined) {
    const { [id]: _gone, ...rest } = errors;
    return rest;
  }
  return errors[id] === text ? errors : { ...errors, [id]: text };
}

/** the person leaves a field: a filled but wrong value shows its error at once (DS §11 п.1); an empty one waits for the button */
export function afterBlur(errors: Record<string, string>, id: string, v: string, check?: Check): Record<string, string> {
  if (!check || v.trim() === "") return errors;
  const text = check(v);
  if (text === undefined) return afterEdit(errors, id, v, check);
  return errors[id] === text ? errors : { ...errors, [id]: text };
}

/**
 * Where the screen's scroll goes so a field stands `margin` below what covers the content's top (the status bar and the
 * header: `covered`; on a phone with a notch 47–59 and more). `nodeY` / `viewY` — the field's and the scroll view's top in the window.
 */
export function scrollTargetY(a: { offset: number; nodeY: number; viewY: number; covered: number; margin: number }): number {
  return Math.max(0, a.offset + (a.nodeY - a.viewY) - a.covered - a.margin);
}
