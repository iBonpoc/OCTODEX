import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { useDevice } from "@/theme/ThemeProvider";
import { HeaderIcon } from "@/ui/headerIcon";
import { SyncBadge } from "@/ui/surfaces";
import { unreadCount } from "./notices";
import { SearchIcon } from "./HeaderIcons";

/**
 * The right side of a role's «Главная» row (docs/specs/13 v2 §2.2, §3.14; visual-v2 «Корень вкладки»): the sync badge (only with a
 * queue or no network), search (phone; 820/1280 have the «Искать везде» line), the bell with the unread count (the office: notices
 * are about clients and money; the technician has none yet) — circles 40 of the one header (HeaderButton). The profile is the
 * avatar on the LEFT of the row now (→ «Ещё»; on 820/1280 it is at the bottom of the side menu).
 */
export function HomeHeader() {
  const { t } = useI18n();
  const { wide } = useDevice();
  const { db, role } = useStore();
  const n = unreadCount(db, role);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
      <SyncBadge compact />
      {wide ? null : <SearchIcon />}
      {role !== "tech" ? (
        <HeaderIcon action={{ icon: "bell", a11y: n ? t("nav.bellNew", { n }) : t("nav.bell"), onPress: () => router.push("/notifications"), testID: "home-bell", badge: n ? { n } : undefined }} />
      ) : null}
    </View>
  );
}
