import { useSyncExternalStore } from "react";

/**
 * Sheets that are going out (DS Б1, #1163). On iOS a sheet opened while another one's Modal is still on its way out never
 * shows, and the invisible layer takes every touch (#743) — so a sheet the owner opens in the same moment (a chain:
 * «Следующий шаг» → the next sheet) waits until the one before it has really gone: the Modal's `onDismiss` (a timer is the
 * net, as in menuPick.ts). Web and Android do not need it (a test turns it on: `globalThis.__octoSheetGate = true`).
 *
 * The order of reading matters (the chain is «in the same beat»): a sheet that wants to open first *arms* itself after
 * the beat's effects have run — by then the sheet that closed has registered that it is leaving. One at a time: of
 * several waiting, the earliest opens first.
 */
let leaving = 0;
const waiting: number[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const sheetGate = {
  /** is the gate on: iOS, or a test */
  on(): boolean {
    return typeof (globalThis as { __octoSheetGate?: boolean }).__octoSheetGate === "boolean"
      ? !!(globalThis as { __octoSheetGate?: boolean }).__octoSheetGate
      : IS_IOS;
  },
  /** a sheet starts to go out */
  enter() {
    leaving++;
    emit();
  },
  /** a sheet has gone (its Modal is dismissed), or was unmounted on the way */
  leave() {
    leaving = Math.max(0, leaving - 1);
    emit();
  },
  /** a sheet wants to open: its place in the queue */
  queue(): number {
    const id = nextId++;
    waiting.push(id);
    emit();
    return id;
  },
  /** it opened, or its owner took the wish back */
  unqueue(id: number) {
    const i = waiting.indexOf(id);
    if (i >= 0) waiting.splice(i, 1);
    emit();
  },
  count: () => leaving,
  /** the version of the state, for useSyncExternalStore */
  version: () => leaving * 1000 + waiting.length * 7 + (waiting[0] ?? 0),
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  first: () => waiting[0] ?? 0,
  reset() {
    leaving = 0;
    waiting.length = 0;
    emit();
  },
};

// set by the module that knows the platform (react-native is not imported here: the unit tests run without it)
let IS_IOS = false;
export const setGatePlatform = (ios: boolean) => {
  IS_IOS = ios;
};

/** re-render on every change of the gate */
export const useSheetGate = () => useSyncExternalStore(sheetGate.subscribe, sheetGate.version, sheetGate.version);

/**
 * Whether a sheet that wants to open may show now: the gate is off, or nothing is going out (but itself) and it is first
 * in the queue.
 */
export function sheetMayShow(o: { gate: boolean; leavingAll: number; selfLeaving: boolean; first: boolean }): boolean {
  if (!o.gate) return true;
  return o.leavingAll - (o.selfLeaving ? 1 : 0) <= 0 && o.first;
}
