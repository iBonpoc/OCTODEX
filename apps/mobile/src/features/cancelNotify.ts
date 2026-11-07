import { docLanguageFor } from "@/data/people";
import { visitContext } from "@/data/selectors";
import type { CancelledVisit, DB, ID, MessageInput } from "@/data/types";
import { tFor } from "@/i18n/translate";
import { clientDate, companyTime, companyTz } from "@/features/scheduleSettings";

/**
 * «Сообщить клиенту?» after a cancelled inspection or job visit (docs/specs/03 §7.4, §13; S4a / S9a).
 * The visit has left `visits` (store.cancelVisit keeps it in `cancelledVisits`), so everything is read from there.
 * The text is in the CLIENT's language (rule 7), dates and times in the company's zone, en-US. We never send it
 * ourselves: SMS / email open the phone's app; the sending is written as an `sms` / `email` event (spec 20), not as
 * `customer_notified_at` — that field means «the booking was confirmed» (03 §13.2 №12).
 */
export type CancelNotice = {
  visit: CancelledVisit;
  text: string;
  phone?: string;
  email?: string;
  /** where the event goes: the lead of an inspection, else the job, else the client */
  subject: Pick<MessageInput, "subjectType" | "subjectId"> | null;
};

export function cancelledVisitOf(db: Pick<DB, "cancelledVisits">, visitId: ID): CancelledVisit | undefined {
  return (db.cancelledVisits ?? []).find((v) => v.id === visitId);
}

export function cancelNotice(db: DB, visitId: ID): CancelNotice | null {
  const v = cancelledVisitOf(db, visitId);
  if (!v) return null;
  const ctx = visitContext(db, v);
  const lead = v.leadId ? db.leads.find((l) => l.id === v.leadId) : undefined;
  const ct = tFor(docLanguageFor(db, { customerId: ctx.customer?.id, leadId: v.leadId }));
  const tz = companyTz(db.company);
  const name = (ctx.customer?.name ?? lead?.name ?? "").split(" ")[0] ?? "";
  const company = db.company?.name ?? "";
  const date = clientDate(v.start, tz);
  const insp = v.kind === "inspection" || !v.jobId;
  // «Весь день»: the date only, no hour (17-job §11.1)
  const text = v.allDay
    ? ct(insp ? "visitP2.msg.cancelInspectionDay" : "visitP2.msg.cancelJobDay", { name, company, date })
    : ct(insp ? "visitP2.msg.cancelInspection" : "visitP2.msg.cancelJob", { name, company, date, time: companyTime(v.start, tz) });
  const subject: CancelNotice["subject"] = lead
    ? { subjectType: "lead", subjectId: lead.id }
    : ctx.job
    ? { subjectType: "job", subjectId: ctx.job.id }
    : ctx.customer
    ? { subjectType: "customer", subjectId: ctx.customer.id }
    : null;
  return { visit: v, text, phone: ctx.customer?.phone ?? lead?.phone, email: ctx.customer?.email ?? lead?.email, subject };
}
