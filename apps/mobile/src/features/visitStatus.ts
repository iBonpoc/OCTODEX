import type { StatusName } from "@octo/design-tokens";
import type { Visit, VisitStep } from "@/data/types";
import type { DictKey } from "@/i18n";
import { lateKind, liveAssignees, type People } from "@/features/schedule";

/** Visit status → DS status color (4+1) and word. */
export function visitStatus(v: Visit, members: People, now: number = Date.now(), lateAfterMin?: number, dueCents?: number): { status: StatusName; label: DictKey } {
  // nobody who can come — nobody, or only someone switched off or deleted (S22): one rule everywhere (schedule.ts)
  if (!liveAssignees(v, members).length) return { status: "warn", label: "st.unassigned" };
  // one rule for the chip, the list sign, «Требует внимания» and the office notice (docs/specs/03 П3c)
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
  // «Оплачено» only with money actually taken (else «Готово»): a visit closed with no payment — $0 due (#2055), or sales closing it for the
  // office to take the money (#2018 С2), or the server's «completed» with no payment row after a reload — is «Готово»
  if (v.step === "paid" && !(v.payment && v.payment.amountCents > 0)) return { status: "ok", label: "st.done" };
  return map[v.step];
}
