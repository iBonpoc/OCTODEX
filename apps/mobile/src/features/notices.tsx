import { useEffect, useRef } from "react";
import { View } from "react-native";
import { router, usePathname } from "expo-router";
import { useStore } from "@/data/store";
import type { Notice } from "@/data/types";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { useToast } from "@/ui/overlays";
import { SectionTitle } from "@/ui/surfaces";
import { ListCard } from "@/ui/listCard";
import type { IconKey } from "@/ui/primitives";
import { space } from "@octo/design-tokens";

export function useNoticeText() {
  const { t, money } = useI18n();
  return (n: Notice) =>
    n.kind === "estimate.approved"
      ? t("notice.approved", { name: n.customer, total: money(n.totalCents ?? 0) }) + " " + t("notice.pickDate")
      : n.kind === "deposit.paid"
        ? t("notice.deposit", { name: n.customer, amount: money(n.depositCents ?? 0) })
        : n.kind === "invoice.paid"
          ? t("notice.invoicePaid", { name: n.customer, amount: money(n.totalCents ?? 0) })
        : t("notice.viewed", { name: n.customer });
}

/** Toast when a new notice arrives (client opened / approved an estimate). Office roles only. */
export function NoticeWatcher() {
  const { db, role } = useStore();
  const toast = useToast();
  const text = useNoticeText();
  const seen = useRef<Set<string> | null>(null);
  const path = usePathname();
  const onClientPage = path.startsWith("/p/");
  useEffect(() => {
    const ids = db.notices.map((n) => n.id);
    if (!seen.current) {
      seen.current = new Set(ids);
      return;
    }
    const fresh = db.notices.filter((n) => !seen.current!.has(n.id) && !n.read);
    ids.forEach((id) => seen.current!.add(id));
    if (role !== "tech" && !onClientPage && fresh[0]) toast.show(text(fresh[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.notices]);
  return null;
}

const NOTICE_ICON: Record<Notice["kind"], IconKey> = {
  "estimate.viewed": "eye",
  "estimate.approved": "signature",
  "deposit.paid": "wallet",
  "invoice.paid": "wallet",
};

/** Unread notices on the office «Today» (spec 06, PR9): one list card per event; «Pick a date» inside the card. */
export function NoticesCard() {
  const { db, readNotices, role } = useStore();
  const { t, day, money } = useI18n();
  const unread = db.notices.filter((n) => !n.read).slice(0, 5);
  // amounts and client events are for the office only (spec 06 §7.6)
  if (role === "tech" || !unread.length) return null;
  const card = (n: Notice) => {
    const est = n.estimateId ? db.estimates.find((e) => e.id === n.estimateId) : undefined;
    const c = est ? db.customers.find((x) => x.id === est.customerId) : undefined;
    const prop = est ? db.properties.find((x) => x.id === est.propertyId) : undefined;
    const addr = prop ? `${prop.address}, ${prop.city}` : undefined;
    const viewed = n.kind === "estimate.viewed";
    const paid = n.kind === "deposit.paid" || n.kind === "invoice.paid";
    const cents = n.kind === "estimate.approved" ? n.totalCents : paid ? (n.depositCents ?? n.totalCents) : undefined;
    const needsDate = n.kind === "estimate.approved" && !!n.jobId && !db.visits.some((v) => v.jobId === n.jobId);
    return (
      <ListCard
        key={n.id}
        testID="notice-card"
        title={n.customer || c?.name || "—"}
        when={day(n.at)}
        lead={{ kind: "icon", icon: NOTICE_ICON[n.kind] }}
        value={cents ? money(cents) : undefined}
        valueLabel={cents ? (n.kind === "deposit.paid" ? t("card.val.deposit") : paid ? t("card.val.paid") : t("card.val.total")) : undefined}
        // read only: the notice tells what the client did, nothing to move by hand
        status={{ tone: viewed ? "info" : "ok", label: viewed ? t("notice.viewedChip") : paid ? t("money.paid") : t("st.approved") }}
        facts={{ num: est?.number, phone: c?.phone, addr, work: est?.title }}
        contact={{ phone: c?.phone, email: c?.email, addr }}
        action={needsDate ? { label: t("sch.title"), icon: "calendar", onPress: () => router.push(`/job/schedule?jobId=${n.jobId}`) } : undefined}
        density="rich"
        onPress={n.estimateId ? () => router.push(`/estimate/${n.estimateId}`) : undefined}
      />
    );
  };
  return (
    <View>
      <SectionTitle title={`${t("notice.title")} · ${unread.length}`} right={<Button label={t("common.gotIt")} variant="ghost" size="sm" onPress={readNotices} />} />
      <View style={{ gap: space[2] }}>{unread.map(card)}</View>
    </View>
  );
}
