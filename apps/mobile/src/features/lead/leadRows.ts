/**
 * The words of a lead in the prototype v2 list and object (wireframes-v2 №16, object-cards «Лид»): pure, no React.
 * - `fmtWait` — «12 мин», «3 ч», «2 дн» (`waitShort`);
 * - `leadWaitLabel` — how long the client waits for our reply, the StatusPill on the right of the row («12 мин»), null when it is not our reply;
 * - `leadRowLine` — the one line under the name: «где он сейчас · что нужно · город» (a new lead — only «что · город»: the pill says the wait).
 */
import type { Lead } from "@/data/types";
import type { DictKey } from "@/i18n";
import { isClosedLead, leadStatusView, type LeadTurn } from "@/features/leads";
import { waitShort } from "@/features/shortTime";

type Tr = (k: DictKey, p?: Record<string, string | number>) => string;

/** "12 min", "3 h", "2 d" — the one short wait of the app (features/shortTime.ts) */
export const fmtWait = (m: number, t: Tr): string => waitShort(m, t);

/** the client waits for us: «12 мин» (the turn's colour goes with it); otherwise null */
export function leadWaitLabel(turn: LeadTurn, t: Tr): string | null {
  return turn.kind === "reply" ? fmtWait(turn.minutes, t) : null;
}

/**
 * Where the wait stands in the row (wireframes-v2 №16 «сколько минут без ответа — первым словом строки»; audit 2.3 «плашка — только
 * где горит»): late (`bad`) — a StatusPill on the right; in time — the first word of the line, no pill (the name keeps its room at 390).
 */
export function leadWaitPlace(turn: LeadTurn): "pill" | "line" | null {
  if (turn.kind !== "reply") return null;
  return turn.status === "bad" ? "pill" : "line";
}

/** what the client asked for, short: the service, else the first words of the message */
export function leadWhat(l: Pick<Lead, "service" | "message">, max = 32): string {
  const s = (l.service ?? "").trim();
  if (s) return s;
  const m = (l.message ?? "").trim().replace(/\s+/g, " ");
  return m.length > max ? `${m.slice(0, max - 1).trimEnd()}…` : m;
}

/** «Ответили · Interior painting · Arcadia»; the status word is left out for a new lead (the pill tells the wait) */
export function leadRowLine(l: Lead, turn: LeadTurn, o: { t: Tr; day: (iso: string) => string; source?: string }): string {
  const { t } = o;
  const where =
    turn.kind === "snoozed"
      ? t("lead.turn.snoozed", { date: o.day(turn.until) })
      : isClosedLead(l) && l.lostReason
        ? l.lostReason === "other" && l.lostReasonText
          ? l.lostReasonText
          : t(`lead.reason.${l.lostReason}` as DictKey)
        : turn.kind === "reply" || l.status === "new" || l.status === "won" || isClosedLead(l)
          ? ""
          : t(leadStatusView[l.status].label);
  return [where, leadWhat(l) || o.source, l.city].filter(Boolean).join(" · ");
}

/** the one main step of the lead (object-cards «Лид», «Порядок главной в коде») */
export type LeadStep = "reply" | "client" | "next" | "lowOrWait" | "remind" | "estimate" | "tasks" | "unsnooze" | "reopen";

/**
 * Ответить → Открыть клиента (не обслуживаем) → Что дальше? → Потерян или подождать? → Напомнить про смету → Составить смету
 * (записан на оценку, не мастер) → Задачи → Вернуть сейчас → Вернуть в работу; a won lead — «Открыть клиента». The same order the
 * card had (LeadCardBody before #2350), only one place now: the bar at the bottom.
 */
export function leadStepOf(l: Pick<Lead, "status" | "customerId">, turn: LeadTurn, o: { servable: boolean; tech: boolean; lostReason?: boolean }): LeadStep | null {
  if (turn.kind === "reply") return "reply";
  if (!o.servable && l.customerId && !isClosedLead(l as Lead)) return "client";
  if (turn.kind === "noStep") return "next";
  if (turn.kind === "wait") return turn.action === "lostOrWait" ? "lowOrWait" : "remind";
  if (turn.kind === "step") return l.status === "booked" && !o.tech ? "estimate" : "tasks";
  if (turn.kind === "snoozed") return "unsnooze";
  if (isClosedLead(l as Lead)) return "reopen";
  return l.customerId ? "client" : null;
}
