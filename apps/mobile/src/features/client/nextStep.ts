/**
 * The client card's one main button — «the next step» along the chain (redesign 20.11.2026, 06-decision.md п.3):
 * no estimate → «Новая смета»; a draft → «Отправить»; approved with something left to bill → «Выставить счёт»;
 * an invoice not paid → «Взять оплату». The further a step is along the chain, the sooner it is offered (money first).
 * Pure: it only reads the client's records and leads to the actions that already exist (the send sheet of the estimate,
 * the job's contract statement, the invoice's «Принять оплату»); no business rule is changed here.
 * Tested in test/clientNextStep.test.ts.
 */
import { contractStatement } from "@octo/estimating-engine";
import type { Estimate, Invoice, Job, Role } from "@/data/types";
import { canBill } from "@/features/billRights";
import { invoiceBalance } from "@/features/invoiceStatus";
import { paymentRight } from "@/features/moneyLists";

export type NextStep =
  | { kind: "pay"; invoice: Invoice; owesCents: number; href: string }
  | { kind: "bill"; estimate: Estimate; job: Job; toInvoiceCents: number; href: string }
  | { kind: "send"; estimate: Estimate; href: string }
  | { kind: "estimate"; href: string };

export interface NextStepInput {
  estimates: Estimate[];
  jobs: Job[];
  /** the client's invoices the role sees (the tech — none) */
  invoices: Invoice[];
  role: Role;
  /** «Новая смета» of this client's «＋» (role, «do not service»): its address, or none */
  newEstimateHref?: string;
}

const live = (i: Invoice) => i.status !== "void";
/** the newest first: what the person touched last is what he is on */
const newest = (a: Estimate, b: Estimate) => (b.savedAt ?? b.sentAt ?? "").localeCompare(a.savedAt ?? a.sentAt ?? "");

export function clientNextStep({ estimates, jobs, invoices, role, newEstimateHref }: NextStepInput): NextStep | null {
  // 1) money waits: the invoice due first (the overdue ones are the earliest) that this role can take a payment of
  const unpaid = invoices
    .filter(live)
    .map((invoice) => ({ invoice, owesCents: invoiceBalance(invoice).owesCents }))
    .filter((x) => x.owesCents > 0)
    .filter((x) => paymentRight(role, x.invoice, { fromEstimate: !!jobs.find((j) => j.id === x.invoice.jobId)?.estimateId }) !== "none")
    .sort((a, b) => (a.invoice.dueDate ?? "").localeCompare(b.invoice.dueDate ?? ""));
  if (unpaid[0]) return { kind: "pay", ...unpaid[0], href: `/invoice/${unpaid[0].invoice.id}` };

  // 2) a signed contract with something left to bill: the job's statement has «Выставить остаток» (ContractStatement)
  if (canBill(role)) {
    for (const estimate of estimates.filter((e) => e.status === "approved").sort(newest)) {
      const job = jobs.find((j) => j.estimateId === estimate.id && !j.cancelledAt);
      if (!job || job.amountCents <= 0) continue;
      const toInvoiceCents = contractStatement(job.amountCents, invoices.filter((i) => live(i) && i.jobId === job.id)).toInvoice;
      if (toInvoiceCents > 0) return { kind: "bill", estimate, job, toInvoiceCents, href: `/job/${job.id}` };
    }
  }

  // 3) a draft to send: the estimate opens with its send sheet (`?send=1`, the estimate's own screen)
  const draft = estimates.filter((e) => e.status === "draft").sort(newest)[0];
  if (draft) return { kind: "send", estimate: draft, href: `/estimate/${draft.id}?send=1` };

  // 4) nothing to move: a new estimate (when this role may make one for this client)
  return newEstimateHref ? { kind: "estimate", href: newEstimateHref } : null;
}

/**
 * «Сейчас» — the client's current business: the document of the next step, else an estimate waiting for the client's answer;
 * and the jobs not done yet. What is shown here is left out of the history below it.
 */
export function clientCurrent(step: NextStep | null, estimates: Estimate[], jobs: Job[]): { doc?: { type: "estimate"; e: Estimate } | { type: "invoice"; i: Invoice }; jobs: Job[] } {
  const waiting = estimates.filter((e) => e.status === "sent" || e.status === "awaiting_countersign").sort(newest)[0];
  const doc =
    step?.kind === "pay"
      ? ({ type: "invoice", i: step.invoice } as const)
      : step?.kind === "bill" || step?.kind === "send"
        ? ({ type: "estimate", e: step.estimate } as const)
        : waiting
          ? ({ type: "estimate", e: waiting } as const)
          : undefined;
  return { doc, jobs: jobs.filter((j) => j.status !== "done" && !j.cancelledAt) };
}

/* ---------- prototype v2 (client-card.html, BUILD-SPEC §2.4): the five sections, «Сейчас», the tiles, the main step ---------- */

/**
 * The client's sections (visual v2 «Клиент», #2350): Обзор · Работы · Сметы · Счета · Объекты · Журнал — one strip that scrolls
 * sideways. Contacts live in the header's «⌄» panel. «Сметы» and «Счета» are their own sections (v2), not chips inside «Работы».
 */
export type ClientSectionKey = "overview" | "work" | "estimates" | "money" | "visits" | "places" | "log";

/**
 * The sections a role sees: the tech — Обзор · Выезды · (Объекты) · Журнал (no money, no estimates, canSeeClientMoney); the office and
 * sales — Обзор · Работы · Сметы · (Счета, once there is money: an invoice, a payment, an advance or something left to bill) ·
 * Выезды · (Объекты) · Журнал. «Объекты» only with two places or more: one address is the header's panel and «Маршрут» (nothing twice, #2350).
 */
export function clientSectionKeys(role: Role, hasMoney: boolean, manyPlaces = true): ClientSectionKey[] {
  const places: ClientSectionKey[] = manyPlaces ? ["places"] : [];
  if (role === "tech") return ["overview", "work", ...places, "log"];
  // #2363 q76 (founder 21.11: «А, Выезды»): the office sees the client's visits as their own section after «Счета» (visual v2 макет 3)
  return ["overview", "work", "estimates", ...(hasMoney ? (["money"] as const) : []), "visits", ...places, "log"];
}

/** An address of before (`?tab=` / `?s=` of the 11 sections) opens the section that holds it now. */
export function clientSectionOf(v: unknown): ClientSectionKey {
  switch (v) {
    case "work":
    case "jobs":
    case "leads":
    case "visits":
      return "work";
    case "estimates":
      return "estimates";
    case "money":
    case "invoices":
    case "billing":
      return "money";
    case "places":
    case "properties":
      return "places";
    case "log":
    case "history":
    case "notes":
    case "tasks":
    case "files":
      return "log";
    default:
      return "overview";
  }
}

/**
 * «Тройка цифр» of the «Сейчас» card (visual v2 «Клиент»: «Смета $3,420 · Оплачено $342 · Остаток $3,078»): the job's contract, what
 * is paid on it and what is left — by the engine's contract statement (rule 8), the void invoices left out. A job without a sum — none.
 */
export function jobFigures(job: Job, invoices: Invoice[]): { contract: number; paid: number; remaining: number } | null {
  if (job.amountCents <= 0) return null;
  const st = contractStatement(job.amountCents, invoices.filter((i) => live(i) && i.jobId === job.id));
  return { contract: st.contract, paid: st.paid, remaining: st.remaining };
}

/**
 * «Ещё выставить» (client-card.html «Что надо решить» п.3): of every live job made from an approved estimate — what its contract
 * statement still has to bill. Computed by the engine (`contractStatement`), nothing new in the model.
 */
export function clientToBill(estimates: Estimate[], jobs: Job[], invoices: Invoice[]): number {
  let cents = 0;
  for (const e of estimates.filter((x) => x.status === "approved")) {
    const job = jobs.find((j) => j.estimateId === e.id && !j.cancelledAt);
    if (!job || job.amountCents <= 0) continue;
    cents += Math.max(0, contractStatement(job.amountCents, invoices.filter((i) => live(i) && i.jobId === job.id)).toInvoice);
  }
  return cents;
}

/** a visit of the client as «Сейчас» reads it */
export interface NowVisit {
  id: string;
  jobId?: string;
  start: string;
  durationMin: number;
  step: string;
  closed?: boolean;
  techId: string | null;
  customerNotifiedAt?: string;
}

/**
 * «Сейчас» — the one line in a frame (client-card.html (а), §6): what is with the client this minute. The order: a job going on
 * (a visit on site / working) → an overdue invoice → a job scheduled (its next visit) → an estimate waiting for the client →
 * a draft → a new lead → nothing. Archive and «do not service» have their own plate instead.
 */
export type ClientNow =
  | { kind: "working"; job: Job; visit: NowVisit }
  | { kind: "overdue"; invoice: Invoice; owesCents: number }
  | { kind: "scheduled"; job: Job; visit: NowVisit }
  | { kind: "waiting"; estimate: Estimate }
  | { kind: "draft"; estimate: Estimate }
  | { kind: "lead"; lead: { id: string; service?: string; receivedAt: string; source?: string } }
  | null;

export interface ClientNowInput {
  jobs: Job[];
  /** the client's visits the role sees, any order */
  visits: NowVisit[];
  invoices: Invoice[];
  estimates: Estimate[];
  leads: { id: string; status: string; service?: string; receivedAt: string; sourceId?: string }[];
  /** today's company day for «overdue» (YYYY-MM-DD) */
  today: string;
}

const openStep = (v: NowVisit) => !v.closed && v.step !== "paid" && v.step !== "done";

export function clientNowOf({ jobs, visits, invoices, estimates, leads, today }: ClientNowInput): ClientNow {
  const live = jobs.filter((j) => !j.cancelledAt && j.status !== "done");
  const jobOf = (v: NowVisit) => live.find((j) => j.id === v.jobId);
  const going = visits.filter((v) => openStep(v) && ["en_route", "on_site", "working"].includes(v.step) && jobOf(v)).sort((a, b) => a.start.localeCompare(b.start))[0];
  if (going) return { kind: "working", job: jobOf(going)!, visit: going };
  const overdue = invoices
    .filter((i) => i.status !== "void" && !!i.dueDate && i.dueDate < today)
    .map((invoice) => ({ invoice, owesCents: invoiceBalance(invoice).owesCents }))
    .filter((x) => x.owesCents > 0)
    .sort((a, b) => (a.invoice.dueDate ?? "").localeCompare(b.invoice.dueDate ?? ""))[0];
  if (overdue) return { kind: "overdue", ...overdue };
  const next = visits.filter((v) => openStep(v) && v.step === "scheduled" && jobOf(v) && v.start.slice(0, 10) >= today).sort((a, b) => a.start.localeCompare(b.start))[0];
  if (next) return { kind: "scheduled", job: jobOf(next)!, visit: next };
  const waiting = estimates.filter((e) => e.status === "sent" || e.status === "awaiting_countersign").sort(newest)[0];
  if (waiting) return { kind: "waiting", estimate: waiting };
  const draft = estimates.filter((e) => e.status === "draft").sort(newest)[0];
  if (draft) return { kind: "draft", estimate: draft };
  const lead = leads.filter((l) => l.status === "new" || l.status === "replied" || l.status === "booked").sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
  if (lead) return { kind: "lead", lead: { id: lead.id, service: lead.service, receivedAt: lead.receivedAt, source: lead.sourceId } };
  return null;
}

/** what the client is as a whole: the tiles and the plate follow it (client-card.html §6) */
export type ClientState = "new" | "active" | "owes" | "archived" | "noService";

export function clientStateOf(status: "prospect" | "active" | "archived" | "do_not_service", o: { owesCents: number; jobs: number; paidCents: number; toBillCents: number }): ClientState {
  if (status === "archived") return "archived";
  if (status === "do_not_service") return "noService";
  if (o.owesCents > 0) return "owes";
  if (o.jobs === 0 && o.paidCents === 0 && o.toBillCents === 0) return "new";
  return "active";
}

/** one tile of the 2×2 grid */
export type ClientTile = "debt" | "paid" | "toBill" | "nextVisit" | "contact" | "reminded" | "lastJob" | "approved" | "source" | "gate" | "onSite" | "tomorrow";

/**
 * The four tiles by role and state (client-card.html §6–§7, BUILD-SPEC §2.4): the office — Долг · Ещё выставить (or Оплачено всего
 * when nothing is left to bill) · Следующий выезд · Последний контакт («Напоминали» when the client owes); sales — Оплачено ·
 * Одобрено · Откуда · Контакт; the tech — Код · На месте · Завтра (the access note is the row under the tiles: a sentence does not
 * fit a 30 figure); archive — Оплачено · Последняя работа; a new client —
 * none (zeros say nothing).
 */
export function clientTileKeys(role: Role, state: ClientState, toBillCents: number): ClientTile[] {
  if (role === "tech") return ["gate", "onSite", "tomorrow"];
  if (state === "new") return [];
  if (state === "archived" || state === "noService") return ["paid", "lastJob"];
  if (role === "sales") return ["paid", "approved", "source", "contact"];
  return ["debt", toBillCents > 0 ? "toBill" : "paid", "nextVisit", state === "owes" ? "reminded" : "contact"];
}

/**
 * The one main step of the client (client-card.html §6–§7, BUILD-SPEC §2.4 table): the chain of `clientNextStep` plus the steps
 * the card adds — archive: «Вернуть в активные» (outlined, not a selling step); «do not service»: none (the plate says why);
 * the tech: «В путь» to his visit (prototype); a job scheduled whose time the client was not told: «Сообщить время» (prototype,
 * the SMS sheet), an estimate waiting for the client's answer: «Напомнить про смету» (its screen) — only when the chain itself
 * has nothing but «Новая смета».
 */
export type ClientMainStep = NextStep | { kind: "restore" } | { kind: "trip"; visitId: string } | { kind: "tellTime"; visit: NowVisit; job: Job } | { kind: "remind"; estimate: Estimate };

export function clientMainStep(o: { role: Role; state: ClientState; step: NextStep | null; now: ClientNow; techVisitId?: string }): ClientMainStep | null {
  if (o.state === "archived") return o.role === "tech" ? null : { kind: "restore" };
  if (o.state === "noService") return null;
  if (o.role === "tech") return o.techVisitId ? { kind: "trip", visitId: o.techVisitId } : null;
  if (o.step && o.step.kind !== "estimate") return o.step;
  if (o.now?.kind === "scheduled" && !o.now.visit.customerNotifiedAt && o.role !== "sales") return { kind: "tellTime", visit: o.now.visit, job: o.now.job };
  // an estimate is with the client and nothing else moves: remind him (BUILD-SPEC §2.4 «смета ждёт → Напомнить про смету»)
  if (o.now?.kind === "waiting") return { kind: "remind", estimate: o.now.estimate };
  return o.step;
}

/**
 * «Работа · 3 из 5 · 62 %» (visual v2 макеты 3–4, #2350 — progress in words, no bar): the items of the job's visits' checklists
 * ticked of all of them; a job with no checklist counts its visits closed of all. Nothing to count — null.
 */
export function workProgress(visits: { checklist: { done?: boolean }[]; step: string; closed?: boolean }[]): { done: number; total: number; pct: number } | null {
  const items = visits.flatMap((v) => v.checklist);
  const [done, total] = items.length
    ? [items.filter((i) => i.done).length, items.length]
    : [visits.filter((v) => v.closed || v.step === "paid" || v.step === "done").length, visits.length];
  if (!total) return null;
  return { done, total, pct: Math.round((done / total) * 100) };
}

/**
 * «Смета ✓ · задаток ✓ · работа» (макет 3): the job's way so far — the estimate approved, the deposit paid (only when the job has a
 * deposit invoice or the estimate asks one), the work done. The words are the screen's (i18n); this says which links are passed.
 */
export function jobChain(job: Job, estimate: Estimate | undefined, invoices: Invoice[]): { key: "estimate" | "deposit" | "work"; done: boolean }[] {
  const mine = invoices.filter((i) => live(i) && i.jobId === job.id);
  const deposits = mine.filter((i) => i.kind === "deposit");
  const out: { key: "estimate" | "deposit" | "work"; done: boolean }[] = [];
  if (estimate) out.push({ key: "estimate", done: estimate.status === "approved" });
  if (deposits.length || (estimate?.depositCents ?? 0) > 0) out.push({ key: "deposit", done: deposits.length > 0 && deposits.every((i) => i.paidCents >= i.totalCents) });
  out.push({ key: "work", done: job.status === "done" });
  return out;
}
