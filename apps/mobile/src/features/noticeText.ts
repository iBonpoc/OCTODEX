/** Notices of the office: the line and the icon of each kind (pure; unit-tested in test/notices.test.ts). */
import type { Notice } from "@/data/types";
import type { DictKey } from "@/i18n";
import type { IconKey } from "@/ui/primitives";

type Fmt = { t: (k: DictKey, p?: Record<string, string | number>) => string; money: (c: number) => string; time: (iso: string) => string };

/** The one line of a notice (pure: unit-tested in test/notices.test.ts) */
export function noticeText(n: Notice, { t, money, time }: Fmt): string {
  switch (n.kind) {
    case "visit.late":
      return t(n.late === "not_left" ? "late.notice.notLeft" : n.lateAt ? "late.notice.enRoute" : "late.notice.enRouteNoTime", { tech: n.tech ?? "", client: n.customer, time: n.lateAt ? time(n.lateAt) : "" });
    case "estimate.approved":
      return t("notice.approved", { name: n.customer, total: money(n.totalCents ?? 0) }) + " " + t("notice.pickDate");
    // E2a: the client signed on their page; the company signs next (S8 → S8b)
    case "estimate.client_signed":
      return t("notice.clientSigned", { name: n.customer, total: money(n.totalCents ?? 0) });
    case "deposit.paid":
      return t("notice.deposit", { name: n.customer, amount: money(n.depositCents ?? 0) });
    case "invoice.paid":
      return t("notice.invoicePaid", { name: n.customer, amount: money(n.totalCents ?? 0) });
    case "estimate.viewed":
      return t("notice.viewed", { name: n.customer });
  }
}

export const NOTICE_ICON: Record<Notice["kind"], IconKey> = {
  "estimate.viewed": "eye",
  "estimate.approved": "signature",
  "estimate.client_signed": "signature",
  "deposit.paid": "wallet",
  "invoice.paid": "wallet",
  "visit.late": "clock",
};
