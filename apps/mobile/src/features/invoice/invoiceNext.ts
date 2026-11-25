import { daysOverdue, isOverdue } from "@/data/selectors";
import type { DictKey } from "@/i18n";
import type { Invoice } from "@/data/types";

/**
 * «What now and what next» of an invoice card (DS §12.3 п.2, #1495): one line under the title, from the invoice's own facts —
 * overdue by N days (with the last reminder, or without), waiting for the due day (sent or not yet), paid in full.
 * Pure: the screen puts `key` through `t` with `params`.
 */
export type InvoiceNext = { key: DictKey; params?: Record<string, string | number> };

export function invoiceNext(
  inv: Pick<Invoice, "totalCents" | "paidCents" | "dueDate" | "sentAt">,
  lastReminderDay: string | undefined,
  dueDay: string,
  now = Date.now(),
  tz?: string,
): InvoiceNext {
  if (inv.paidCents >= inv.totalCents) return { key: "inv.next.paid" };
  if (inv.dueDate && isOverdue(inv.dueDate, now, tz)) {
    const d = daysOverdue(inv.dueDate, now, tz);
    return lastReminderDay ? { key: "inv.next.overdueReminded", params: { d, date: lastReminderDay } } : { key: "inv.next.overdueNoReminder", params: { d } };
  }
  return inv.sentAt ? { key: "inv.next.waiting", params: { date: dueDay } } : { key: "inv.next.notSent", params: { date: dueDay } };
}
