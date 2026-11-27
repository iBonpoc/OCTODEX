/** Prototype v2 of the client card (docs/design/client-card.html, BUILD-SPEC §2.4): sections, «Сейчас», tiles, the main step. */
import { describe, expect, it } from "vitest";
import type { Estimate, Invoice, Job } from "../src/data/types";
import {
  clientMainStep,
  clientNextStep,
  clientNowOf,
  clientSectionKeys,
  clientSectionOf,
  clientStateOf,
  clientTileKeys,
  clientToBill,
  jobFigures,
  type NowVisit,
} from "../src/features/client/nextStep";

const est = (id: string, status: Estimate["status"], o: Partial<Estimate> = {}): Estimate =>
  ({ id, status, customerId: "c", propertyId: "p", title: id, totalCents: 100_000, ...o }) as Estimate;
const job = (id: string, o: Partial<Job> = {}): Job => ({ id, propertyId: "p", title: id, status: "scheduled", amountCents: 100_000, ...o }) as Job;
const inv = (id: string, o: Partial<Invoice> = {}): Invoice => ({ id, customerId: "c", jobId: "j1", totalCents: 50_000, paidCents: 0, dueDate: "2026-12-01", ...o }) as Invoice;
const visit = (id: string, o: Partial<NowVisit> = {}): NowVisit => ({ id, jobId: "j1", start: "2026-11-20T16:30:00Z", durationMin: 240, step: "scheduled", techId: "u1", ...o });
const none = { jobs: [] as Job[], visits: [] as NowVisit[], invoices: [] as Invoice[], estimates: [] as Estimate[], leads: [], today: "2026-11-20" };

describe("sections: one strip «Обзор · Работы · Сметы · Счета · Объекты · Журнал» (visual v2, #2350)", () => {
  it("the office: Обзор · Работы · Сметы · Счета · Объекты · Журнал; no money yet — no «Счета»", () => {
    expect(clientSectionKeys("director", true)).toEqual(["overview", "work", "estimates", "money", "visits", "places", "log"]);
    expect(clientSectionKeys("dispatcher", false)).toEqual(["overview", "work", "estimates", "visits", "places", "log"]);
  });
  it("one place: no «Объекты» — the address is the header's panel and «Маршрут» (nothing twice)", () => {
    expect(clientSectionKeys("director", true, false)).toEqual(["overview", "work", "estimates", "money", "visits", "log"]);
    expect(clientSectionKeys("tech", false, false)).toEqual(["overview", "work", "log"]);
  });
  it("the tech never sees «Счета» nor «Сметы»", () => {
    expect(clientSectionKeys("tech", true)).not.toContain("money");
    expect(clientSectionKeys("tech", true)).not.toContain("estimates");
  });
  it("an old address opens the section that holds it now", () => {
    expect(clientSectionOf("estimates")).toBe("estimates");
    expect(clientSectionOf("jobs")).toBe("work");
    expect(clientSectionOf("invoices")).toBe("money");
    expect(clientSectionOf("properties")).toBe("places");
    expect(clientSectionOf("notes")).toBe("log");
    expect(clientSectionOf("people")).toBe("overview");
    expect(clientSectionOf(undefined)).toBe("overview");
  });
  it("every section of today opens itself — «Выезды» is not folded into «Работы» (#3060 п.3: the chip «Выезды» opened «Работы»)", () => {
    for (const k of clientSectionKeys("director", true, true)) expect(clientSectionOf(k)).toBe(k);
  });
});

describe("the «Сейчас» card's three figures (visual v2: Смета · Оплачено · Остаток)", () => {
  it("the contract, what is paid on it, what is left — the void invoices left out", () => {
    const j = job("j1", { amountCents: 342_000 });
    const paid = inv("dep", { totalCents: 34_200, paidCents: 34_200 });
    const voided = inv("v", { totalCents: 99_000, paidCents: 99_000, status: "void" } as Partial<Invoice>);
    expect(jobFigures(j, [paid, voided, inv("other", { jobId: "j2", paidCents: 50_000 })])).toEqual({ contract: 342_000, paid: 34_200, remaining: 307_800 });
  });
  it("a job without a sum has no figures", () => expect(jobFigures(job("j1", { amountCents: 0 }), [])).toBeNull());
});

describe("«Ещё выставить»", () => {
  it("the contract left to bill of every approved estimate's job", () => {
    const jobs = [job("j1", { estimateId: "e1" }), job("j2", { estimateId: "e2", amountCents: 24_000 })];
    expect(clientToBill([est("e1", "approved"), est("e2", "approved")], jobs, [inv("i1", { totalCents: 34_200 })])).toBe(65_800 + 24_000);
  });
  it("a draft or a cancelled job bills nothing", () => {
    expect(clientToBill([est("e1", "draft")], [job("j1", { estimateId: "e1" })], [])).toBe(0);
    expect(clientToBill([est("e1", "approved")], [job("j1", { estimateId: "e1", cancelledAt: "2026-11-01" })], [])).toBe(0);
  });
});

describe("«Сейчас»", () => {
  it("a job going on wins over everything", () => {
    const n = clientNowOf({ ...none, jobs: [job("j1")], visits: [visit("v1", { step: "on_site" })], invoices: [inv("late", { dueDate: "2026-11-01" })] });
    expect(n?.kind).toBe("working");
  });
  it("an overdue invoice, then a scheduled job, then an estimate waiting", () => {
    expect(clientNowOf({ ...none, invoices: [inv("late", { dueDate: "2026-11-15" })] })).toMatchObject({ kind: "overdue", owesCents: 50_000 });
    expect(clientNowOf({ ...none, jobs: [job("j1")], visits: [visit("v1")] })?.kind).toBe("scheduled");
    expect(clientNowOf({ ...none, estimates: [est("e1", "sent")] })?.kind).toBe("waiting");
  });
  it("an invoice not due yet is not «просрочен»; a visit in the past is not «следующий»", () => {
    expect(clientNowOf({ ...none, invoices: [inv("i", { dueDate: "2026-12-01" })] })).toBeNull();
    expect(clientNowOf({ ...none, jobs: [job("j1")], visits: [visit("v1", { start: "2026-11-01T16:00:00Z" })] })).toBeNull();
  });
  it("a new lead when there is nothing else", () => {
    expect(clientNowOf({ ...none, leads: [{ id: "l1", status: "new", receivedAt: "2026-11-20T10:00:00Z", service: "Paint" }] })?.kind).toBe("lead");
  });
});

describe("tiles 2×2", () => {
  it("a new client has none: zeros say nothing", () => expect(clientTileKeys("director", "new", 0)).toEqual([]));
  it("the office: «Ещё выставить» when something is left to bill, «Напоминали» when the client owes", () => {
    expect(clientTileKeys("dispatcher", "active", 307_800)).toEqual(["debt", "toBill", "nextVisit", "contact"]);
    expect(clientTileKeys("director", "owes", 0)).toEqual(["debt", "paid", "nextVisit", "reminded"]);
  });
  it("sales — value; the tech — access; archive — the past", () => {
    expect(clientTileKeys("sales", "active", 0)).toEqual(["paid", "approved", "source", "contact"]);
    expect(clientTileKeys("tech", "active", 0)).toEqual(["gate", "onSite", "tomorrow"]);
    expect(clientTileKeys("director", "archived", 0)).toEqual(["paid", "lastJob"]);
  });
  it("the state", () => {
    expect(clientStateOf("active", { owesCents: 184_000, jobs: 1, paidCents: 0, toBillCents: 0 })).toBe("owes");
    expect(clientStateOf("prospect", { owesCents: 0, jobs: 0, paidCents: 0, toBillCents: 0 })).toBe("new");
    expect(clientStateOf("archived", { owesCents: 5, jobs: 1, paidCents: 0, toBillCents: 0 })).toBe("archived");
  });
});

describe("the one main step", () => {
  const base = { estimates: [] as Estimate[], jobs: [] as Job[], invoices: [] as Invoice[], role: "director" as const, newEstimateHref: "/estimate/new?customerId=c" };
  it("archive → «Вернуть в активные»; do not service → none", () => {
    expect(clientMainStep({ role: "director", state: "archived", step: clientNextStep(base), now: null })).toEqual({ kind: "restore" });
    expect(clientMainStep({ role: "director", state: "noService", step: null, now: null })).toBeNull();
  });
  it("the chain first: «Взять оплату» stays", () => {
    const step = clientNextStep({ ...base, invoices: [inv("i1")] });
    expect(clientMainStep({ role: "director", state: "owes", step, now: null })?.kind).toBe("pay");
  });
  it("a scheduled job the client was not told about → «Сообщить время»; told → «Новая смета»", () => {
    const step = clientNextStep(base);
    const now = clientNowOf({ ...none, jobs: [job("j1")], visits: [visit("v1")] });
    expect(clientMainStep({ role: "director", state: "active", step, now })?.kind).toBe("tellTime");
    const told = clientNowOf({ ...none, jobs: [job("j1")], visits: [visit("v1", { customerNotifiedAt: "2026-11-19T10:00:00Z" })] });
    expect(clientMainStep({ role: "director", state: "active", step, now: told })?.kind).toBe("estimate");
  });
  it("an estimate with the client and nothing else → «Напомнить про смету»", () => {
    const now = clientNowOf({ ...none, estimates: [est("e1", "sent")] });
    expect(clientMainStep({ role: "director", state: "active", step: clientNextStep(base), now })).toMatchObject({ kind: "remind", estimate: { id: "e1" } });
  });
  it("the tech — «В путь» to his visit, nothing about money", () => {
    expect(clientMainStep({ role: "tech", state: "active", step: null, now: null, techVisitId: "v1" })).toEqual({ kind: "trip", visitId: "v1" });
    expect(clientMainStep({ role: "tech", state: "active", step: null, now: null })).toBeNull();
  });
});
