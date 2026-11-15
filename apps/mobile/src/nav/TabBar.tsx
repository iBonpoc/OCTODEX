import { useEffect, useState, type ReactNode } from "react";
import { router, useGlobalSearchParams, usePathname, useRootNavigationState, useSegments, type Href } from "expo-router";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { component, motion, radius, size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "@/ui/primitives";
import { Glass, Sheet } from "@/ui/overlays";
import { Button } from "@/ui/controls";
import { useNavInsets } from "@/ui/surfaces";
import { useKeyboardHeight } from "@/ui/keyboard";
import { appStackRoutes, formsAbove, showsTabBar, tabLeave } from "./tabBarRule";
import { setNavState } from "./go";
import { useTabBarHidden } from "./tabBarHide";
import { deviceTabSurface, liquidGlassView } from "./tabGlass";
import { useAuth } from "@/cloud/auth";
import { gateFreePath } from "@/features/legal";
import { activeSection } from "./hierarchy";
import { sectionHref, tabs, type SectionId } from "./sections";
import { moduleTabs } from "@/modules/registry";
import { fillStyleFlat } from "@/ui/fill";

/**
 * Phone: floating glass pill at the bottom (56 + safe area), the 5 tabs of docs/specs/13 §2.1 — the same for every role.
 * Tablet/desktop: none — the side menu (SideNav, 13 §2.5) takes its place.
 * Active item gets the liquid fill (160ms stretch + 420ms settle): raised surface + ink frame.
 * A screen without a tab (Leads, Jobs… from «Ещё») lights «Ещё».
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
  const own = activeSection(pathname, params, store.db, store.role);
  // a section that is not a tab (Leads, Jobs… opened from «Ещё») lights «Ещё» (13 v2 §2.1, variant Б)
  const sec = own && !tabs(store.role).some((s) => s.id === own) ? "more" : own;
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
  const { c, name } = useTheme();
  const { wide } = useDevice();
  const nav = useNavInsets();
  // iOS 26: the system liquid glass; Android, web, older iOS, an old build: the --ov + blur panel as before (tabGlass.ts)
  const liquid = deviceTabSurface() === "liquid";
  const reduce = useReducedMotion();
  /** on a phone the floating bar would sit on top of the keyboard and cover the field: hide it while typing */
  const kb = useKeyboardHeight();
  // the core's tabs, the usable modules' sections before «Ещё» (place «tab», founder 09.11 «Замеры»)
  const core = tabs(role);
  const mods = moduleTabs(db.company, role);
  const items: { id: string; label: string; icon: (typeof core)[number]["icon"]; onPress: () => void }[] = [
    ...core.filter((s) => s.id !== "more").map((s) => ({ id: s.id as string, label: (s.tabLabel ?? s.label) as string, icon: s.icon, onPress: () => onGo(s.id) })),
    ...mods.map((m) => ({ id: m.tabId, label: m.labelKey as string, icon: m.icon, onPress: () => onGoHref(m.href as Href) })),
    ...core.filter((s) => s.id === "more").map((s) => ({ id: s.id as string, label: s.label as string, icon: s.icon, onPress: () => onGo(s.id) })),
  ];
  const modNow = mods.find((m) => path === m.href || path.startsWith(`${m.href}/`));
  const current: string | undefined = modNow ? modNow.tabId : sectionNow;

  const [layouts, setLayouts] = useState<Record<string, { x: number; w: number }>>({});
  const left = useSharedValue(0);
  const width = useSharedValue(0);
  // Items move when the role changes: forget old measurements so the fill jumps to the right place.
  useEffect(() => {
    setLayouts({});
    width.value = 0;
  }, [role, wide, width]);
  useEffect(() => {
    const l = current ? layouts[current] : undefined;
    if (!l) {
      width.value = 0;
      return;
    }
    if (reduce || width.value === 0) {
      left.value = l.x;
      width.value = l.w;
      return;
    }
    const spanL = Math.min(left.value, l.x);
    const spanR = Math.max(left.value + width.value, l.x + l.w);
    const stretch = { duration: motion.liquidStretch, easing: Easing.bezier(...motion.easeOut) };
    const settle = { duration: motion.liquidSettle, easing: Easing.bezier(...motion.easeLiquid) };
    left.value = withSequence(withTiming(spanL, stretch), withTiming(l.x, settle));
    width.value = withSequence(withTiming(spanR - spanL, stretch), withTiming(l.w, settle));
  }, [current, layouts, reduce, left, width]);
  const pill = useAnimatedStyle(() => ({ left: left.value, width: width.value, opacity: width.value > 0 ? 1 : 0 }));

  const itemH = wide ? component.button.md : size.tabbarH - space[2] * 2;
  const renderItem = (it: (typeof items)[number]) => {
    const sel = it.id === current;
    return (
      <Press
        key={it.id}
        testID={`tab-${it.id}`}
        onPress={it.onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: sel }}
        aria-selected={sel}
        accessibilityLabel={t(it.label as DictKey)}
        containerStyle={wide ? undefined : { flex: 1 }}
        onLayout={(e: LayoutChangeEvent) => {
          const { x, width: w } = e.nativeEvent.layout;
          setLayouts((p) => (p[it.id]?.x === x && p[it.id]?.w === w ? p : { ...p, [it.id]: { x, w } }));
        }}
        style={{
          flex: wide ? undefined : 1,
          height: itemH,
          paddingHorizontal: wide ? space[3] : 0,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: wide ? "row" : "column",
          gap: wide ? space[2] : 2,
        }}
      >
        <Icon name={it.icon} s={wide ? 16 : 20} color={c.ink} />
        <T v="micro" w={sel ? "semibold" : "medium"} style={{ color: sel ? c.ink : c.mut }} numberOfLines={1}>
          {t(it.label as DictKey)}
        </T>
      </Press>
    );
  };

  const ordered = items.map(renderItem);
  const shape = {
    borderRadius: radius.pill,
    height: wide ? component.button.md + space[2] * 2 : size.tabbarH,
    padding: space[2],
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: wide ? space[1] : 0,
    width: wide ? undefined : ("100%" as const),
    maxWidth: wide ? undefined : 480,
  };

  // 820/1280: the side menu instead; phone: hidden while typing
  if (wide || kb > 0) return null;

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: nav.tabBottom,
          alignItems: "center",
          paddingLeft: nav.left,
          paddingRight: nav.right,
        }}
      >
        <Surface liquid={liquid} scheme={name} style={shape}>
          <View key={`${role}-${wide}`} testID="tab-bar" role="tablist" style={{ flexDirection: "row", alignItems: "center", flex: wide ? undefined : 1, gap: wide ? space[1] : 0 }}>
            <Animated.View
              pointerEvents="none"
              style={[{ position: "absolute", top: 0, height: itemH, borderRadius: radius.pill }, fillStyleFlat(c), pill]}
            />
            {ordered}
          </View>
        </Surface>
      </View>
    </>
  );
}

/** the bar's pill: GlassView (no tint — the system glass follows the app's theme) or the old Glass panel */
function Surface({ liquid, scheme, style, children }: { liquid: boolean; scheme: "light" | "dark"; style: object; children: ReactNode }) {
  if (!liquid) {
    return (
      <Glass strong style={style}>
        {children}
      </Glass>
    );
  }
  const GlassView = liquidGlassView();
  return (
    <GlassView testID="tab-glass" glassEffectStyle="regular" colorScheme={scheme} style={[{ overflow: "hidden" }, style]}>
      {children}
    </GlassView>
  );
}
