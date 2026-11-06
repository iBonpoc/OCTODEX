/** Technician's day: progress, what is happening now, what is next, money collected on site today. */
import { isAssigned, isOpenVisit } from "@/features/schedule";
import type { DB, Visit } from "@/data/types";
import { isoDayKey } from "./calendar";
import { dayKeyIn } from "./zone";

export interface TechDay {
  visits: Visit[];
  done: number;
  /** signed by the client, payment not recorded yet */
  awaitingPay: number;
  /** a visit already started (en route … signed) */
  current?: Visit;
  /** first visit not started yet */
  next?: Visit;
  collectedCents: number;
  /** checklist items left / photos taken over today's visits */
  checksLeft: number;
  photos: number;
}

export function techDay(db: DB, techId: string, now: Date = new Date()): TechDay {
  // today of the company, not of the phone (П4b)
  const today = dayKeyIn(now.getTime());
  const visits = db.visits
    .filter((v) => isAssigned(v, techId) && isoDayKey(v.start) === today)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return {
    visits,
    done: visits.filter((v) => v.step === "paid" || v.step === "done").length,
    awaitingPay: visits.filter((v) => v.step === "signed").length,
    current: visits.find((v) => v.step !== "scheduled" && isOpenVisit(v)),
    next: visits.find((v) => v.step === "scheduled"),
    collectedCents: visits.reduce((s, v) => s + (v.payment && isoDayKey(v.payment.at) === today ? v.payment.amountCents : 0), 0),
    checksLeft: visits.reduce((s, v) => s + v.checklist.filter((x) => !x.done).length, 0),
    photos: visits.reduce((s, v) => s + v.photos.length, 0),
  };
}
