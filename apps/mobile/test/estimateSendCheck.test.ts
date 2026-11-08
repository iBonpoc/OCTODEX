/**
 * C5 — the check before sending an estimate (docs/specs/33-gutters-estimate.md П23.9). The core reads only the flags a
 * module wrote into `source` (lineMarks): «нет цены» stops a send; a test price and a line no longer in the measurement
 * go only after «Всё равно отправить» (force). Every option and add-on counts; a line with quantity 0 never reaches the
 * client (clientDoc drops it) and never stops a send.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" }, Linking: {}, Share: {} }));
vi.mock("expo-clipboard", () => ({}));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));

import { beforeSend } from "../src/features/sendEstimate";
import { clientDoc, issueCount, newDoc, optionTotals, sendIssues, withAddons, zeroQty } from "../src/features/estimateDoc";
import type { Customer, EstimateDoc } from "../src/data/types";
import type { CustomLine } from "@octo/estimating-engine";

const src = (x: Record<string, unknown> = {}) => ({ module: "gutters", key: "k", ...x }) as CustomLine["source"];
const line = (id: string, x: Partial<CustomLine> = {}): CustomLine => ({ id, group: "material", name: `L ${id}`, quantity: "10", unit: "ft", unitPriceCents: 500, ...x });
const docOf = (...opts: CustomLine[][]): EstimateDoc => {
  const d = newDoc();
  const base = d.options[0]!;
  d.options = opts.map((lines, i) => ({ ...base, id: `o${i}`, name: `Opt ${i}`, lines }));
  return d;
};
const noPrice = (id: string, x: Partial<CustomLine> = {}) => line(id, { unitPriceCents: 0, source: src({ noPrice: true }), ...x });
const testPrice = (id: string) => line(id, { unitPriceCents: 700, source: src({ testPrice: true, priceCents: 700 }) });
const gone = (id: string) => line(id, { source: src({ gone: true }) });
const cust = (id: string, x: Partial<Customer> = {}): Customer => ({ id, name: `C ${id}`, phone: "", ...x }) as Customer;
const db = { customers: [cust("a"), cust("x", { taxExempt: true }), cust("b", { status: "do_not_service", statusReason: "rude" })] };

describe("sendIssues", () => {
  it("finds each kind in every option, add-ons included; own lines (no source) and plain module lines are fine", () => {
    const i = sendIssues(docOf([line("own"), line("m", { source: src() }), noPrice("np")], [testPrice("tp"), { ...gone("g"), optional: true }]));
    expect(i.noPrice.map((l) => l.lineId)).toEqual(["np"]);
    expect(i.testPrice).toEqual([{ lineId: "tp", optionId: "o1", name: "L tp" }]);
    expect(i.gone.map((l) => l.lineId)).toEqual(["g"]);
    expect(issueCount(i)).toBe(3);
  });
  it("a price set by hand clears «нет цены»; a changed test price clears «тестовая»", () => {
    const i = sendIssues(docOf([noPrice("np", { unitPriceCents: 1200 }), { ...testPrice("tp"), unitPriceCents: 900 }]));
    expect(issueCount(i)).toBe(0);
  });
  it("quantity 0 (how a part is left out) never counts; a blank or broken quantity still does", () => {
    const i = sendIssues(docOf([noPrice("z", { quantity: "0" }), { ...gone("g"), quantity: "0.00" }, noPrice("blank", { quantity: "" }), noPrice("bad", { quantity: "x" })]));
    expect(i.noPrice.map((l) => l.lineId)).toEqual(["blank", "bad"]);
    expect(i.gone).toEqual([]);
  });
  it("a broken source is not a module line: no issue", () => {
    expect(issueCount(sendIssues(docOf([line("b", { unitPriceCents: 0, source: { noPrice: true } as never })])))).toBe(0);
  });
});

describe("zeroQty and the client's copy", () => {
  it("zeroQty: only an exact zero", () => {
    expect([0, "0", "0.00", " 0 "].map((q) => zeroQty({ quantity: q as never }))).toEqual([true, true, true, true]);
    expect(["", "1", "0.01", "x"].map((q) => zeroQty({ quantity: q }))).toEqual([false, false, false, false]);
  });
  it("clientDoc drops a quantity-0 line in every option (demo /p/, PDF) — never a $0 row for the client", () => {
    const c = clientDoc(docOf([line("a"), line("z", { quantity: "0" })], [line("z2", { quantity: 0 as never, optional: true }), line("b")]));
    expect(c.options.map((o) => o.lines.map((l) => l.id))).toEqual([["a"], ["b"]]);
  });
});

describe("the client's totals without the quantity-0 lines (review C5 №6)", () => {
  it("discount, tax, deposit and a chosen add-on: the same totals as the company's", () => {
    const d = docOf([line("a", { unitPriceCents: 1999, quantity: "2.5" }), line("z", { quantity: "0", unitPriceCents: 4999 }), line("add", { optional: true, unitPriceCents: 3000 }), line("addz", { optional: true, quantity: "0" })]);
    d.settings.tax = { ...d.settings.tax, enabled: true, rateBps: 950, groups: { ...d.settings.tax.groups, material: true } };
    d.settings.discount = { kind: "pct", value: "0.1" };
    const c = clientDoc(d);
    for (const addons of [[], ["add"], ["add", "addz"]]) {
      const ours = optionTotals(d, withAddons(d.options[0]!, addons));
      const theirs = optionTotals(c, withAddons(c.options[0]!, addons));
      expect([theirs.total, theirs.deposit]).toEqual([ours.total, ours.deposit]);
    }
  });
});

describe("beforeSend (C5)", () => {
  it("«do not service» first, then the lines", () => {
    expect(beforeSend(db, { customerId: "b", status: "draft", doc: docOf([noPrice("np")]) })).toEqual({ ok: false, reason: "no_service" });
  });
  it("«нет цены» stops the send even with force", () => {
    const e = { customerId: "a", status: "draft" as const, doc: docOf([noPrice("np"), testPrice("tp")]) };
    for (const force of [false, true]) {
      const r = beforeSend(db, e, { force });
      expect(r.ok).toBe(false);
      if (!r.ok && r.reason === "lines") {
        expect(r.canForce).toBe(false);
        expect(r.issues.noPrice.map((l) => l.lineId)).toEqual(["np"]);
      } else throw new Error("expected lines");
    }
  });
  it("a test price or a line not in the measurement: stopped, can force; force sends", () => {
    const e = { customerId: "a", status: "sent" as const, doc: docOf([testPrice("tp"), gone("g")]) };
    expect(beforeSend(db, e)).toMatchObject({ ok: false, reason: "lines", canForce: true });
    expect(beforeSend(db, e, { force: true })).toEqual({ ok: true });
  });
  it("after the check, a taxed draft of a «Без налога» client is still re-saved without tax", () => {
    const d = docOf([testPrice("tp")]);
    d.settings.tax = { ...d.settings.tax, enabled: true, rateBps: 950, groups: { ...d.settings.tax.groups, material: true } };
    const r = beforeSend(db, { customerId: "x", status: "draft", doc: d }, { force: true });
    expect(r.ok && r.resave?.settings.tax.enabled).toBe(false);
  });
  it("a clean estimate goes as before", () => {
    expect(beforeSend(db, { customerId: "a", status: "draft", doc: docOf([line("a"), line("m", { source: src() })]) })).toEqual({ ok: true });
    expect(beforeSend(db, { customerId: "a", status: "draft" })).toEqual({ ok: true });
  });
});
