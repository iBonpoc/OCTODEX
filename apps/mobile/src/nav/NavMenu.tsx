import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideOutLeft, useReducedMotion } from "react-native-reanimated";
import { usePathname, useGlobalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { component, motion, radius, size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useAuth } from "@/cloud/auth";
import { useI18n, type DictKey } from "@/i18n";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { Glass } from "@/ui/overlays";
import { Avatar } from "@/ui/controls";
import { Icon, Press, T, type IconKey } from "@/ui/primitives";
import { activeSection } from "./hierarchy";
import { hasSection, menuGroups, sectionHref, sectionOfHref, type MenuGroup, type SectionId } from "./sections";
import { FabSheet } from "./Fab";
import { contentWidth, openKey } from "./shell";
import { roleHome, routeKey } from "./roles";
import { usePersistentState } from "@/data/persist";
import { openSection } from "./go";

/**
 * The full menu as a drawer (docs/specs/13 v2 §2.3, §2.5): only on 820 — ☰ on the side rail opens it over the content.
 * The phone has the «Ещё» tab instead (variant Б, founder 06.11); 1280 opens the side menu in place.
 * «＋ Создать» on top opens the home «＋» set (13 v2 §2.4; each screen has its own «＋», Fab.tsx).
 */
interface NavMenuCtx {
  open: () => void;
  /** `refocus` = false when an item was chosen: the new screen puts the focus on its own title */
  close: (refocus?: boolean) => void;
  isOpen: boolean;
  /** «＋ Создать»: the home «＋» set */
  create: () => void;
  /** 1280: the side menu is open (pushes the content), remembered per person on this device (13а §8) */
  sideOpen: boolean;
  toggleSide: () => void;
  /** the remembered choice has loaded from the device */
  sideReady: boolean;
}
const Ctx = createContext<NavMenuCtx>({ open: () => {}, close: () => {}, isOpen: false, create: () => {}, sideOpen: false, toggleSide: () => {}, sideReady: false });
export const useNavMenu = () => useContext(Ctx);

export function NavMenuProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [quick, setQuick] = useState(false);
  /** web: the control that opened the menu gets the focus back when it closes */
  const opener = useRef<HTMLElement | null>(null);
  const open = useCallback(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") opener.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);
  const close = useCallback((refocus = true) => {
    setOpen(false);
    const el = opener.current;
    opener.current = null;
    if (refocus && el && Platform.OS === "web") requestAnimationFrame(() => el.isConnected && el.focus?.());
  }, []);
  const { db } = useStore();
  const [sideOpen, setSideOpen, sideReady] = usePersistentState<boolean>(openKey(db.me), false);
  const toggleSide = useCallback(() => setSideOpen((v) => !v), [setSideOpen]);
  const create = useCallback(() => {
    setOpen(false);
    setQuick(true);
  }, []);
  const value = useMemo(
    () => ({ open, close, isOpen, create, sideOpen, toggleSide, sideReady }),
    [open, close, isOpen, create, sideOpen, toggleSide, sideReady],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      <Drawer
        visible={isOpen}
        onClose={close}
        onChoose={() => close(false)}
        onCreate={create}
      />
      <FabSheet set="home" visible={quick} onClose={() => setQuick(false)} />
    </Ctx.Provider>
  );
}

/** the ☰ item for the screen on display: the exact list on /leads (?tab), else its section (also for sales' home) */
export function useMenuCurrent(): SectionId | undefined {
  const { db, role } = useStore();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const tab = params.tab ? String(params.tab) : "";
  // the role's own home (sales: the Sales lists) is «Главная» — unless a ☰ list on it was asked for by name
  if (routeKey(pathname) === roleHome[role] && (!tab || tab === "leads")) return "home";
  const own = sectionOfHref(pathname + (tab ? `?tab=${tab}` : ""));
  return own && own !== "home" && hasSection(role, own) ? own : activeSection(pathname, params, db, role);
}

/** the width the screen's own content gets on this device (window minus the side menu) */
export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  const { device } = useDevice();
  return contentWidth(width, device, useNavMenu().sideOpen);
}

export const GROUP_TITLE: Partial<Record<MenuGroup, DictKey>> = { work: "nav.group.work", docs: "nav.group.docs", money: "nav.group.money" };

function Drawer({ visible, onClose, onChoose, onCreate }: { visible: boolean; onClose: () => void; onChoose: () => void; onCreate: () => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { width: winW } = useWindowDimensions();
  const { wide } = useDevice();
  const store = useStore();
  const { db, role, mode, companyName } = store;
  const auth = useAuth();
  const current = useMenuCurrent();
  const me = db.members.find((m) => m.id === db.me);
  const go = (id: SectionId) => {
    onChoose();
    openSection(sectionHref(id, role));
  };
  const who = mode === "cloud" ? (companyName ?? "") : t(`role.${role}`);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => onClose()} statusBarTranslucent>
      <Animated.View entering={reduce ? undefined : FadeIn.duration(motion.durBase)} exiting={reduce ? undefined : FadeOut.duration(motion.durFast)} style={StyleSheet.absoluteFill}>
        {/* a tap outside closes it; for the keyboard and screen readers: «Закрыть» in the menu and Esc */}
        <View
          testID="menu-scrim"
          style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
          // the responder system answers both a finger and a mouse (onTouchEnd was touch-only on the web)
          onStartShouldSetResponder={() => true}
          onResponderRelease={() => onClose()}
          accessible={false}
        />
      </Animated.View>
      <Animated.View
        entering={reduce ? undefined : SlideInLeft.duration(motion.durSlow)}
        exiting={reduce ? undefined : SlideOutLeft.duration(motion.durBase)}
        accessibilityViewIsModal
        aria-modal
        role="dialog"
        aria-label={t("nav.menu")}
        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: Math.min(component.panelW, winW - space[8]) }}
      >
        <Glass strong style={{ flex: 1, borderTopRightRadius: component.sheetRadius, borderBottomRightRadius: component.sheetRadius, paddingTop: insets.top + space[3], paddingBottom: insets.bottom + space[3] }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space[4], minHeight: size.hitMin }}>
            <T v="title">{t("nav.menu")}</T>
            <Press onPress={() => onClose()} visibleHeight={component.dockBtn} accessibilityRole="button" accessibilityLabel={t("common.close")}>
              <View style={{ width: component.dockBtn, height: component.dockBtn, borderRadius: radius.pill, backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}>
                <Icon name="close" s={size.iconSm} />
              </View>
            </Press>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: space[3], paddingVertical: space[2], gap: space[1] }}>
            <MenuRow icon="plus" label={t("nav.create")} onPress={onCreate} accent />
            {menuGroups(role, wide).map((g) => (
              <View key={g.group} style={{ gap: space[1] }}>
                {g.group !== "top" ? <View style={{ height: component.hairline, backgroundColor: c.bd, marginVertical: space[2], marginHorizontal: space[2] }} /> : null}
                {GROUP_TITLE[g.group] ? (
                  <T v="caption" w="semibold" tone="mut" style={{ paddingHorizontal: space[3], paddingTop: space[1] }}>
                    {t(GROUP_TITLE[g.group]!)}
                  </T>
                ) : null}
                {g.items.map((s) => (
                  <MenuRow key={s.id} icon={s.icon} label={t(s.label)} selected={s.id === current} onPress={() => go(s.id)} testID={`menu-${s.id}`} />
                ))}
              </View>
            ))}
            {/* profile: name, role (or company) — opens My settings (13 v2 §4: one role per person, no «Сменить роль») */}
            <View style={{ height: component.hairline, backgroundColor: c.bd, marginVertical: space[2], marginHorizontal: space[2] }} />
            <Press
              onPress={() => go("settings")}
              visibleHeight={size.rowMax}
              accessibilityRole="button"
              accessibilityLabel={`${me?.name ?? auth.email ?? ""} · ${who}`}
              style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: size.rowMax, paddingHorizontal: space[3], borderRadius: radius.inner }}
            >
              <Avatar initials={me?.initials ?? "··"} />
              <View style={{ flex: 1 }}>
                <T v="body" w="semibold" numberOfLines={1}>
                  {me?.name ?? auth.email ?? t("settings.title")}
                </T>
                <T v="caption" tone="mut" numberOfLines={1}>
                  {who}
                </T>
              </View>
            </Press>
          </ScrollView>
        </Glass>
      </Animated.View>
    </Modal>
  );
}

function MenuRow({ icon, label, onPress, selected, accent, testID }: { icon: IconKey; label: string; onPress: () => void; selected?: boolean; accent?: boolean; testID?: string }) {
  const { c } = useTheme();
  return (
    <Press
      testID={testID}
      onPress={onPress}
      // the row is 44 tall itself: no extra hit area spilling onto the next row
      visibleHeight={size.hitMin}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      aria-current={selected ? "page" : undefined}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space[3],
        minHeight: size.hitMin,
        paddingHorizontal: space[3],
        borderRadius: radius.pill,
        backgroundColor: selected ? c.surf2 : undefined,
        borderWidth: component.hairline,
        borderColor: selected ? c.ink : "transparent",
      }}
    >
      <View
        style={{
          width: component.dockBtn,
          height: component.dockBtn,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: accent ? c.acc : undefined,
        }}
      >
        <Icon name={icon} s={size.iconMd} color={accent ? c.onAcc : c.ink} />
      </View>
      <T v="body" w={selected || accent ? "semibold" : "medium"} numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </T>
    </Press>
  );
}
