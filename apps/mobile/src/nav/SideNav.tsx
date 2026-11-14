import { View, ScrollView } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { component, radius, size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useAuth } from "@/cloud/auth";
import { useI18n } from "@/i18n";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { Avatar } from "@/ui/controls";
import { BrandMark } from "@/ui/brand";
import { router } from "expo-router";
import { Icon, Press, T, type IconKey } from "@/ui/primitives";
import { meIsSub, menuGroups, sectionHref, type SectionId } from "./sections";
import { moduleTabs } from "@/modules/registry";
import { GROUP_TITLE, useMenuCurrent, useNavMenu } from "./NavMenu";
import { openSection } from "./go";
import { isAppPath, sideNavWidth } from "./shell";
import { useTabBarHidden } from "./tabBarHide";

export { isAppPath };

/**
 * Side menu on 820 and 1280 (docs/specs/13 §2.5, 13а §8): a rail of icons with labels, always on screen.
 * ☰ on top: 1280 — opens the full menu that pushes the content (remembered per person); 820 — the full menu over it.
 * The phone has the bottom tabs and ☰ in the header instead.
 */
export function SideNav() {
  const { t } = useI18n();
  const { c } = useTheme();
  const { device, wide } = useDevice();
  const insets = useSafeAreaInsets();
  const store = useStore();
  const { db, role, mode, companyName } = store;
  const auth = useAuth();
  const menu = useNavMenu();
  const current = useMenuCurrent();
  const path = usePathname();
  // a screen that needs the whole screen (useHideTabBar: the signature pad, a drawing canvas on a phone in landscape)
  const hidden = useTabBarHidden();
  if (!wide || hidden || !isAppPath(path)) return null;
  const open = device === "desktop" && menu.sideOpen;
  const me = db.members.find((m) => m.id === db.me);
  const who = mode === "cloud" ? (companyName ?? "") : t(`role.${role}`);
  const go = (id: SectionId) => openSection(sectionHref(id, role));
  const mods = moduleTabs(db.company, role);
  const modNow = mods.find((m) => path === m.href || path.startsWith(`${m.href}/`));
  const toggle = device === "desktop" ? menu.toggleSide : menu.open;
  return (
    <View
      testID="side-nav"
      role="navigation"
      aria-label={t("nav.menu")}
      // the notch in landscape (docs/specs/32): the menu runs to the edge, its places keep clear of it
      style={{ width: sideNavWidth(device, menu.sideOpen, insets.left), borderRightWidth: component.hairline, borderRightColor: c.bd, backgroundColor: c.page, paddingTop: insets.top + space[3], paddingBottom: insets.bottom + space[3], paddingLeft: insets.left }}
    >
      <ScrollView testID="side-scroll" contentContainerStyle={{ paddingHorizontal: space[2], gap: space[1], alignItems: open ? "stretch" : "center" }}>
        {/* GoRix on top (DS §18.2): the mark, no word; it opens «О приложении». The menu's «＋» is yellow — the dot is ink */}
        <Press onPress={() => router.push("/settings")} visibleHeight={size.iconLg} accessibilityRole="button" accessibilityLabel={t("brand.side.about")} testID="side-brand">
          <View style={{ minHeight: size.hitMin, justifyContent: "center", paddingHorizontal: space[2] }}>
            <BrandMark size={size.iconLg} screenHasPrimary />
          </View>
        </Press>
        <Item
          icon="menu"
          label={t(open ? "nav.collapse" : "nav.expand")}
          open={open}
          onPress={toggle}
          hideLabel
          testID="side-toggle"
          expanded={device === "desktop" ? open : undefined}
        />
        <Item icon="plus" label={t("nav.create")} open={open} onPress={menu.create} accent />
        {menuGroups(role, true, meIsSub(db)).map((g) => (
          <View key={g.group} style={{ gap: space[1], alignItems: open ? "stretch" : "center", alignSelf: "stretch" }}>
            {g.group !== "top" ? <View style={{ height: component.hairline, backgroundColor: c.bd, marginVertical: space[1], marginHorizontal: space[1] }} /> : null}
            {open && GROUP_TITLE[g.group] ? (
              <T v="caption" w="semibold" tone="mut" style={{ paddingHorizontal: space[2] }}>
                {t(GROUP_TITLE[g.group]!)}
              </T>
            ) : null}
            {g.items.map((s) => (
              <Item key={s.id} icon={s.icon} label={t(s.label)} open={open} selected={!modNow && s.id === current} onPress={() => go(s.id)} testID={`side-${s.id}`} />
            ))}
            {/* the usable modules' sections (place «tab», founder 09.11 «Замеры»): with the work */}
            {g.group === "work"
              ? mods.map((m) => (
                  <Item key={m.tabId} icon={m.icon} label={t(m.labelKey)} open={open} selected={modNow?.tabId === m.tabId} onPress={() => openSection(m.href)} testID={`side-${m.tabId}`} />
                ))
              : null}
          </View>
        ))}
      </ScrollView>
      {/* profile → «Профиль и аккаунт» (spec 26) */}
      <Press
        testID="side-profile"
        onPress={() => openSection("/settings/profile")}
        visibleHeight={size.hitMin}
        accessibilityRole="button"
        accessibilityLabel={`${me?.name ?? auth.email ?? ""} · ${who}`}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: open ? "flex-start" : "center", gap: space[2], minHeight: size.hitMin, marginHorizontal: space[2], paddingHorizontal: open ? space[2] : 0, borderRadius: radius.pill }}
      >
        <Avatar initials={me?.initials ?? "··"} s={component.avatar.sm} />
        {open ? (
          <View style={{ flex: 1 }}>
            <T v="caption" w="semibold" numberOfLines={1}>
              {me?.name ?? auth.email ?? ""}
            </T>
            <T v="micro" tone="mut" numberOfLines={1}>
              {who}
            </T>
          </View>
        ) : null}
      </Press>
    </View>
  );
}

/** One place: icon over a short label (rail) or icon + label in a row (open menu). 44 tall, the same frame as a tab. */
function Item({
  icon,
  label,
  open,
  onPress,
  selected,
  accent,
  hideLabel,
  testID,
  expanded,
}: {
  icon: IconKey;
  label: string;
  open: boolean;
  onPress: () => void;
  selected?: boolean;
  accent?: boolean;
  hideLabel?: boolean;
  testID?: string;
  expanded?: boolean;
}) {
  const { c } = useTheme();
  const showLabel = open || !hideLabel;
  return (
    <Press
      testID={testID}
      onPress={onPress}
      visibleHeight={size.hitMin}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected, ...(expanded !== undefined ? { expanded } : {}) }}
      aria-current={selected ? "page" : undefined}
      aria-expanded={expanded}
      containerStyle={{ alignSelf: "stretch" }}
      style={{
        flexDirection: open ? "row" : "column",
        alignItems: "center",
        gap: open ? space[3] : 2,
        minHeight: size.hitMin,
        paddingVertical: open ? 0 : space[1],
        paddingHorizontal: open ? space[2] : 0,
        borderRadius: open ? radius.pill : radius.inner,
        backgroundColor: selected ? c.surf2 : undefined,
        borderWidth: component.hairline,
        borderColor: selected ? c.ink : c.page,
      }}
    >
      <View
        style={{
          width: component.button.md,
          height: component.button.md,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          // «＋ Создать» stands out by its round plate, not by yellow: it is on every screen, the yellow is only the main action and
          // «Главная»'s «＋» (DS §3.1 п.3, §5.3, #1395)
          backgroundColor: accent ? c.surf2 : undefined,
          borderWidth: accent ? component.hairline : 0,
          borderColor: c.bd,
        }}
      >
        <Icon name={icon} s={size.iconMd} color={c.ink} />
      </View>
      {showLabel ? (
        <T v={open ? "body" : "micro"} w={selected || accent ? "semibold" : "medium"} numberOfLines={1} style={open ? { flex: 1 } : { maxWidth: component.navRail - space[2] }}>
          {label}
        </T>
      ) : null}
    </Press>
  );
}
