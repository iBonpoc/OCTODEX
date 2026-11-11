import { Fragment } from "react";
import { View } from "react-native";
import { component, size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useAuth } from "@/cloud/auth";
import { useI18n, type DictKey } from "@/i18n";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { GROUP_TITLE } from "@/nav/NavMenu";
import { openSection } from "@/nav/go";
import { meIsSub, menuGroups, moreHref, sectionHref, type Section, type SectionId } from "@/nav/sections";
import { showsSyncLine } from "@/data/syncLink";
import { moreCounts } from "@/features/moreCounts";
import { useTick } from "@/features/sheets";
import { Avatar, StatusChip } from "@/ui/controls";
import { Icon, Press, T } from "@/ui/primitives";
import { Card, Divider, Screen, SyncBadge } from "@/ui/surfaces";

/** the director's «Команда · Настройки компании» get their own group «Компания» (spec 25); sections.ts is not changed */
const COMPANY: ReadonlySet<SectionId> = new Set<SectionId>(["team", "company"]);

/**
 * «Ещё» — the fifth tab (founder 06.11, variant Б; docs/specs/13 v2 §2.3). Founder 07.11 «очень некрасивое меню» →
 * spec 25: grouped ROWS like iOS «Настройки» (as the «Наряд» prototype and rule 12: choice menus are rows), not tiles.
 * Row = icon · word · counter · chevron, 44 high. Counters from moreCounts (the same numbers as «Требует внимания»).
 * «Онлайн · всё сохранено» is quiet (no colour); colour only when there is something to say (SyncBadge).
 * On 820/1280 the same list in one column (component.menuListMax), like the side menu.
 */
export default function More() {
  const { t } = useI18n();
  const { c } = useTheme();
  const { wide } = useDevice();
  useTick();
  const { db, role, mode, companyName, online, queue, notSavedOnDevice } = useStore();
  const auth = useAuth();
  const me = db.members.find((m) => m.id === db.me);
  const who = mode === "cloud" ? (companyName ?? "") : t(`role.${role}`);
  const counts = moreCounts(db, role);
  // on 820/1280 the side menu has the tabs too; here only what is not a tab
  const groups: { key: string; title?: DictKey; items: Section[] }[] = menuGroups(role, false, meIsSub(db))
    .flatMap((g) =>
      g.group === "bottom"
        ? [
            { key: "company", title: "fix.more.groupCompany" as DictKey, items: g.items.filter((s) => COMPANY.has(s.id)) },
            { key: "bottom", title: undefined, items: g.items.filter((s) => !COMPANY.has(s.id)) },
          ]
        : [{ key: g.group as string, title: GROUP_TITLE[g.group], items: g.items }],
    )
    .filter((g) => g.items.length > 0);

  const row = (s: Section) => {
    const n = counts[s.id];
    const count = n ? t(n.label, { n: n.n }) : undefined;
    return (
      <Press
        testID={`more-${s.id}`}
        onPress={() => openSection(moreHref(s.id, role))}
        visibleHeight={size.rowMin}
        accessibilityRole="button"
        // the name is exactly the word (e2e and VoiceOver find rows by it); the counter is the hint
        accessibilityLabel={t(s.label)}
        accessibilityHint={count}
        style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: size.rowMin, paddingHorizontal: space[4] }}
      >
        <View style={{ width: component.avatar.sm, alignItems: "center" }}>
          <Icon name={s.icon} s={size.iconMd} color={c.ink} />
        </View>
        <T v="body" style={{ flex: 1 }} numberOfLines={1}>
          {t(s.label)}
        </T>
        {n && count ? (
          n.bad ? (
            <StatusChip status="bad" label={count} soft />
          ) : (
            <T v="caption" tone="mut" tabular>
              {count}
            </T>
          )
        ) : null}
        <Icon name="chevronRight" s={size.iconSm} color={c.mut} />
      </Press>
    );
  };

  return (
    <Screen title={t("nav.more")}>
      <View testID="more-screen" style={{ gap: space[4], width: "100%", maxWidth: wide ? component.menuListMax : undefined }}>
        {/* profile and the connection status (13 §2.3, like Jobber) */}
        <Card>
          <Press
            testID="more-profile"
            // spec 26: the profile card opens «Профиль и аккаунт»; «Настройки приложения» is its own row below
            onPress={() => openSection("/settings/profile")}
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
            {showsSyncLine(online, queue.length, notSavedOnDevice) ? (
              <SyncBadge />
            ) : (
              // all is well — quiet, no colour (rule 2: colour is for a status that asks for something)
              <View testID="more-sync-ok" style={{ flexDirection: "row", alignItems: "center", gap: space[1] }} accessible accessibilityLabel={t("nav.more.online")}>
                <Icon name="check" s={size.iconSm} color={c.mut} />
                <T v="caption" tone="mut">
                  {t("nav.more.online")}
                </T>
              </View>
            )}
          </View>
        </Card>
        {groups.map((g) => (
          <View key={g.key} testID={`more-group-${g.key}`} style={{ gap: space[1] }}>
            {g.title ? (
              <View accessibilityRole="header" style={{ paddingHorizontal: space[4] }}>
                <T v="caption" w="semibold" tone="mut">
                  {t(g.title)}
                </T>
              </View>
            ) : null}
            <Card style={{ paddingHorizontal: 0, paddingVertical: space[1], gap: 0 }}>
              {g.items.map((s, i) => (
                <Fragment key={s.id}>
                  {i > 0 ? (
                    <View style={{ marginLeft: space[4] + component.avatar.sm + space[3] }}>
                      <Divider />
                    </View>
                  ) : null}
                  {row(s)}
                </Fragment>
              ))}
            </Card>
          </View>
        ))}
      </View>
    </Screen>
  );
}
