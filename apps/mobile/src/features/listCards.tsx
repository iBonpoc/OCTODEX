/**
 * One card per object, wherever it is listed (docs/specs/06-list-cards.md, PR10b): the lead, estimate, invoice and payment cards
 * of the main lists, shared with the lists behind the «Today» figures. Same facts, same amount, same status — only the screen's
 * own actions (status picker, call result, reply) are passed in by the screen that has them.
 */
import { findJob } from "@/data/jobs";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import type { DictKey } from "@/i18n";
import { useI18n } from "@/i18n";
import type { Estimate, Invoice, Lead, Payment } from "@/data/types";
import { estimateStatusView } from "@/features/estimateStatus";
import { estimateListAmount } from "@/features/estimateDoc";
import { estimateSigns, invoiceSigns, leadSigns } from "@/features/listSigns";
import { invoiceBalance, invoiceStatusView } from "@/features/invoiceStatus";
import { estimateGroup } from "@/features/listGroups";
import { leadStatusView, needsNextStep, openTasks, sourceName, waitingMinutes, waitStatus } from "@/features/leads";
import { ListCard, type CardSign } from "@/ui/listCard";
import type { ContactAction, Density, FactKey } from "@/ui/listCardLayout";
import type { DB } from "@/data/types";

type T = ReturnType<typeof useI18n>["t"];

/** desktop row columns (spec 06 §5) */
export const LEAD_COLUMNS: FactKey[] = ["phone", "src", "svc", "next"];
export const EST_COLUMNS: FactKey[] = ["addr", "work", "valid"];
export const INV_COLUMNS: FactKey[] = ["addr", "work", "due"];
export const PAY_COLUMNS: FactKey[] = ["num", "method"];

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

/** one sign per lead card, most urgent first: waiting for a reply → no answer ×N → no next step */
export function leadCardSign(db: DB, l: Lead, t: T): CardSign | undefined {
  const w = waitingMinutes(l);
  if (w !== null) {
    const tone = waitStatus(w);
    if (tone === "warn" || tone === "bad") return { tone, label: t("inbox.waiting", { m: w }) };
  }
  const missed = leadSigns(l)[0];
  if (missed) return { tone: missed.tone, label: t(missed.key, missed.params) };
  if (needsNextStep(db, l)) return { tone: "warn", label: t("card.sign.noNextStep") };
  return undefined;
}

export function LeadListCard({ l, density, showResp, onStatus, onContact, onReply }: {
  l: Lead;
  density: Density;
  /** «Responsible» only when the company has a team and the list is not «mine» */
  showResp?: boolean;
  onStatus?: () => void;
  onContact?: (a: ContactAction) => void;
  onReply?: () => void;
}) {
  const { db, role } = useStore();
  const { t, day, money } = useI18n();
  const office = role !== "tech";
  const sv = leadStatusView[l.status];
  const sign = leadCardSign(db, l, t);
  const task = openTasks(db, l.id)[0];
  const addr = [l.address, [l.city, [l.state, l.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  const cost = office && (l.costCents ?? 0) > 0 ? ` — ${money(l.costCents ?? 0)}` : "";
  const waiting = waitingMinutes(l) !== null;
  return (
    <ListCard
      title={l.name}
      when={waiting ? undefined : day(l.receivedAt)}
      lead={{ kind: "initials", text: initials(l.name) }}
      status={{ tone: sv.status, label: t(sv.label), onPress: onStatus }}
      signs={sign ? [sign] : undefined}
      facts={{
        num: l.number,
        phone: l.phone,
        email: l.phone ? undefined : l.email,
        addr,
        src: `${sourceName(db, l.sourceId)}${cost}`,
        svc: l.service ?? l.message,
        resp: showResp ? db.members.find((m) => m.id === l.assigneeId)?.name : undefined,
        next: task ? [task.title, task.dueAt ? day(task.dueAt) : ""].filter(Boolean).join(" · ") : undefined,
      }}
      contact={{ phone: l.phone, email: l.email, addr }}
      onContact={onContact}
      action={l.status === "new" && onReply ? { label: t("inbox.reply"), onPress: onReply } : undefined}
      density={density}
      columns={LEAD_COLUMNS}
      onPress={() => router.push(`/lead/${l.id}`)}
    />
  );
}

export function EstimateListCard({ e, density }: { e: Estimate; density: Density }) {
  const { db } = useStore();
  const { t, money, day } = useI18n();
  const c = db.customers.find((x) => x.id === e.customerId);
  const prop = db.properties.find((x) => x.id === e.propertyId);
  const v = estimateStatusView(e.status);
  const sign = estimateSigns(e, Date.now())[0];
  // amount rule of the estimates chat: signed option / «from» the cheapest / the total (money through the engine)
  const amount = estimateListAmount(e);
  const addr = prop ? `${prop.address}, ${prop.city}` : undefined;
  // the last event under the name: signed / opened / sent
  const when = e.approval ? `${t(v.l)} ${day(e.approval.at)}` : e.viewedAt ? t("ue.viewed", { date: day(e.viewedAt) }) : e.sentAt ? `${t("st.sent")} ${day(e.sentAt)}` : undefined;
  const open = estimateGroup(e, Date.now()) !== "done";
  return (
    <ListCard
      title={c?.name ?? "—"}
      when={when}
      lead={{ kind: "icon", icon: "doc" }}
      value={amount.from ? t("card.fromAmount", { amount: money(amount.cents) }) : money(amount.cents)}
      valueLabel={amount.option ?? t("card.val.total")}
      // read only: an estimate has no hand moves in the store (statusMoves); new statuses come from estimateStatusView
      status={{ tone: v.s, label: t(v.l) }}
      signs={sign ? [{ tone: sign.tone, label: t(sign.key, sign.params) }] : undefined}
      // edge only for what needs the contractor: a sign or our signature; a declined estimate is done, no red edge
      edge={sign ? sign.tone : e.status === "awaiting_countersign" ? "warn" : null}
      tags={e.doc && e.doc.options.length > 1 && !e.approval ? [t("ue.nOptions", { n: e.doc.options.length })] : undefined}
      facts={{
        num: e.number,
        phone: c?.phone,
        email: c?.phone ? undefined : c?.email,
        addr,
        work: e.title,
        valid: open && e.validUntil && !e.approval ? day(e.validUntil) : undefined,
      }}
      // contact buttons only open the phone / map / mail: an estimate has no «touch» in the store, nothing is written
      contact={{ phone: c?.phone, email: c?.email, addr }}
      density={density}
      columns={EST_COLUMNS}
      onPress={() => router.push(`/estimate/${e.id}`)}
    />
  );
}

export function InvoiceListCard({ i, density }: { i: Invoice; density: Density }) {
  const { db } = useStore();
  const { t, money, day } = useI18n();
  const c = db.customers.find((x) => x.id === i.customerId);
  const job = findJob(db, i.jobId);
  const prop = job ? db.properties.find((x) => x.id === job.propertyId) : undefined;
  const v = invoiceStatusView(i);
  const { owesCents } = invoiceBalance(i);
  const sign = invoiceSigns(i, Date.now())[0];
  const addr = prop ? `${prop.address}, ${prop.city}` : undefined;
  const what = [i.title ?? (i.kind === "deposit" ? t("money.deposit") : undefined), job?.title].filter(Boolean).join(" · ");
  const open = owesCents > 0;
  return (
    <ListCard
      title={c?.name ?? "—"}
      when={!open && i.paidAt ? t("money.paidOn", { date: day(i.paidAt) }) : undefined}
      lead={{ kind: "icon", icon: "invoice" }}
      value={money(open ? owesCents : i.paidCents)}
      valueLabel={open ? t("card.val.toPay") : t("card.val.paid")}
      // read only: an invoice status is derived from the balance (map §5), the one place is invoiceStatusView
      status={{ tone: v.s, label: t(v.l) }}
      signs={sign ? [{ tone: sign.tone, label: t(sign.key, sign.params) }] : undefined}
      // edge only for what needs action (overdue / due soon); a paid invoice has none
      edge={sign ? sign.tone : null}
      facts={{ num: i.number, phone: c?.phone, email: c?.phone ? undefined : c?.email, addr, work: what || undefined, due: open ? day(i.dueDate) : undefined }}
      figures={open ? [{ label: t("card.fig.total"), value: money(i.totalCents) }, { label: t("st.paid"), value: money(i.paidCents) }] : undefined}
      progress={open && i.paidCents > 0 ? { value: i.paidCents, max: i.totalCents, label: t("inv.paidPart", { amount: money(i.paidCents) }) } : undefined}
      // contact buttons only open the phone / map / mail: nothing is written for an invoice
      contact={{ phone: c?.phone, email: c?.email, addr }}
      // secondary: the one accent of the screen stays the main action of the screen
      action={open ? { label: t("visit.recordPayment"), icon: "wallet", onPress: () => router.push(`/invoice/${i.id}`) } : undefined}
      density={density}
      columns={INV_COLUMNS}
      onPress={() => router.push(`/invoice/${i.id}`)}
    />
  );
}

/** a payment received (a receipt): client, receipt number, method, date, «+» amount → the receipt */
export function PaymentListCard({ x, density }: { x: Payment; density: Density }) {
  const { db } = useStore();
  const { t, money, day } = useI18n();
  const c = db.customers.find((y) => y.id === x.customerId);
  const inv = db.invoices.find((i) => i.id === x.invoiceId);
  return (
    <ListCard
      title={c?.name ?? "—"}
      when={day(x.at)}
      lead={{ kind: "icon", icon: "wallet" }}
      value={`+${money(x.amountCents)}`}
      valueTone="ok"
      valueLabel={t("card.val.paid")}
      facts={{
        num: x.receiptNumber,
        method: [t(`pay.${x.method}` as DictKey), x.reference].filter(Boolean).join(" · "),
        links: inv?.number,
        phone: c?.phone,
      }}
      contact={{ phone: c?.phone, email: c?.email }}
      density={density}
      columns={PAY_COLUMNS}
      onPress={() => router.push(`/receipt/${x.id}`)}
    />
  );
}
