/**
 * Money scenarios: an independent integer reference (BigInt, round half up) checked against the engine on
 * fixed scenarios and thousands of seeded random estimates; contract → invoices → partial payments invariants.
 */
import { describe, it, expect } from "vitest";
import {
  acceptPayment, catalogCost, catalogPrice, computeCustomOption, contractStatement, depositAmount, progressAmount,
  DEFAULT_TAX, LINE_GROUPS, type CustomLine, type CustomSettings, type LineGroup,
} from "../src/index.js";

/* ---------- reference (integer math only) ---------- */
const half = (num: bigint, den: bigint): bigint => (num * 2n + den) / (2n * den); // round half up, num ≥ 0
const QS = 10000n; // qty scale (4 decimals)
const qtyScaled = (q: string) => {
  const [i, f = ""] = q.split(".");
  return BigInt(i!) * QS + BigInt((f + "0000").slice(0, 4));
};
interface RefLine { group: LineGroup; qty: string; price: number; optional?: boolean; selected?: boolean }
function reference(lines: RefLine[], s: { discBps?: number; discFixed?: number; taxBps: number; groups: Record<LineGroup, boolean>; taxOn: boolean; dep: { pct?: number; fixed?: number } }) {
  const inc = lines.filter((l) => !l.optional || l.selected);
  const tot = (l: RefLine) => half(qtyScaled(l.qty) * BigInt(l.price), QS);
  const sub = inc.reduce((a, l) => a + tot(l), 0n);
  const anyGroup = s.taxOn && LINE_GROUPS.some((g) => s.groups[g]);
  const taxable = inc.filter((l) => anyGroup && s.groups[l.group]).reduce((a, l) => a + tot(l), 0n);
  let disc = 0n;
  if (s.discBps !== undefined) disc = half(sub * BigInt(s.discBps), 10000n);
  if (s.discFixed !== undefined) disc = BigInt(Math.min(s.discFixed, Number(sub)));
  const tdisc = sub === 0n ? 0n : half(disc * taxable, sub);
  const tax = anyGroup ? half((taxable - tdisc) * BigInt(s.taxBps), 10000n) : 0n;
  const total = sub - disc + tax;
  let dep = 0n;
  if (s.dep.pct !== undefined && total > 0n) dep = half(total * BigInt(s.dep.pct), 10000n);
  if (s.dep.fixed !== undefined) dep = BigInt(Math.min(s.dep.fixed, Number(total)));
  return { sub: Number(sub), disc: Number(disc), tax: Number(tax), total: Number(total), dep: Number(dep) };
}

/* ---------- seeded PRNG ---------- */
function rng(seed: number) {
  let x = seed >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

let n = 0;
const line = (l: RefLine): CustomLine => ({ id: `l${n++}`, name: "x", group: l.group, quantity: l.qty, unit: "ea", unitPriceCents: l.price, optional: l.optional, selected: l.selected });
const settings = (s: Parameters<typeof reference>[1]): CustomSettings => ({
  discount: s.discBps !== undefined ? { kind: "pct", value: String(s.discBps / 10000) } : s.discFixed !== undefined ? { kind: "fixed", cents: s.discFixed } : null,
  tax: { enabled: s.taxOn, rateBps: s.taxBps, groups: s.groups },
  deposit: s.dep.pct !== undefined ? { kind: "pct", bps: s.dep.pct } : s.dep.fixed !== undefined ? { kind: "fixed", cents: s.dep.fixed } : { kind: "none" },
});

describe("tax by group: all 8 combinations", () => {
  const lines: RefLine[] = [
    { group: "service", qty: "1", price: 15000 },
    { group: "labor", qty: "2.5", price: 9500 },
    { group: "material", qty: "12", price: 1213 },
  ];
  for (let mask = 0; mask < 8; mask++) {
    const groups = { service: !!(mask & 1), labor: !!(mask & 2), material: !!(mask & 4) };
    it(`groups ${JSON.stringify(groups)} at 9.5%`, () => {
      const s = { taxBps: 950, groups, taxOn: true, dep: {} };
      const r = computeCustomOption({ id: "o", name: "o", lines: lines.map(line) }, settings(s));
      const ref = reference(lines, s);
      expect([r.subtotal, r.tax, r.total]).toEqual([ref.sub, ref.tax, ref.total]);
    });
  }
  it("tax switched off ignores groups", () => {
    const s = { taxBps: 950, groups: { service: true, labor: true, material: true }, taxOn: false, dep: {} };
    expect(computeCustomOption({ id: "o", name: "o", lines: lines.map(line) }, settings(s)).tax).toBe(0);
  });
});

describe("fixed money scenarios", () => {
  it("handyman: 10% discount, tax on materials only, 20% deposit", () => {
    const lines: RefLine[] = [
      { group: "service", qty: "1", price: 15000 },
      { group: "labor", qty: "120", price: 150 },
      { group: "material", qty: "12", price: 1213 },
      { group: "service", qty: "1", price: 9000, optional: true, selected: true },
    ];
    const s = { discBps: 1000, taxBps: 1025, groups: { service: false, labor: false, material: true }, taxOn: true, dep: { pct: 2000 } };
    const r = computeCustomOption({ id: "o", name: "o", lines: lines.map(line) }, settings(s));
    // sub 15000+18000+14556+9000 = 56556; disc 5655.6→5656; taxable share round(5656*14556/56556)=1456;
    // tax round((14556-1456)*10.25%)=1342.75→1343; total 56556-5656+1343 = 52243; deposit 20% = 10448.6→10449
    expect([r.subtotal, r.discount, r.tax, r.total, r.deposit]).toEqual([56556, 5656, 1343, 52243, 10449]);
    expect(reference(lines, s)).toEqual({ sub: 56556, disc: 5656, tax: 1343, total: 52243, dep: 10449 });
  });
  it("fixed discount larger than subtotal → total = tax-free 0, deposit 0", () => {
    const lines: RefLine[] = [{ group: "labor", qty: "1", price: 5000 }];
    const r = computeCustomOption({ id: "o", name: "o", lines: lines.map(line) }, settings({ discFixed: 9999, taxBps: 0, groups: DEFAULT_TAX.groups, taxOn: false, dep: { pct: 1000 } }));
    expect([r.discount, r.total, r.deposit]).toEqual([5000, 0, 0]);
  });
  it("unselected add-on never counts; fractional qty rounds half up per line", () => {
    const lines: RefLine[] = [
      { group: "material", qty: "2.5", price: 33 }, // 82.5 → 83
      { group: "labor", qty: "0.125", price: 4 }, // 0.5 → 1
      { group: "service", qty: "1", price: 100000, optional: true, selected: false },
    ];
    const r = computeCustomOption({ id: "o", name: "o", lines: lines.map(line) }, settings({ taxBps: 0, groups: DEFAULT_TAX.groups, taxOn: false, dep: {} }));
    expect(r.total).toBe(84);
  });
  it("100% deposit and $ deposit above the total", () => {
    expect(depositAmount(77236, { kind: "pct", bps: 10000 })).toBe(77236);
    expect(depositAmount(77236, { kind: "fixed", cents: 500000 })).toBe(77236);
    expect(depositAmount(0, { kind: "pct", bps: 1000 })).toBe(0);
  });
});

describe("random estimates (3,000 seeded cases) match the integer reference", () => {
  const r = rng(20261104);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!;
  // every disagreement is collected and listed by ONE test — no placeholder `expect(true)` that is green whatever happens (#800)
  const mismatches: { case: number; got: unknown; want: unknown }[] = [];
  const brokenInvariants: number[] = [];
  for (let k = 0; k < 3000; k++) {
    const lines: RefLine[] = Array.from({ length: 1 + Math.floor(r() * 8) }, () => {
      const dec = pick(["", ".5", ".25", ".125", ".333", ".0625", ".75"]);
      return {
        group: pick(LINE_GROUPS),
        qty: `${Math.floor(r() * 300)}${dec}`,
        price: Math.floor(r() * 250000),
        optional: r() < 0.15,
        selected: r() < 0.5,
      };
    });
    const s = {
      ...(r() < 0.33 ? { discBps: Math.floor(r() * 3000) } : r() < 0.5 ? { discFixed: Math.floor(r() * 200000) } : {}),
      taxBps: pick([0, 725, 950, 1025, 1075]),
      groups: { service: r() < 0.5, labor: r() < 0.5, material: r() < 0.7 },
      taxOn: r() < 0.6,
      dep: r() < 0.5 ? { pct: 1 + Math.floor(r() * 10000) } : r() < 0.5 ? { fixed: Math.floor(r() * 300000) } : {},
    };
    const res = computeCustomOption({ id: "o", name: "o", lines: lines.map(line) }, settings(s));
    const ref = reference(lines, s);
    if (res.subtotal !== ref.sub || res.discount !== ref.disc || res.tax !== ref.tax || res.total !== ref.total || res.deposit !== ref.dep) {
      mismatches.push({ case: k, got: { sub: res.subtotal, disc: res.discount, tax: res.tax, total: res.total, dep: res.deposit }, want: ref });
    }
    if (!(res.total === res.net + res.tax && res.deposit <= res.total && res.discount <= res.subtotal && res.taxableDisc <= res.discount)) {
      brokenInvariants.push(k);
    }
  }
  it("all 3,000 cases match the integer reference (the disagreeing cases are listed)", () => {
    expect(mismatches.slice(0, 10)).toEqual([]);
  });
  it("all 3,000 cases keep the invariants: total = net + tax, deposit ≤ total, discount ≤ subtotal (the broken cases are listed)", () => {
    expect(brokenInvariants.slice(0, 20)).toEqual([]);
  });
});

describe("catalog price matrix: cost × (1 + supplier tax) × (1 + markup)", () => {
  const cases: [number, number, number][] = [];
  for (const cost of [1, 99, 1000, 1234, 99999]) for (const tax of [0, 725, 1025]) for (const mk of [0, 1000, 2500, 10000]) cases.push([cost, tax, mk]);
  it.each(cases)("cost %i, tax %i bps, markup %i bps", (cost, tax, mk) => {
    const ref = Number(half(BigInt(cost) * BigInt(10000 + tax) * BigInt(10000 + mk), 10000n * 10000n));
    expect(catalogPrice(cost, tax, mk)).toBe(ref);
    expect(catalogCost(cost, tax)).toBe(Number(half(BigInt(cost) * BigInt(10000 + tax), 10000n)));
  });
});

describe("contract → invoices → partial payments (2,000 seeded flows)", () => {
  const r = rng(77);
  it("payments never exceed balances; statement adds up at every step", () => {
    for (let k = 0; k < 2000; k++) {
      const contract = 1000 + Math.floor(r() * 2_000_000);
      const invoices: { totalCents: number; paidCents: number }[] = [];
      // deposit, 0–3 progress invoices, final balance
      const dep = depositAmount(contract, { kind: "pct", bps: 1 + Math.floor(r() * 3000) });
      if (dep > 0) invoices.push({ totalCents: dep, paidCents: 0 });
      for (let p = Math.floor(r() * 4); p > 0; p--) {
        const st = contractStatement(contract, invoices);
        const amt = progressAmount(contract, st.invoiced, Math.floor(r() * 6000));
        if (amt > 0) invoices.push({ totalCents: amt, paidCents: 0 });
      }
      const left = contractStatement(contract, invoices).toInvoice;
      if (left > 0) invoices.push({ totalCents: left, paidCents: 0 });
      // random partial / over payments
      let accepted = 0;
      for (let pay = 0; pay < 12; pay++) {
        const inv = invoices[Math.floor(r() * invoices.length)]!;
        const want = Math.floor(r() * inv.totalCents * 1.5); // sometimes more than the balance
        const ok = acceptPayment(inv, want);
        expect(ok).toBeGreaterThanOrEqual(0);
        expect(inv.paidCents + ok).toBeLessThanOrEqual(inv.totalCents);
        inv.paidCents += ok;
        accepted += ok;
        const st = contractStatement(contract, invoices);
        expect(st.invoiced).toBe(contract);
        expect(st.paid).toBe(accepted);
        expect(st.remaining).toBe(contract - accepted);
        expect(st.due).toBe(st.invoiced - st.paid);
        expect(st.toInvoice).toBe(0);
      }
      // pay everything that is left → fully paid
      for (const inv of invoices) inv.paidCents += acceptPayment(inv, inv.totalCents);
      const end = contractStatement(contract, invoices);
      expect([end.paid, end.remaining, end.due]).toEqual([contract, 0, 0]);
    }
  });
});
