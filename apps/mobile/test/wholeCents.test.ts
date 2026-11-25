/**
 * unit:wholeCents — «у клиента не может быть $115 и 19 с половиной центов» (основатель 16.11.2026, #1849; правило 8).
 * Дробных центов клиент не видит нигде: ни на экране и в итогах (summarize — список, карточка, подпись), ни в PDF сметы,
 * ни на /p/ (та же сборка документа estimateHtml), ни в цене каталога (catalogPrice). Сторож держит четыре стены:
 *  1. итоги сметы — целые центы при дробном количестве, скидке процентом, налоге с долями процента, задатке процентом;
 *  2. документ клиента — каждая сумма «$…» с ровно двумя знаками после точки или без них, третьего знака нет;
 *  3. цена позиции из закупки, налога поставщика и наценки — целые центы;
 *  4. база — каждая колонка `*_cents` в миграциях целая (bigint / integer), не numeric / real / double;
 *     4а. колонка `*_millicents` (точная закупка в тысячных долях цента, #1926) — только bigint.
 * Примеры — из повторяемого генератора (своё зерно), а не из настоящего часа.
 */
import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));

import { catalogPrice } from "@octo/estimating-engine";
import { estimateHtml } from "../src/features/estimatePdf";
import { docMoney } from "../src/features/docPdf";
import { portalFromEstimate } from "../src/cloud/portal";
import { makeSeed } from "../src/data/seed";
import { DEFAULT_SETTINGS, optionTotals, summarize } from "../src/features/estimateDoc";
import type { Estimate, EstimateDoc } from "../src/data/types";

/** mulberry32: the same examples every run */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const N = 200;
const GROUPS = ["labor", "material", "service"] as const;

function randomDoc(r: () => number): EstimateDoc {
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = <T,>(xs: readonly T[]) => xs[int(0, xs.length - 1)]!;
  const lines = Array.from({ length: int(1, 6) }, (_, i) => ({
    id: `l${i}`,
    name: `Line ${i}`,
    group: pick(GROUPS),
    // a fractional quantity, up to 4 decimals (numeric(14,4))
    quantity: (int(1, 999999) / 10 ** int(0, 4)).toString(),
    unit: "ea",
    unitPriceCents: int(1, 250000),
    costCents: int(0, 150000),
    optional: i > 0 && r() < 0.2 ? true : undefined,
  }));
  const discount = pick([null, { kind: "pct", value: (int(1, 3333) / 10000).toString() }, { kind: "fixed", cents: int(1, 5000) }] as const);
  const deposit = pick([{ kind: "none" }, { kind: "pct", bps: int(1, 9999) }, { kind: "fixed", cents: int(1, 50000) }] as const);
  const rateBps = pick([0, 625, 725, 887, 950, 1025]);
  return {
    options: [{ id: "o1", name: "Option", recommended: true, lines }],
    settings: {
      ...DEFAULT_SETTINGS,
      discount,
      deposit,
      tax: { enabled: rateBps > 0, rateBps, groups: { labor: r() < 0.5, material: true, service: r() < 0.5 } },
    },
  } as unknown as EstimateDoc;
}

const whole = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n);

describe("unit:wholeCents — дробных центов клиент не видит нигде (#1849)", () => {
  it("1. итоги сметы — целые центы (экран, список, подпись)", () => {
    const r = rng(1849);
    for (let k = 0; k < N; k++) {
      const doc = randomDoc(r);
      const o = doc.options[0]!;
      const t = optionTotals(doc, o);
      const money = { subtotal: t.subtotal, discount: t.discount, net: t.net, tax: t.tax, total: t.total, deposit: t.deposit, revenue: t.revenue, cost: t.cost, margin: t.margin };
      for (const [name, v] of Object.entries(money)) expect(whole(v), `${name} = ${v} (пример ${k})`).toBe(true);
      expect(t.lineTotals.every(whole), `строки ${t.lineTotals} (пример ${k})`).toBe(true);
      const s = summarize(doc, { optionId: "o1", addonIds: o.lines.filter((l) => l.optional).map((l) => l.id) });
      expect(whole(s.totalCents) && whole(s.depositCents) && s.lines.every((l) => whole(l.totalCents)), `summarize (пример ${k})`).toBe(true);
    }
  });

  it("2. документ клиента (PDF и /p/): у каждой суммы два знака после точки или ни одного", () => {
    const r = rng(115195);
    const db = makeSeed();
    const c = db.customers[0]!;
    const prop = db.properties.find((p) => p.customerId === c.id) ?? db.properties[0]!;
    for (let k = 0; k < 40; k++) {
      const doc = randomDoc(r);
      const e: Estimate = { id: `w${k}`, customerId: c.id, propertyId: prop.id, title: "W", totalCents: summarize(doc).totalCents, status: "sent", sentAt: "2026-11-05T17:00:00Z", number: `EST-${k}`, doc };
      const html = estimateHtml(portalFromEstimate({ ...db, estimates: [...db.estimates, e] }, e, "Acme"), { lang: "en" });
      const sums = html.match(/\$\d[\d,]*(\.\d+)?/g) ?? [];
      expect(sums.length, `в документе есть суммы (пример ${k})`).toBeGreaterThan(0);
      for (const m of sums) expect(m, `сумма ${m} (пример ${k})`).toMatch(/^\$\d{1,3}(,\d{3})*(\.\d{2})?$/);
    }
  });

  it("2а. формат суммы документа: целый доллар без центов, иначе ровно два знака", () => {
    expect([docMoney(11500), docMoney(11519), docMoney(5), docMoney(123456789)]).toEqual(["$115", "$115.19", "$0.05", "$1,234,567.89"]);
  });

  it("3. цена позиции из закупки × (1 + налог поставщика) × (1 + наценка) — целые центы", () => {
    const r = rng(53);
    for (let k = 0; k < N * 5; k++) {
      const cost = Math.floor(r() * 500000);
      const tax = Math.floor(r() * 1500);
      const markup = Math.floor(r() * 20000);
      const p = catalogPrice(cost, tax, markup);
      expect(whole(p) && p >= 0, `catalogPrice(${cost}, ${tax}, ${markup}) = ${p}`).toBe(true);
    }
  });

  it("4. база: каждая колонка *_cents — целое число (bigint / integer)", () => {
    const dir = new URL("../../../supabase/migrations/", import.meta.url);
    const bad: string[] = [];
    let seen = 0;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
      const sql = readFileSync(new URL(f, dir), "utf8").replace(/--[^\n]*/g, "");
      // a column definition: «<name>_cents <type>» after a line start, «(» or «,» in create table, or «add column [if not exists]»
      const re = /(?:^|[\n,(]|add column(?: if not exists)?)\s*"?([a-z_]*_cents)"?\s+(numeric|decimal|real|double precision|float[48]?|money|bigint|integer|int[248]?|smallint)\b/gi;
      for (const m of sql.matchAll(re)) {
        seen++;
        if (!/^(bigint|integer|int[248]?|smallint)$/i.test(m[2]!)) bad.push(`${f}: ${m[1]} ${m[2]}`);
      }
    }
    expect(seen, "колонки *_cents найдены").toBeGreaterThan(20);
    expect(bad).toEqual([]);
  });

  it("4а. база: каждая колонка *_millicents (точная закупка, #1926) — только bigint", () => {
    const dir = new URL("../../../supabase/migrations/", import.meta.url);
    const bad: string[] = [];
    let seen = 0;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
      const sql = readFileSync(new URL(f, dir), "utf8").replace(/--[^\n]*/g, "");
      const re = /(?:^|[\n,(]|add column(?: if not exists)?)\s*"?([a-z_]*_millicents)"?\s+(numeric|decimal|real|double precision|float[48]?|money|bigint|integer|int[248]?|smallint)\b/gi;
      for (const m of sql.matchAll(re)) {
        seen++;
        if (!/^bigint$/i.test(m[2]!)) bad.push(`${f}: ${m[1]} ${m[2]}`);
      }
    }
    expect(seen, "колонки *_millicents найдены").toBeGreaterThanOrEqual(2);
    expect(bad).toEqual([]);
  });
});
