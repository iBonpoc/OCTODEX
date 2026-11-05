import { useEffect, useRef } from "react";
import { View } from "react-native";
import { router, usePathname } from "expo-router";
import { useStore } from "@/data/store";
import type { Notice } from "@/data/types";
import { useI18n } from "@/i18n";
import { NOTICE_ICON, noticeText } from "./noticeText";
import { Button } from "@/ui/controls";
import { useToast } from "@/ui/overlays";
import { SectionTitle } from "@/ui/surfaces";
import { ListCard } from "@/ui/listCard";
import { space } from "@octo/design-tokens";
import { lateNotices } from "./lateNotice";

export function useNoticeText() {
  const { t, money, time } = useI18n();
  return (n: Notice) => noticeText(n, { t, money, time });
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


/** Unread notices on the office «Today» (spec 06, PR9): one list card per event; «Pick a date» inside the card. */
export function NoticesCard() {
  const { db, readNotices, role } = useStore();
  const { t, day, money } = useI18n();
  const text = useNoticeText();
  // П3c: «running late» first — computed, not read by «Понятно», gone when the tech is on site (docs/specs/03)
  const late = lateNotices(db, role);
  const server = db.notices.filter((n) => !n.read).slice(0, 5);
  const unread = [...late, ...server];
  // amounts and client events are for the office only (spec 06 §7.6)
  if (role === "tech" || !unread.length) return null;
  const lateCard = (n: Notice) => (
    <ListCard
      key={n.id}
      testID="notice-card"
      title={text(n)}
      lead={{ kind: "icon", icon: NOTICE_ICON[n.kind], tone: "warn" }}
      status={{ tone: "warn", label: t(n.late === "en_route" ? "late.enRoute" : "late.notLeft") }}
      density="rich"
      onPress={() => router.push(`/visit/${n.visitId}`)}
    />
  );
  const card = (n: Notice) => {
    if (n.kind === "visit.late") return lateCard(n);
    const est = n.estimateId ? db.estimates.find((e) => e.id === n.estimateId) : undefined;
    const c = est ? db.customers.find((x) => x.id === est.customerId) : undefined;
    const prop = est ? db.properties.find((x) => x.id === est.propertyId) : undefined;
    const addr = prop ? `${prop.address}, ${prop.city}` : undefined;
    const viewed = n.kind === "estimate.viewed";
    const clientSigned = n.kind === "estimate.client_signed";
    const paid = n.kind === "deposit.paid" || n.kind === "invoice.paid";
    const cents = n.kind === "estimate.approved" || clientSigned ? n.totalCents : paid ? (n.depositCents ?? n.totalCents) : undefined;
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
        status={clientSigned ? { tone: "warn", label: t("est.awaitingCountersign") } : { tone: viewed ? "info" : "ok", label: viewed ? t("notice.viewedChip") : paid ? t("money.paid") : t("st.approved") }}
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
      <SectionTitle title={`${t("notice.title")} · ${unread.length}`} right={server.length ? <Button label={t("common.gotIt")} variant="ghost" size="sm" onPress={readNotices} /> : undefined} />
      <View style={{ gap: space[2] }}>{unread.map(card)}</View>
    </View>
  );
}
