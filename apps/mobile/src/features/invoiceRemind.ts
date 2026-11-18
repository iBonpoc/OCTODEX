/**
 * «Напомнить» about an invoice (S20, wave 8, docs/specs/18-money-reports.md §2): the text goes to the CLIENT, so it is in the
 * client's language (rule 7: tFor(docLanguageFor(...))), money and dates in US format. Unit-tested in test/invoiceRemind.test.ts.
 */
import type { DB, Invoice } from "@/data/types";
import type { DocLang } from "@/i18n/translate";
import { tFor } from "@/i18n/translate";
import { docDay, docMoney, paymentHow } from "./docPdf";
import { invoiceBalance } from "./invoiceStatus";
import { daysOverdue } from "./moneyLists";

export function reminderMessage(
  db: Pick<DB, "company">,
  inv: Pick<Invoice, "number" | "totalCents" | "paidCents" | "dueDate">,
  companyName: string,
  lang: DocLang,
  now: number = Date.now(),
  link?: string,
): { text: string; subject: string } {
  const t = tFor(lang);
  // #2017: no «How to pay: —» — without Zelle or «checks payable to» the line is left out
  const how = paymentHow(db, t);
  const late = daysOverdue(inv, now);
  const params = { company: companyName, number: inv.number ?? "", amount: docMoney(invoiceBalance(inv).owesCents), date: docDay(inv.dueDate), days: late, how };
  const text = how ? (late > 0 ? t("mny.msg.overdue", params) : t("mny.msg.due", params)) : late > 0 ? t("invMsg.overdueNoHow", params) : t("invMsg.dueNoHow", params);
  return {
    text: link ? `${text} ${t("invMsg.payLink", { link })}` : text,
    subject: t("mny.msg.subject", { number: inv.number ?? "" }).trim(),
  };
}

/** reminders already sent about this invoice, newest first (events of the client's feed linked by meta.invoiceId) */
export const remindersOf = (db: Pick<DB, "activities">, invoiceId: string) =>
  db.activities.filter((a) => a.subjectType === "customer" && a.meta?.reminder === "1" && a.meta?.invoiceId === invoiceId).sort((a, b) => b.at.localeCompare(a.at));
