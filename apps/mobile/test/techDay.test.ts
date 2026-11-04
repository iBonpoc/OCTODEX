import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { techDay } from "../src/features/techDay";
import type { DB, Visit } from "../src/data/types";

const NOW = new Date(2026, 10, 4, 13, 0);
const at = (h: number, d = 4) => new Date(2026, 10, d, h, 0).toISOString();

function db(): DB {
  const d = makeSeed();
  const base = d.visits[0]!;
  const v = (id: string, start: string, step: Visit["step"], extra: Partial<Visit> = {}): Visit => ({
    ...base, id, techId: "t1", start, step, checklist: [], photos: [], payment: undefined, ...extra,
  });
  return {
    ...d,
    visits: [
      v("a", at(8), "paid", { payment: { method: "cash", amountCents: 420_00, at: at(10) }, photos: [{ id: "p1", kind: "before" }, { id: "p2", kind: "after" }] }),
      v("b", at(11), "signed"),
      v("c", at(14), "scheduled", { checklist: [{ id: "x", label: "A", done: false }, { id: "y", label: "B", done: true }] }),
      v("d", at(16), "scheduled"),
      v("e", at(9, 3), "paid", { payment: { method: "card", amountCents: 999_00, at: at(9, 3) } }), // yesterday
      v("f", at(12), "working", { techId: "t2" }), // other tech
    ],
  };
}

describe("technician day", () => {
  const d = techDay(db(), "t1", NOW);
  it("only my visits today, in time order", () => {
    expect(d.visits.map((v) => v.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("progress, current and next", () => {
    expect(d.done).toBe(1);
    expect(d.awaitingPay).toBe(1);
    expect(d.current?.id).toBe("b");
    expect(d.next?.id).toBe("c");
  });
  it("money collected today only (not yesterday, not other techs)", () => {
    expect(d.collectedCents).toBe(420_00);
  });
  it("checklist items left and photos", () => {
    expect(d.checksLeft).toBe(1);
    expect(d.photos).toBe(2);
  });
  it("empty day", () => {
    const e = techDay(db(), "nobody", NOW);
    expect(e).toMatchObject({ done: 0, collectedCents: 0, current: undefined, next: undefined });
  });
});
