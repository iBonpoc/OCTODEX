/**
 * «Обновить» (#1912) and the canvas: every finished edit is written at once, but three moments are not safe for a reload — a finger is down
 * (a stroke is being drawn), a write is on its way, a write failed and waits to be tried again. While any of them lasts the canvas counts as
 * a sheet with unsaved work (ui/dirtySheets.ts): the update asks it to write now and waits until it is on the phone; it never reloads before.
 */
export type CanvasState = {
  /** a finger is on the canvas */
  touching: boolean;
  /** a write was scheduled or sent and has not ended well yet (including a failed one) */
  unsent: boolean;
};

export const canvasUnsaved = (s: CanvasState): boolean => s.touching || s.unsent;

/** how a finished write moves `unsent`: written / nothing to write — safe; failed — still unsent (it is tried again) */
export const unsentAfter = (r: "saved" | "nothing" | "failed"): boolean => r === "failed";
