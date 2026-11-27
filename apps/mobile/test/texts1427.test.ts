/**
 * #1427 «Тексты экранов», слова: counted phrases through Intl.PluralRules (DS §4.2), a duration in hours (§4.5), the minus «−»
 * (§4.5), one word for a paid invoice (§4.4 п.1, dictionary 2.40), the dictionary's verbs and nouns (3.22 «Принять оплату»,
 * 1.18 «Квитанция», 6.6 «Депозит»), «Удалить учётную запись» (§12.8), the case of «Политику конфиденциальности».
 */
import { describe, expect, it } from "vitest";
import { durationText, moneyText, plural, signedText, translate } from "../src/i18n/translate";
import { ru } from "../src/i18n/ru";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";
import { invoiceStatusView, INVOICE_PAID } from "../src/features/invoiceStatus";
import { invoiceTitle } from "../src/features/invoiceTitle";
import { expenseJobChoices } from "../src/features/expenseJobs";
import type { DB } from "../src/data/types";

const dicts = { ru, en, es } as Record<string, Record<string, string>>;

describe("counted phrases (Intl.PluralRules)", () => {
  it("RU: 1 выезд, 3 выезда, 5 выездов, 21 выезд — no «выезд(а)»", () => {
    expect(plural("ru", "vf.load", 1, { ranges: "9:00 AM" })).toBe("1 выезд · 9:00 AM");
    expect(plural("ru", "vf.load", 3, { ranges: "x" })).toBe("3 выезда · x");
    expect(plural("ru", "vf.load", 5, { ranges: "x" })).toBe("5 выездов · x");
    expect(plural("ru", "vf.load", 21, { ranges: "x" })).toBe("21 выезд · x");
  });
  it("EN and ES: 1 visit / 2 visits, 1 visita / 2 visitas", () => {
    expect(plural("en", "vf.load", 1, { ranges: "x" })).toBe("1 visit · x");
    expect(plural("en", "vf.load", 2, { ranges: "x" })).toBe("2 visits · x");
    expect(plural("es", "vf.load", 1, { ranges: "x" })).toBe("1 visita · x");
    expect(plural("es", "vf.load", 2, { ranges: "x" })).toBe("2 visitas · x");
  });
  it("«3 выезда сегодня», not «Выездов сегодня: 3» (the number is the fact, not a label)", () => {
    expect(plural("ru", "visits.today", 3)).toBe("3 выезда сегодня");
    expect(plural("ru", "visits.today", 1)).toBe("1 выезд сегодня");
    expect(plural("en", "visits.today", 0)).toBe("0 visits today");
  });
  it("reports: «1 оплата · 57%», «2 счёта · 40%» — not «1 шт»", () => {
    expect(plural("ru", "rpt.share.pay", 1, { pct: 57 })).toBe("1 оплата · 57%");
    expect(plural("ru", "rpt.share.pay", 2, { pct: 82 })).toBe("2 оплаты · 82%");
    expect(plural("ru", "rpt.share.inv", 1, { pct: 44 })).toBe("1 счёт · 44%");
    expect(plural("en", "rpt.share.inv", 2, { pct: 40 })).toBe("2 invoices · 40%");
  });
  it("no «(а)» / «(s)» / «шт» left in a counted phrase of any language", () => {
    for (const d of Object.values(dicts))
      for (const [k, v] of Object.entries(d)) if (/^(vf\.load|visits\.today|rpt\.share)/.test(k)) expect(v, k).not.toMatch(/\((а|s|es|ов)\)|шт/);
  });
});

describe("duration (DS §4.5)", () => {
  it("whole hours in hours, the rest as «1 ч 30 мин», under an hour in minutes", () => {
    expect(durationText("ru", 240)).toBe("4 ч");
    expect(durationText("ru", 90)).toBe("1 ч 30 мин");
    expect(durationText("ru", 45)).toBe("45 мин");
    expect(durationText("en", 240)).toBe("4 h");
    expect(durationText("es", 60)).toBe("1 h");
  });
});

describe("money minus (DS §4.5)", () => {
  it("a negative amount: «−$78.50» with U+2212, never «-$78.50»", () => {
    expect(moneyText(-7850)).toBe("−$78.50");
    expect(moneyText(-100)).toBe("−$1.00");
    expect(moneyText(137510)).toBe("$1,375.10");
    expect(moneyText(0)).toBe("$0.00");
  });
  it("a negative percent: «−218.2», not «-218.2»", () => {
    expect(signedText(-218.2)).toBe("−218.2");
    expect(signedText(12.5)).toBe("12.5");
  });
});

describe("one word for a paid invoice (dictionary 2.40)", () => {
  it("the status chip, the filter and the group read the same key — «Оплачен» / «Paid» / «Pagada»", () => {
    expect(invoiceStatusView({ totalCents: 100, paidCents: 100 }).l).toBe(INVOICE_PAID);
    expect(translate("ru", INVOICE_PAID)).toBe("Оплачен");
    expect(translate("en", INVOICE_PAID)).toBe("Paid");
    expect(translate("es", INVOICE_PAID)).toBe("Pagada");
    // the old second and third words are gone
    expect(Object.keys(ru)).not.toContain("mny.g.paid");
    expect(Object.keys(ru)).not.toContain("mny.f.paid");
  });
  it("«Принять оплату» everywhere — no «Записать оплату» (dictionary 3.22)", () => {
    expect(Object.values(ru)).not.toContain("Записать оплату");
    // the second key for the same button is gone: the visit and the invoice card use «money.receive»
    expect(Object.keys(ru)).not.toContain("visit.recordPayment");
    expect(translate("ru", "money.receive")).toBe("Принять оплату");
  });
});

describe("dictionary nouns", () => {
  it("the column of RCT-… is «Квитанция», not «Чек» (dictionary 1.18)", () => {
    expect(translate("ru", "card.fact.receipt")).toBe("Квитанция");
  });
  it("a deposit invoice reads «Депозит» in the RU interface, whatever language its stored title is in (6.6)", () => {
    const t = (k: Parameters<typeof translate>[1]) => translate("ru", k);
    expect(invoiceTitle({ kind: "deposit", title: "Deposit" }, t)).toBe("Депозит");
    expect(invoiceTitle({ kind: "deposit", title: "Depósito" }, t)).toBe("Депозит");
    expect(invoiceTitle({ kind: "final", title: "Final balance" }, t)).toBe("Остаток по договору");
    expect(invoiceTitle({ kind: "progress", title: "Rough-in" }, t)).toBe("Rough-in");
    expect(invoiceTitle({ kind: "final", title: undefined }, t)).toBe("Остаток по договору");
  });
  it("«Удалить учётную запись» (DS §12.8), the agreement «…и Политику конфиденциальности»", () => {
    expect(translate("ru", "acct.title")).toBe("Удалить учётную запись");
    expect(translate("ru", "acct.sure.title")).toBe("Удалить учётную запись навсегда?");
    // the agreement sentence is one key since #1756 (spec 52 §6): the case is checked in it
    expect(translate("ru", "legal.agree.a11y")).toContain("и Политику конфиденциальности");
  });
  it("a sample button of the showcase is «Создать смету» («Новый X» is only a form title)", () => {
    expect(translate("ru", "ds.state.noneBtn")).toBe("Создать смету");
  });
});

describe("«К какой работе» offers the job, not the client (#1427 053)", () => {
  it("job number + title, one choice per job", () => {
    const db = {
      jobs: [{ id: "j1", number: "JOB-0001", title: "Bathroom remodel", propertyId: "p1" }],
      properties: [{ id: "p1", customerId: "c1" }],
      customers: [{ id: "c1", name: "Sarah Mitchell" }],
    } as unknown as DB;
    const items = expenseJobChoices(db, [{ jobId: "j1" }, { jobId: "j1" }, { jobId: null }]);
    expect(items).toEqual([{ key: "j1", label: "JOB-0001 · Bathroom remodel" }]);
  });
});
