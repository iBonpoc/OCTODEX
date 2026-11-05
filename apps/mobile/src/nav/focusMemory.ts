/**
 * Where the keyboard focus was when a screen was left (spec 10, 1.7, Н3а).
 * Going back UP to that screen puts the focus back there — like the browser's back button or closing a dialog
 * (WCAG 2.4.3). Plain map, no React: Screen saves on blur and takes on focus. Web only (the caller checks).
 */
const saved = new Map<string, unknown>();

/** remember the focused element of the screen at `path` as it is left */
export function rememberFocus(path: string, el: unknown) {
  if (el) saved.set(path, el);
  else saved.delete(path);
}

/** the element to restore on coming back to `path`; given once */
export function takeFocus(path: string): unknown {
  const el = saved.get(path);
  saved.delete(path);
  return el;
}

/** for tests */
export function clearFocusMemory() {
  saved.clear();
}
