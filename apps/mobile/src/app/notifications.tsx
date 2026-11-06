import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { useNoticeCard } from "@/features/notices";
import { bellNotices } from "@/nav/notices";
import { Button } from "@/ui/controls";
import { CardList, Empty, Screen, SectionTitle } from "@/ui/surfaces";

/**
 * «Уведомления» — the bell on «Главная» (docs/specs/13 v2 §3.14): one card per event, each opens its object
 * (estimate, job, late visit). New first, read below. The same notices and cards as «Сегодня» (features/notices).
 */
export default function Notifications() {
  const { t } = useI18n();
  const { db, role, readNotices } = useStore();
  const card = useNoticeCard();
  const { unread, read } = bellNotices(db, role);
  const anyServerUnread = unread.some((n) => n.kind !== "visit.late");
  return (
    <Screen
      title={t("notice.title")}
      right={anyServerUnread ? <Button label={t("nav.notices.readAll")} icon="check" size="sm" variant="ghost" onPress={readNotices} /> : undefined}
    >
      {!unread.length && !read.length ? (
        <Empty icon="bell" title={t("nav.notices.empty")} hint={t("nav.notices.emptyHint")} />
      ) : (
        <View style={{ gap: space[3] }}>
          {unread.length ? <CardList>{unread.map(card)}</CardList> : null}
          {read.length ? (
            <View>
              <SectionTitle title={t("nav.notices.earlier")} />
              <View style={{ marginTop: space[2] }}>
                <CardList>{read.map(card)}</CardList>
              </View>
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
