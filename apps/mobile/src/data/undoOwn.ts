/**
 * #1193 п.6 (review #1203 №3, #1227, #1231; the director's review of #1244): «Отменить» takes back its own action, not
 * the whole store. mutate kept the whole snapshot from before the action and put it back — anything that happened in the
 * 5 seconds since (a voided invoice, another sheet's change, the server's fresh copy) went with it.
 *
 * Now the undo is a three-way merge of prev (before the action), next (right after it) and cur (now), and it is ALL OR
 * NOTHING: either every part of the action's own change is taken back, or nothing is (`ok: false` — the store keeps its
 * op in the queue and the toast says it is too late). Never a half undo: an invoice paid by two payments where only the
 * first is taken back would keep the second's paid amount and date (review Б2) — money that no longer adds up.
 *
 *   - «untouched since» is compared by VALUE, not by reference: the store's copy is normalized again on every render
 *     (normalizeDB rebuilds every estimate with a document, the demo's jobs and clients), so a reference says nothing;
 *   - a part nothing changed since the action → as it was before (prev); a part the action did not change → as now;
 *   - lists of records with an id → by id: what the action added goes (unchanged since), what it removed comes back at
 *     its own place, what it changed is taken back by the same rule, others' records stay; the action's own reorder is
 *     taken back when the order was not changed since;
 *   - plain objects → key by key, the same rule;
 *   - anything else the action changed and something changed after it — a value, a list without ids, a record the
 *     action added or removed that is now different (the server numbered it, brought it back) — a conflict: nothing is
 *     taken back.
 * The DB is JSON (the phone keeps it so): no Map, Set or Date in it. Pure: test/undoOwn.test.ts.
 */

type Rec = Record<string, unknown>;
const isObj = (x: unknown): x is Rec => typeof x === "object" && x !== null && !Array.isArray(x);
const idOf = (x: unknown): string | undefined => (isObj(x) && typeof x.id === "string" ? x.id : undefined);

class Conflict extends Error {}

/** the same value (JSON): references first, then structure */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameValue(a[i], b[i])) return false;
    return true;
  }
  if (isObj(a)) {
    if (!isObj(b)) return false;
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!sameValue(a[k], b[k])) return false;
    return true;
  }
  return false;
}

/** every element an object with a string id, each id once; else null */
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
  // not records by id (values, strings, a repeated id) and changed since: whole or nothing — a conflict
  if (!pm || !nm || !cm) throw new Conflict();
  const values = new Map<string, unknown>();
  for (const [id, x] of cm) {
    if (pm.has(id) && nm.has(id)) {
      const v = merge(pm.get(id), nm.get(id), x);
      if (v !== undefined) values.set(id, v);
    } else if (nm.has(id)) {
      // added by the action: goes when unchanged since, else it is no longer only this action's
      if (!sameValue(x, nm.get(id))) throw new Conflict();
    } else if (pm.has(id)) {
      // removed by the action and back again (the server's copy): a conflict
      throw new Conflict();
    } else values.set(id, x); // someone else's
  }
  for (const [id, x] of pm) {
    if (cm.has(id)) continue;
    if (!nm.has(id)) values.set(id, x); // removed by the action, nobody brought it back: it comes back
    else if (!sameValue(x, nm.get(id))) throw new Conflict(); // changed by the action, removed since: cannot take back
  }
  // the order: the action's own reorder of the records it kept is taken back when nobody reordered them since
  const common = (xs: unknown[]) => xs.map(idOf).filter((id): id is string => !!id && pm.has(id) && nm.has(id) && cm.has(id));
  const pOrder = common(p), nOrder = common(n), cOrder = common(c);
  const reordered = !sameValue(pOrder, nOrder);
  if (reordered && !sameValue(cOrder, nOrder)) throw new Conflict();
  // build: cur's order (or prev's, when the action's reorder is taken back); a record that comes back after the nearest
  // earlier record of prev still there
  const base = reordered ? p.map(idOf).filter((id): id is string => !!id && values.has(id) && cm.has(id)) : c.map(idOf).filter((id): id is string => !!id && values.has(id));
  const out: string[] = [...base];
  const at = new Map(out.map((id, i) => [id, i]));
  if (reordered) {
    // others' records (not in prev) keep their place after the record they follow in cur
    c.forEach((x, i) => {
      const id = idOf(x)!;
      if (pm.has(id) || !values.has(id) || at.has(id)) return;
      const before = i > 0 ? idOf(c[i - 1]) : undefined;
      const k = before !== undefined && at.has(before) ? at.get(before)! + 1 : 0;
      out.splice(k, 0, id);
      out.forEach((y, j) => at.set(y, j));
    });
  }
  p.forEach((x, i) => {
    const id = idOf(x)!;
    if (at.has(id) || !values.has(id)) return;
    let k = 0;
    for (let j = i - 1; j >= 0; j--) {
      const q = at.get(idOf(p[j])!);
      if (q !== undefined) {
        k = q + 1;
        break;
      }
    }
    out.splice(k, 0, id);
    out.forEach((y, j) => at.set(y, j));
  });
  const res = out.map((id) => values.get(id));
  return res.length === c.length && res.every((x, i) => x === c[i]) ? c : res;
}

function mergeObjects(p: Rec | undefined, n: Rec, c: Rec): Rec {
  let out: Rec | null = null;
  const keys = new Set([...Object.keys(p ?? {}), ...Object.keys(n), ...Object.keys(c)]);
  for (const k of keys) {
    const v = merge(p?.[k], n[k], c[k]);
    if (Object.is(v, c[k])) continue;
    out ??= { ...c };
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out ?? c;
}

function merge(p: unknown, n: unknown, c: unknown): unknown {
  // the action did not touch it (the same reference): as it is now — no compare, no copy
  if (Object.is(p, n)) return c;
  if (sameValue(c, n)) return p;
  if (sameValue(p, n)) return c;
  if (Array.isArray(c) && Array.isArray(n) && (Array.isArray(p) || p === undefined)) return mergeLists(p ?? [], n, c);
  if (isObj(c) && isObj(n) && (isObj(p) || p === undefined)) return mergeObjects(p as Rec | undefined, n, c);
  // a value the action changed and something changed after it
  throw new Conflict();
}

/** cur with the action's own changes (prev → next) taken back — all of them, or `ok: false` and nothing */
export function undoOwn<T>(prev: T, next: T, cur: T): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: merge(prev, next, cur) as T };
  } catch (e) {
    if (e instanceof Conflict) return { ok: false };
    throw e;
  }
}
