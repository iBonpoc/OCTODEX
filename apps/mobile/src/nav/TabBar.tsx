import { useState } from "react";
import { router, useGlobalSearchParams, usePathname, useRootNavigationState, useSegments, type Href } from "expo-router";
import { View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { component, size, spaceHalf } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "@/ui/primitives";
import { Sheet } from "@/ui/overlays";
import { Button } from "@/ui/controls";
import { useNavInsets } from "@/ui/surfaces";
import { useKeyboardHeight } from "@/ui/keyboard";
import { QueueLine } from "@/ui/queueLine";
import { appStackRoutes, formsAbove, litSection, showsTabBar, tabLeave, tabRouteKey, tabUnder } from "./tabBarRule";
import { setNavState } from "./go";
import { useTabBarHidden } from "./tabBarHide";
import { useAuth } from "@/cloud/auth";
import { gateFreePath } from "@/features/legal";
import { activeSection } from "./hierarchy";
import { meIsSub, sectionHref, tabOf, tabs, type SectionId } from "./sections";
import { moduleTabs } from "@/modules/registry";

/**
 * Phone: a bar across the bottom (56 + the safe area, visual v2 «Панель вкладок»), the 5 tabs of docs/specs/13 §2.1 — the same
 * for every role. Tablet/desktop: none — the side menu (SideNav, 13 §2.5) takes its place.
 * The active tab: the icon 22 and the word 12 in `accText`, no fill (v2; the floating glass pill with a yellow fill is gone).
 * Prototype v2: Главная · План · Клиенты · Деньги · Лиды; a section of «Ещё» (the avatar) lights none.
 */
export function TabBar() {
  const store = useStore();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const segments = useSegments();
  const { wide } = useDevice();
  const signing = useTabBarHidden();
  const { session, legal } = useAuth();
  const { t } = useI18n();
  const root = useRootNavigationState();
  // goTo (a plain function, no hooks) reads the stack from here: the shell always renders the bar, at every width
  setNavState(root);
  const [ask, setAsk] = useState<Href | null>(null);
  // the lit tab is the one the card was opened from (audit 12 §1); a search lights none (tabBarRule litSection)
  const own = litSection(tabRouteKey(segments.join("/")), activeSection(pathname, params, store.db, store.role), tabUnder(root));
  // prototype v2: the money lists light «Деньги», a lead lights «Лиды»; a section of «Ещё» (the avatar) lights no tab;
  // with a module's tab «План» is not a tab (#1487): the Plan opened from «Ещё» lights none
  const sec = tabOf(own, store.role, moduleTabs(store.db.company, store.role).length > 0, meIsSub(store.db));
  // every phone screen but forms, the signature, sign-in, /p and the legal texts (docs/specs/28)
  // a module's own screens hide the bar (the canvas needs the whole screen) — but not the one that is a tab of its own
  // («Замеры», place «tab»)
  const modTab = moduleTabs(store.db.company, store.role).some((m) => pathname === m.href);
  if (wide || signing || !(showsTabBar(segments.join("/")) || modTab)) return null;
  // help and the documents before the consent is given (the gate is open over them): the app is closed — no bar
  if (session && (legal === "first" || legal === "changed") && gateFreePath(pathname)) return null;
  // a tab from a card: back down to the tabs (dismissTo — navigate would push a second copy of the tabs, review #274),
  // then the tab; on the tabs themselves — just the tab. «On the tabs» = the top of the stack is the tabs, not «nothing to
  // dismiss»: after a card opened by a link ([card, (tabs)]) or the old role change ([(tabs), settings, (tabs)]) dismissTo did
  // nothing (e2e 134)
  const leave = (href: Href) => {
    if (tabLeave(appStackRoutes(root)) === "dismissTo") router.dismissTo(href);
    else router.navigate(href);
  };
  const go = (id: SectionId) => goHref(sectionHref(id, store.role) as Href);
  const goHref = (href: Href) => {
    // a form lies under this card (a new lead → «already a client» → the client): never drop it silently (rule 5)
    const forms = formsAbove(appStackRoutes(root));
    if (forms.length) setAsk(href);
    else leave(href);
  };
  return (
    <>
      <NavPill current={sec} onGo={go} onGoHref={goHref} path={pathname} />
      <Sheet visible={!!ask} onClose={() => setAsk(null)} title={t("fr8.tab.leaveTitle")}>
        <T v="body" tone="mut">{t("fr8.tab.leaveText")}</T>
        <Button label={t("fr8.tab.stay")} variant="primary" full onPress={() => setAsk(null)} />
        <Button
          label={t("fr8.tab.leave")}
          variant="secondary"
          full
          onPress={() => {
            const href = ask;
            setAsk(null);
            if (href) leave(href);
          }}
        />
      </Sheet>
    </>
  );
}

function NavPill({ current: sectionNow, onGo, onGoHref, path }: { current: SectionId | undefined; onGo: (id: SectionId) => void; onGoHref: (href: Href) => void; path: string }) {
  const { role, db } = useStore();
  const { t } = useI18n();
  const { c } = useTheme();
  const { wide } = useDevice();
  const nav = useNavInsets();
  const { width } = useWindowDimensions();
  /** on a phone the bar would sit on top of the keyboard and cover the field: hide it while typing */
  const kb = useKeyboardHeight();
  // the core's tabs; a usable module's section (place «tab», founder 09.11 «Замеры») takes the place of «План», which goes
  // to «Ещё» — five tabs, not six (founder 16.11, #1487; DS §5.3)
  // prototype v2 (BUILD-PLAN §2 п.2): a module's own tab stands where «План» was — only with the module on
  const mods = moduleTabs(db.company, role);
  const core = tabs(role, mods.length > 0, meIsSub(db));
  type Item = { id: string; label: string; icon: (typeof core)[number]["icon"]; onPress: () => void };
  const coreItem = (s: (typeof core)[number]): Item => ({ id: s.id as string, label: s.label as string, icon: s.icon, onPress: () => onGo(s.id) });
  const modItems: Item[] = mods.map((m) => ({ id: m.tabId, label: m.labelKey as string, icon: m.icon, onPress: () => onGoHref(m.href as Href) }));
  const items: Item[] = core.flatMap((s, i) => (i === 1 && modItems.length ? [...modItems, coreItem(s)] : [coreItem(s)]));
  const modNow = mods.find((m) => path === m.href || path.startsWith(`${m.href}/`));
  const current: string | undefined = modNow ? modNow.tabId : sectionNow;

  // 820/1280: the side menu instead; phone: hidden while typing
  if (wide || kb > 0) return null;

  const fade = component.tabBar.fade;
  return (
    // visual v2 «Панель вкладок»: a bar across the width, 56 + the bottom zone, on the `tab` ground that the content fades into
    // from the top; the icon 22 over the word 12; the active tab — the icon and the word in `accText`, NO fill under it
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: fade, paddingLeft: nav.left, paddingRight: nav.right }}
    >
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
        <Svg width={width} height={fade}>
          <Defs>
            <LinearGradient id="tab-fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.tab} stopOpacity={0} />
              <Stop offset="1" stopColor={c.tab} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={width} height={fade} fill="url(#tab-fade)" />
        </Svg>
        <View style={{ flex: 1, backgroundColor: c.tab }} />
      </View>
      {/* #2214: «Ждёт отправки · N» — a thin line of the bar itself, over the tabs, only while something waits or there is no network */}
      <QueueLine docked />
      <View key={`${role}-${wide}`} testID="tab-bar" role="tablist" style={{ flexDirection: "row", alignItems: "stretch", height: size.tabbarH, marginBottom: nav.tabBottom }}>
        {items.map((it) => {
          const sel = it.id === current;
          const tone = sel ? c.accText : c.mut;
          return (
            <Press
              key={it.id}
              testID={`tab-${it.id}`}
              onPress={it.onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: sel }}
              aria-selected={sel}
              accessibilityLabel={t(it.label as DictKey)}
              containerStyle={{ flex: 1 }}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spaceHalf.hair }}
            >
              <Icon name={it.icon} s={component.tabBar.icon} color={tone} active={sel} />
              <T v="micro" style={{ color: tone }} numberOfLines={1} capped>
                {t(it.label as DictKey)}
              </T>
            </Press>
          );
        })}
      </View>
    </View>
  );
}
