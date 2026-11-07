/**
 * A tiny stand-in for React's hooks, enough to run one component's hooks and effects in node (vitest has no DOM and the
 * project has no renderer): `vi.mock("react", () => import("./support/miniReact"))`. One root renders one function
 * component; state updates re-render on a microtask; effects run after each render when their deps changed.
 * Used by test/persistHook.test.ts and test/storeSync.test.ts (review #231: test the hook and the provider themselves).
 */
type Deps = readonly unknown[] | undefined;
interface EffectSlot {
  deps: Deps;
  cleanup?: (() => void) | void;
}
const changed = (a: Deps, b: Deps) => !a || !b || a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]));

export class Root<P> {
  hooks: unknown[] = [];
  i = 0;
  out: unknown;
  private pending: { slot: EffectSlot; fn: () => (() => void) | void }[] = [];
  private scheduled = false;
  private dead = false;
  constructor(private comp: (p: P) => unknown, public props: P) {}
  render() {
    if (this.dead) return;
    current = this as unknown as Root<unknown>;
    this.i = 0;
    this.pending = [];
    try {
      this.out = this.comp(this.props);
    } finally {
      current = null;
    }
    const run = this.pending;
    this.pending = [];
    for (const e of run) {
      if (typeof e.slot.cleanup === "function") e.slot.cleanup();
      e.slot.cleanup = e.fn();
    }
  }
  schedule() {
    if (this.scheduled || this.dead) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.render();
    });
  }
  rerender(props: P) {
    this.props = props;
    this.render();
  }
  unmount() {
    this.dead = true;
    for (const h of this.hooks) if (h && typeof (h as EffectSlot).cleanup === "function") (h as EffectSlot).cleanup!();
  }
  effect(fn: () => (() => void) | void, deps: Deps) {
    const i = this.i++;
    const slot = (this.hooks[i] as EffectSlot | undefined) ?? (this.hooks[i] = { deps: undefined, cleanup: undefined } as EffectSlot);
    const first = !(slot as EffectSlot & { ran?: boolean }).ran;
    if (first || changed(slot.deps, deps)) {
      (slot as EffectSlot & { ran?: boolean }).ran = true;
      slot.deps = deps;
      this.pending.push({ slot, fn });
    }
  }
}
let current: Root<unknown> | null = null;
const root = () => {
  if (!current) throw new Error("hook outside a render");
  return current;
};

export function render<P>(comp: (p: P) => unknown, props: P): Root<P> {
  const r = new Root(comp, props);
  r.render();
  return r;
}
/** let microtasks, timers at 0 and resolved promises run */
export async function settle(rounds = 25) {
  for (let k = 0; k < rounds; k++) await new Promise((r) => setTimeout(r, 0));
}

export function useState<T>(init: T | (() => T)): [T, (n: T | ((p: T) => T)) => void] {
  const r = root();
  const i = r.i++;
  type H = { v: T; q: (T | ((p: T) => T))[]; set?: (n: T | ((p: T) => T)) => void };
  if (r.hooks[i] === undefined) {
    const h = { v: typeof init === "function" ? (init as () => T)() : init, q: [] } as H;
    // like React: an update is queued and applied at the next render, in order — a functional update sees the
    // updates queued before it, never runs at the moment of the call (code that reads a ref right after
    // setState(fn) must not be tested as if fn had already run — review #244 №5)
    h.set = (n) => {
      h.q.push(n);
      r.schedule();
    };
    r.hooks[i] = h;
  }
  const h = r.hooks[i] as H;
  for (const n of h.q.splice(0)) h.v = typeof n === "function" ? (n as (p: T) => T)(h.v) : n;
  return [h.v, h.set!];
}
export function useRef<T>(init: T): { current: T } {
  const r = root();
  const i = r.i++;
  if (r.hooks[i] === undefined) r.hooks[i] = { current: init };
  return r.hooks[i] as { current: T };
}
export function useMemo<T>(fn: () => T, deps: Deps): T {
  const r = root();
  const i = r.i++;
  const h = r.hooks[i] as { v: T; deps: Deps } | undefined;
  if (!h || changed(h.deps, deps)) {
    r.hooks[i] = { v: fn(), deps };
  }
  return (r.hooks[i] as { v: T }).v;
}
export const useCallback = <T>(fn: T, deps: Deps): T => useMemo(() => fn, deps);
export const useEffect = (fn: () => (() => void) | void, deps?: Deps) => root().effect(fn, deps);
export const useLayoutEffect = useEffect;
export interface Ctx<T> {
  _value: T;
  Provider: string;
}
export const createContext = <T>(v: T): Ctx<T> => ({ _value: v, Provider: "Provider" });
export const useContext = <T>(c: Ctx<T>): T => c._value;
export const Fragment = "Fragment";
export const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
export const jsxs = jsx;
export const jsxDEV = jsx;
export const createElement = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => ({ type, props: { ...props, children } });
export default { useState, useRef, useMemo, useCallback, useEffect, useLayoutEffect, createContext, useContext, Fragment, createElement };
