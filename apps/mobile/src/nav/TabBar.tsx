import { useEffect, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useGlobalSearchParams, usePathname } from "expo-router";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { component, motion, radius, size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "@/ui/primitives";
import { Glass } from "@/ui/overlays";
import { useNavInsets } from "@/ui/surfaces";
import { useKeyboardHeight } from "@/ui/keyboard";
import { roleNav, type TabRoute } from "./roles";
import { QuickActions } from "./QuickActions";
import { goTo } from "./go";
import { sectionTab } from "./hierarchy";

/**
 * Phone: floating glass pill at the bottom (56 + safe area), 4 items + center "＋".
 * Tablet/desktop: the same pill at the top (HANDOFF "верхняя пилюля").
 * Active item gets the liquid accent fill (160ms stretch + 420ms settle).
 */
export function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const current = state.routes[state.index]?.name as TabRoute | undefined;
  const go = (route: TabRoute) => {
    const r = state.routes.find((x) => x.name === route);
    if (r) navigateToTab(r.key);
  };
  return <NavPill current={current} onGo={go} />;
}

/**
 * Tablet/desktop: the same top pill on inner screens (client, job, estimate…), so another section is one tap away;
 * the section the screen belongs to is highlighted (spec 10, Н1). Drawn by Screen inside its pinned header, so on
 * iPad it slides with its screen (push, swipe back) and comes first in the keyboard order. Phone: none (iOS).
 */
export function StackNavPill() {
  const store = useStore();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  return <NavPill inline current={sectionTab(pathname, params, store.db, store.role)} onGo={(route) => goTo(`/${route}`)} />;
}

function NavPill({ current, onGo: go, inline }: { current: TabRoute | undefined; onGo: (route: TabRoute) => void; inline?: boolean }) {
  const { role } = useStore();
  const { t } = useI18n();
  const { c } = useTheme();
  const { wide } = useDevice();
  const nav = useNavInsets();
  const reduce = useReducedMotion();
  const [quick, setQuick] = useState(false);
  /** on a phone the floating bar would sit on top of the keyboard and cover the field: hide it while typing */
  const kb = useKeyboardHeight();
  const items = roleNav[role];

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
    const sel = it.route === current;
    return (
      <Press
        key={it.route}
        onPress={() => go(it.route)}
        accessibilityRole="tab"
        accessibilityState={{ selected: sel }}
        aria-selected={sel}
        accessibilityLabel={t(it.label)}
        containerStyle={wide ? undefined : { flex: 1 }}
        onLayout={(e: LayoutChangeEvent) => {
          const { x, width: w } = e.nativeEvent.layout;
          setLayouts((p) => (p[it.route]?.x === x && p[it.route]?.w === w ? p : { ...p, [it.route]: { x, w } }));
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
        <Icon name={it.icon} s={wide ? 16 : 20} color={sel ? c.onAcc : c.ink} />
        <T v="micro" w={sel ? "semibold" : "medium"} style={{ color: sel ? c.onAcc : c.mut }} numberOfLines={1}>
          {t(it.label)}
        </T>
      </Press>
    );
  };

  const plus = (
    <Press
      key="plus"
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setQuick(true);
      }}
      visibleHeight={component.fab}
      accessibilityRole="button"
      accessibilityLabel={t("tab.add")}
      containerStyle={wide ? undefined : { flex: 1 }}
      style={{ alignItems: "center", justifyContent: "center", height: itemH }}
    >
      <View
        style={{
          width: component.fab,
          height: component.fab,
          borderRadius: radius.pill,
          backgroundColor: c.acc,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="plus" s={size.iconMd} color={c.onAcc} />
      </View>
    </Press>
  );

  const ordered = wide ? [...items.map(renderItem), plus] : [...items.slice(0, 2).map(renderItem), plus, ...items.slice(2).map(renderItem)];

  if (kb > 0 && !wide) return null;

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{
          ...(inline ? {} : { position: "absolute", left: 0, right: 0, ...(wide ? { top: nav.safeTop + space[3] } : { bottom: nav.tabBottom }) }),
          alignItems: "center",
          paddingHorizontal: space[4],
        }}
      >
        <Glass
          strong
          style={{
            borderRadius: radius.pill,
            height: wide ? component.button.md + space[2] * 2 : size.tabbarH,
            padding: space[2],
            flexDirection: "row",
            alignItems: "center",
            gap: wide ? space[1] : 0,
            width: wide ? undefined : "100%",
            maxWidth: wide ? undefined : 480,
          }}
        >
          <View key={`${role}-${wide}`} role="tablist" style={{ flexDirection: "row", alignItems: "center", flex: wide ? undefined : 1, gap: wide ? space[1] : 0 }}>
            <Animated.View
              pointerEvents="none"
              style={[{ position: "absolute", top: 0, height: itemH, borderRadius: radius.pill, backgroundColor: c.acc }, pill]}
            />
            {ordered}
          </View>
        </Glass>
      </View>
      <QuickActions visible={quick} onClose={() => setQuick(false)} />
    </>
  );
}
