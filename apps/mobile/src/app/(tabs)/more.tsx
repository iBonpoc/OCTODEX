import { View } from "react-native";
import { component, layout, radius, size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useAuth } from "@/cloud/auth";
import { useI18n } from "@/i18n";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { GROUP_TITLE, useContentWidth } from "@/nav/NavMenu";
import { openSection } from "@/nav/go";
import { menuGroups, sectionHref, type Section } from "@/nav/sections";
import { syncState } from "@/nav/shell";
import { Avatar, StatusChip } from "@/ui/controls";
import { Icon, Press, T } from "@/ui/primitives";
import { Card, Screen, SectionTitle, SyncBadge } from "@/ui/surfaces";

/**
 * «Ещё» — the fifth tab (founder 06.11, variant Б; docs/specs/13 v2 §2.1, §2.3): the profile card with the connection
 * status on top, then the tiles of every section by group and by rights (sections.ts menuGroups — the tabs are not
 * repeated). Replaces the ☰ drawer on the phone. On 820/1280 the same sections are in the side menu; /more still works.
 */
export default function More() {
  const { t } = useI18n();
  const { c } = useTheme();
  const { wide } = useDevice();
  const { db, role, mode, companyName, online, queue } = useStore();
  const auth = useAuth();
  const me = db.members.find((m) => m.id === db.me);
  const who = mode === "cloud" ? (companyName ?? "") : t(`role.${role}`);
  const cols = wide ? 4 : 2;
  const contentW = Math.min(useContentWidth(), layout.contentMax);
  const tileW = Math.floor((contentW - space[4] * 2 - space[2] * (cols - 1)) / cols);
  // on 820/1280 the side menu has the tabs too; here only what is not a tab
  const groups = menuGroups(role, false);
  const tile = (s: Section) => (
    <Press
      key={s.id}
      testID={`more-${s.id}`}
      onPress={() => openSection(sectionHref(s.id, role))}
      visibleHeight={size.rowMax}
      accessibilityRole="button"
      accessibilityLabel={t(s.label)}
      style={{ width: tileW, minHeight: size.rowMax, padding: space[3], gap: space[2], borderRadius: radius.inner, borderWidth: component.hairline, borderColor: c.bd, backgroundColor: c.surf }}
    >
      <View style={{ width: component.dockBtn, height: component.dockBtn, borderRadius: radius.pill, backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}>
        <Icon name={s.icon} s={size.iconMd} color={c.ink} />
      </View>
      <T v="body" w="semibold" numberOfLines={2}>
        {t(s.label)}
      </T>
    </Press>
  );
  return (
    <Screen title={t("nav.more")} subtitle={t("nav.more.hint")}>
      <View testID="more-screen" style={{ gap: space[3] }}>
      {/* profile and the connection status (13 §2.3, like Jobber) */}
      <Card>
        <Press
          testID="more-profile"
          onPress={() => openSection(sectionHref("settings", role))}
          visibleHeight={size.rowMax}
          accessibilityRole="button"
          accessibilityLabel={`${me?.name ?? auth.email ?? ""} · ${who}`}
          style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: size.rowMax }}
        >
          <Avatar initials={me?.initials ?? "··"} />
          <View style={{ flex: 1, gap: space[1] }}>
            <T v="body" w="semibold" numberOfLines={1}>
              {me?.name ?? auth.email ?? t("settings.title")}
            </T>
            <T v="caption" tone="mut" numberOfLines={1}>
              {who}
            </T>
          </View>
          <Icon name="chevronRight" s={size.iconSm} color={c.mut} />
        </Press>
        <View testID="more-sync" style={{ marginTop: space[2] }}>
          {syncState(online, queue.length) ? <SyncBadge /> : <StatusChip status="ok" label={t("nav.more.online")} />}
        </View>
      </Card>
      {groups.map((g) => (
        <View key={g.group} testID={`more-group-${g.group}`} style={{ gap: space[2] }}>
          {GROUP_TITLE[g.group] ? <SectionTitle title={t(GROUP_TITLE[g.group]!)} /> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>{g.items.map(tile)}</View>
        </View>
      ))}
      </View>
    </Screen>
  );
}
