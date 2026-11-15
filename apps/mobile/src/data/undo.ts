/**
 * #1261 (the director's 4th review of #1244): «Отменить» is all or nothing, and the types hold it. A GuardedUndo carries a
 * brand only the store gives (mutate, undoTogether — store.tsx) and this file (NO_UNDO, withAfter): the toast takes only
 * it, so a screen's own wrapper `() => { a(); b(); }` — a silent half undo when one part is refused — does not compile.
 * Several actions taken back as one go through store.undoTogether (a module: its own helper over it).
 *
 * The result: true — taken back; false — too late, nothing changed (the toast says so); undefined — nothing to take back
 * (the server dropped it, or the action did nothing): the toast just closes.
 *
 * Не обходить приведением (as never / any, Object.assign с NO_UNDO, помощник с u: any): ревью отклонит.
 */
declare const undoBrand: unique symbol;
export type GuardedUndo = (() => boolean | undefined) & { readonly [undoBrand]: true };

/** every undo the store made, and for its reverse steps (no plan: a job line, a tag) how to ask whether it would go back on
 *  a given state — undoTogether asks on the state after its other parts (the director's review of #1279 №3) */
const marked = new WeakMap<object, ((value: unknown) => boolean) | null>();
/**
 * The store's own (store.tsx): an undo made by mutate, undoTogether or a reverse step. Nothing else marks one —
 * test/undoBrand.test.ts. Once it went back (true) it is done: a second call is too late (false), so a reverse step run
 * inside undoTogether never runs again on its own toast. `ready` — would it go back on that state (a job line under a sent
 * invoice would not); a done one never is.
 */
export const markUndo = (f: () => boolean | undefined, ready?: (value: unknown) => boolean): GuardedUndo => {
  let done = false;
  const g = () => {
    if (done) return false;
    const r = f();
    if (r === true) done = true;
    return r;
  };
  marked.set(g, (v: unknown) => !done && (ready ? ready(v) : true));
  return g as GuardedUndo;
};
/** made by the store (and how to ask it), or not — a screen's own function */
export const markOf = (f: unknown): { ready: (value: unknown) => boolean } | null => {
  const r = typeof f === "function" ? marked.get(f) : undefined;
  return r ? { ready: r } : null;
};

/** the brand only — for the wrappers below, which are the toast's last step (never a part of undoTogether: there they run
 *  after its parts, as a screen's own function) */
const brand = (f: () => boolean | undefined): GuardedUndo => f as GuardedUndo;

/** nothing to take back (an action that did nothing, a refused one): the toast just closes */
export const NO_UNDO: GuardedUndo = brand(() => undefined);

/**
 * A screen's own step after its undo, only when it went back (true): leave the screen, free a «pressed» mark, untie lines
 * from items. Never another undo in `after` — several go through undoTogether.
 */
export function withAfter(undo: GuardedUndo, after: () => void): GuardedUndo {
  return brand(() => {
    const r = undo();
    if (r === true) after();
    return r;
  });
}

/** a screen's own state only (a snoozed card, a line of a form not saved yet, a run the server undoes itself): no store
 *  action in it — those go through the store's own undo (test/undoBrand.test.ts reads every use) */
export const localUndo = (f: (() => void) & { readonly [undoBrand]?: never }): GuardedUndo =>
  brand(() => {
    f();
    return true;
  });

/** too late (false): the screen says it its own way (the toast does not add «Уже не отменить») */
export function whenLate(undo: GuardedUndo, late: () => void): GuardedUndo {
  return brand(() => {
    const r = undo();
    if (r !== false) return r;
    late();
    return undefined;
  });
}

/** always too late — the design system's showcase of «Уже не отменить» (Notices.tsx) */
export const TOO_LATE: GuardedUndo = brand(() => false);

/** `first` (all or nothing) too late — `fallback` instead: a smaller step that leaves a correct state on its own (the
 *  supplier screen: the save already sent → only «Применить» goes back, applyTaxUndo) */
export function orElse(first: GuardedUndo, fallback: GuardedUndo): GuardedUndo {
  return brand(() => {
    const r = first();
    return r === false ? fallback() : r;
  });
}
