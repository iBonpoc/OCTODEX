import { APP_NAME } from "@/config/product";
import { useStore } from "@/data/store";
import type { Invoice } from "@/data/types";
import { docLanguageFor } from "@/data/people";
import { useI18n } from "@/i18n";
import { companyForPortal } from "@/cloud/portal";
import { invoicePageToken } from "@/features/docPdf";
import { reminderMessage } from "@/features/invoiceRemind";
import { clientLink, openEmail, openSms } from "@/features/sendEstimate";
import { useToast } from "@/ui/overlays";

/**
 * S20 reminders of an invoice, shared by the invoice's screen and «Деньги → Счета» (#2350): the text in the CLIENT's language
 * (rule 7), the phone's SMS / mail opened with it, the reminder logged in the client's feed with «Отменить» (rule 5).
 * `all` — «Напомнить всем · N»: each one logged (by SMS where there is a phone, else email) under one «Отменить»; the phone opens
 * no message for a batch — the server's automatic sending is a later step, the toast says «отмечены».
 */
export function useInvoiceRemind() {
  const store = useStore();
  const { db } = store;
  const { t } = useI18n();
  const toast = useToast();
  const customer = (inv: Pick<Invoice, "customerId">) => db.customers.find((c) => c.id === inv.customerId);
  const reachable = (customerId: string) => {
    const c = db.customers.find((x) => x.id === customerId);
    return !!(c?.phone || c?.email);
  };
  const text = (inv: Invoice) => {
    const company = companyForPortal(db, store.companyName ?? APP_NAME);
    const token = invoicePageToken(db, inv);
    return reminderMessage(db, inv, company.name, docLanguageFor(db, { customerId: inv.customerId }), Date.now(), token ? clientLink(token) : undefined);
  };
  const one = (inv: Invoice, channel?: "sms" | "email") => {
    const c = customer(inv);
    const ch = channel ?? (c?.phone ? "sms" : "email");
    if (!c || (ch === "sms" ? !c.phone : !c.email)) return;
    const m = text(inv);
    (ch === "sms" ? openSms(c.phone, m.text) : openEmail(c.email!, m.subject, m.text)).catch(() => {});
    const undo = store.remindInvoice(inv.id, ch);
    toast.show(store.online ? t("mny.remind.done") : t("offline.queued"), undo);
  };
  const all = (invs: Invoice[]) => {
    const undos = invs.map((i) => store.remindInvoice(i.id, customer(i)?.phone ? "sms" : "email"));
    toast.show(store.online ? t("proto.money.remindAllDone", { n: invs.length }) : t("offline.queued"), store.undoTogether(undos));
  };
  return { one, all, text, reachable };
}
