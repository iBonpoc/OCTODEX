import type { StatusName } from "@octo/design-tokens";
import type { Visit, VisitStep } from "@/data/types";
import type { DictKey } from "@/i18n";
import { lateKind, liveAssignees, type People } from "@/features/schedule";

/** Visit status → DS status color (4+1) and word. */
export function visitStatus(v: Visit, members: People, now: number = Date.now(), lateAfterMin?: number, dueCents?: number): { status: StatusName; label: DictKey } {
  // nobody who can come — nobody, or only someone switched off or deleted (S22): one rule everywhere (schedule.ts)
  if (!liveAssignees(v, members).length) return { status: "warn", label: "st.unassigned" };
  // one rule for the chip, the list sign, «Требует внимания» and the office notice (docs/specs/03 П3c)
  // the window is over and nobody started: «Пропущен», not «Опаздывает» for ever (prototype audit 12 §2.3)
  if (visitMissed(v, members, now)) return { status: "bad", label: "st.missed" };
  const late = lateKind(v, members, now, lateAfterMin);
  if (late) return { status: "warn", label: late === "en_route" ? "late.enRoute" : "late.notLeft" };
  const map: Record<VisitStep, { status: StatusName; label: DictKey }> = {
    scheduled: { status: "neutral", label: "st.scheduled" },
    en_route: { status: "info", label: "st.en_route" },
    on_site: { status: "info", label: "st.on_site" },
    working: { status: "info", label: "st.working" },
    signed: { status: "warn", label: "st.awaiting" },
    paid: { status: "ok", label: "st.paid" },
    // an inspection ends with "done" (no signature, no payment)
    done: { status: "ok", label: "st.done" },
  };
  // #2055: «Подпись» with nothing to pay waits for «Закрыть выезд», not for a payment; a visit closed so took no money
  if (v.step === "signed" && dueCents !== undefined && !(dueCents > 0)) return { status: "info", label: "st.signedToClose" };
  if (v.step === "paid" && v.payment && !(v.payment.amountCents > 0)) return { status: "ok", label: "st.done" };
  return map[v.step];
}

/**
 * «Пропущен» (prototype audit 12 §2.3): a visit nobody started whose planned window (start + length) is over — the same «not
 * started» as lateKind (not on the way, nothing done on the checklist, people at work), but past the end, not past the threshold.
 * On the way past the window stays «Опаздывает · в пути»: the tech is coming. A whole-day visit has no window to miss.
 */
export function visitMissed(v: Visit, members: People, now: number = Date.now()): boolean {
  if (v.closed || v.step !== "scheduled" || v.allDay) return false;
  if (!liveAssignees(v, members).length || v.checklist?.some((c) => c.done || !!c.na || (c.photoIds?.length ?? 0) > 0)) return false;
  const end = new Date(v.start).getTime() + (v.durationMin || 0) * 60_000;
  return !Number.isNaN(end) && now >= end;
}
