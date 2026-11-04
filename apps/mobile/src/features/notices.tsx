import { useEffect, useRef } from "react";
import { View } from "react-native";
import { router, usePathname } from "expo-router";
import { useStore } from "@/data/store";
import type { Notice } from "@/data/types";
import { useI18n } from "@/i18n";
import { Button, StatusChip } from "@/ui/controls";
import { useToast } from "@/ui/overlays";
import { Card, Divider, ListRow, SectionTitle } from "@/ui/surfaces";

export function useNoticeText() {
  const { t, money } = useI18n();
  return (n: Notice) =>
    n.kind === "estimate.approved"
      ? t("notice.approved", { name: n.customer, total: money(n.totalCents ?? 0) })
      : n.kind === "deposit.paid"
        ? t("notice.deposit", { name: n.customer, amount: money(n.depositCents ?? 0) })
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

export function NoticesCard() {
  const { db, readNotices } = useStore();
  const { t, day } = useI18n();
  const text = useNoticeText();
  const unread = db.notices.filter((n) => !n.read).slice(0, 5);
  if (!unread.length) return null;
  return (
    <View>
      <SectionTitle title={t("notice.title")} right={<Button label={t("common.gotIt")} variant="ghost" size="sm" onPress={readNotices} />} />
      <Card>
        {unread.map((n, i) => (
          <View key={n.id}>
            {i > 0 ? <Divider /> : null}
            <ListRow
              title={text(n)}
              subtitle={day(n.at)}
              right={
                <StatusChip
                  status={n.kind === "estimate.viewed" ? "info" : "ok"}
                  label={n.kind === "estimate.viewed" ? t("notice.viewedChip") : n.kind === "deposit.paid" ? t("money.paid") : t("st.approved")}
                />
              }
              onPress={n.estimateId ? () => router.push(`/estimate/${n.estimateId}`) : undefined}
            />
          </View>
        ))}
      </Card>
    </View>
  );
}
