/**
 * #1193 п.6 (review #1203 №3, #1227, #1231): «Отменить» takes back its own action, not the whole store. mutate kept the
 * whole snapshot from before the action and put it back — anything that happened in the 5 seconds since (a voided
 * invoice, another sheet's change, the server's fresh copy) went with it. Now the undo is a three-way merge:
 * prev (before the action), next (right after it), cur (now) → cur with the action's own changes taken back.
 *
 *   - a part nothing touched since the action (cur === next) → as it was before (prev);
 *   - a part the action did not touch (prev === next) → as it is now (cur);
 *   - lists of records with an id (clients, invoices, visits, checklist lines…) → by id: what the action added goes,
 *     what it removed comes back at its own place, what it changed is taken back by the same rule; what others added or
 *     changed stays;
 *   - plain objects → key by key, the same rule;
 *   - anything else changed since the action (a value, a list without ids) → the later change stays (a conflict: the
 *     later one wins — never a silent loss of what came after).
 *
 * A record the action removed that is there again now (the server's copy brought it back, maybe changed) — it stays as
 * it is now: the server's copy is the truer one. A record the action added that was changed since (the server gave it
 * its number) — it stays too: it is no longer only this action's.
 * Untouched parts keep their references (no copy), so a large store costs nothing. The DB is JSON (the phone keeps it
 * so): no Map, Set or Date in it. Pure: test/undoOwn.test.ts.
 */

type Rec = Record<string, unknown>;
const isObj = (x: unknown): x is Rec => typeof x === "object" && x !== null && !Array.isArray(x);
const idOf = (x: unknown): string | undefined => (isObj(x) && typeof x.id === "string" ? x.id : undefined);

/** every element an object with a string id, each id once */
function byIdList(xs: unknown[]): Map<string, unknown> | null {
  const m = new Map<string, unknown>();
  for (const x of xs) {
    const id = idOf(x);
    if (id === undefined || m.has(id)) return null;
    m.set(id, x);
  }
  return m;
}

function mergeLists(p: unknown[], n: unknown[], c: unknown[]): unknown[] {
  const pm = byIdList(p), nm = byIdList(n), cm = byIdList(c);
  // not lists of records by id: whole — the later change stays (top rule already took the plain cases)
  if (!pm || !nm || !cm) return c;
  let changed = false;
  const out: unknown[] = [];
  for (const x of c) {
    const id = idOf(x)!;
    // a record is the action's own only whole: added by it and untouched since — it goes; added and changed since, or
    // removed by it and back again — it stays as it is now; there before and after — taken back field by field
    const v = pm.has(id) && nm.has(id) ? undoOwn(pm.get(id), nm.get(id), x) : nm.has(id) && !pm.has(id) && Object.is(x, nm.get(id)) ? undefined : x;
    if (v !== x) changed = true;
    if (v !== undefined) out.push(v);
  }
  // what the action removed and nobody brought back: at its own place (after the nearest earlier record still there)
  p.forEach((x, i) => {
    const id = idOf(x)!;
    if (nm.has(id) || cm.has(id)) return;
    changed = true;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.findIndex((y) => idOf(y) === idOf(p[j]));
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    out.splice(at, 0, x);
  });
  return changed ? out : c;
}

function mergeObjects(p: Rec | undefined, n: Rec | undefined, c: Rec): Rec {
  let changed = false;
  const out: Rec = { ...c };
  const keys = new Set([...Object.keys(p ?? {}), ...Object.keys(n ?? {}), ...Object.keys(c)]);
  for (const k of keys) {
    const v = undoOwn(p?.[k], n?.[k], c[k]);
    if (Object.is(v, c[k])) continue;
    changed = true;
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return changed ? out : c;
}

/** cur with the action's own changes (prev → next) taken back */
export function undoOwn<T>(prev: T, next: T, cur: T): T;
export function undoOwn(prev: unknown, next: unknown, cur: unknown): unknown {
  if (Object.is(cur, next)) return prev;
  if (Object.is(prev, next)) return cur;
  if (Array.isArray(cur) && Array.isArray(next) && (Array.isArray(prev) || prev === undefined)) return mergeLists(prev ?? [], next, cur);
  if (isObj(cur) && isObj(next) && (isObj(prev) || prev === undefined)) return mergeObjects(prev, next, cur);
  // a value changed since the action (or a part the action made that someone changed): the later stays
  return cur;
}
