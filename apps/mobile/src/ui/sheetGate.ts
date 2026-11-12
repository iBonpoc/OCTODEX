import { useSyncExternalStore } from "react";

/**
 * Sheets that are going out (DS Б1, #1163). On iOS a sheet opened while another one's Modal is still on its way out never
 * shows, and the invisible layer takes every touch (#743) — so a sheet the owner opens in the same moment (a chain:
 * «Следующий шаг» → the next sheet) waits until the one before it has really left. Web and Android do not need it.
 */
let leaving = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const sheetGate = {
  /** a sheet starts to go out */
  enter() {
    leaving++;
    emit();
  },
  /** a sheet has left (or was unmounted on the way) */
  leave() {
    leaving = Math.max(0, leaving - 1);
    emit();
  },
  count: () => leaving,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  reset() {
    leaving = 0;
    emit();
  },
};

/** how many sheets are going out right now */
export const useSheetsLeaving = () => useSyncExternalStore(sheetGate.subscribe, sheetGate.count, sheetGate.count);

/**
 * Whether a sheet the owner wants open is shown now: it waits for the sheets that are leaving (not for itself — one that
 * comes back while it is still going out is the same sheet).
 */
export function sheetMayShow(o: { gate: boolean; leavingAll: number; selfLeaving: boolean }): boolean {
  if (!o.gate) return true;
  return o.leavingAll - (o.selfLeaving ? 1 : 0) <= 0;
}
