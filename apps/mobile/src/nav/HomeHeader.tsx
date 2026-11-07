import { View } from "react-native";
import { router } from "expo-router";
import { component, radius, size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { Avatar } from "@/ui/controls";
import { Icon, Press, T } from "@/ui/primitives";
import { SyncBadge } from "@/ui/surfaces";
import { unreadCount } from "./notices";

/**
 * The right side of «Главная» (docs/specs/13 v2 §2.2, §3.14): the sync badge (only with a queue or no network),
 * the bell with the unread count (the office: notices are about clients and money; the technician has none yet),
 * the profile → My settings (phone; on 820/1280 the profile is at the bottom of the side menu).
 */
export function HomeHeader() {
  const { t } = useI18n();
  const { c } = useTheme();
  const { wide } = useDevice();
  const { db, role } = useStore();
  const me = db.members.find((m) => m.id === db.me);
  const n = unreadCount(db, role);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
      <SyncBadge compact />
      {role !== "tech" ? (
        <Press
          testID="home-bell"
          onPress={() => router.push("/notifications")}
          visibleHeight={component.dockBtn}
          accessibilityRole="button"
          accessibilityLabel={n ? t("nav.bellNew", { n }) : t("nav.bell")}
          style={{ width: component.dockBtn, height: component.dockBtn, borderRadius: radius.pill, backgroundColor: c.surf2, borderWidth: component.hairline, borderColor: c.bd, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="bell" s={size.iconMd} color={c.ink} />
          {n ? (
            // the count: a status colour with the number (rule 2: never colour alone)
            <View
              testID="home-bell-count"
              style={{ position: "absolute", top: -space[1], right: -space[1], minWidth: component.chip.h, height: component.chip.h, paddingHorizontal: space[1], borderRadius: radius.pill, backgroundColor: c.status.bad.fill, alignItems: "center", justifyContent: "center" }}
            >
              <T v="micro" w="semibold" tabular style={{ color: c.status.bad.on }}>
                {n > 99 ? "99+" : String(n)}
              </T>
            </View>
          ) : null}
        </Press>
      ) : null}
      {wide ? null : (
        <Press testID="home-profile" onPress={() => router.push("/settings/profile")} visibleHeight={component.dockBtn} accessibilityRole="button" accessibilityLabel={t("nav.profile")}>
          <Avatar initials={me?.initials ?? "··"} s={component.dockBtn} />
        </Press>
      )}
    </View>
  );
}
