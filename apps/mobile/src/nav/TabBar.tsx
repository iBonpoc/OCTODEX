import { useEffect, useState } from "react";
import { useGlobalSearchParams, usePathname } from "expo-router";
import { View, type LayoutChangeEvent } from "react-native";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { component, motion, radius, size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "@/ui/primitives";
import { Glass } from "@/ui/overlays";
import { useNavInsets } from "@/ui/surfaces";
import { useKeyboardHeight } from "@/ui/keyboard";
import { roleHome } from "./roles";
import { goTo } from "./go";
import { activeSection } from "./hierarchy";
import { sectionHref, tabs, type SectionId } from "./sections";

/**
 * Phone: floating glass pill at the bottom (56 + safe area), the 5 tabs of docs/specs/13 §2.1 — the same for every role.
 * Tablet/desktop: none — the side menu (SideNav, 13 §2.5) takes its place.
 * Active item gets the liquid fill (160ms stretch + 420ms settle): raised surface + ink frame.
 * A screen without a tab (Leads, Jobs… from «Ещё») lights «Ещё».
 */
export function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const store = useStore();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const own = activeSection(pathname, params, store.db, store.role);
  // a section that is not a tab (Leads, Jobs… opened from «Ещё») lights «Ещё» (13 v2 §2.1, variant Б)
  const sec = own && !tabs(store.role).some((s) => s.id === own) ? "more" : own;
  const go = (id: SectionId) => {
    const name = id === "home" ? roleHome[store.role] : id;
    const r = state.routes.find((x) => x.name === name);
    if (r) navigateToTab(r.key);
    else goTo(sectionHref(id, store.role));
  };
  return <NavPill current={sec} onGo={go} />;
}

function NavPill({ current, onGo: go }: { current: SectionId | undefined; onGo: (id: SectionId) => void }) {
  const { role } = useStore();
  const { t } = useI18n();
  const { c } = useTheme();
  const { wide } = useDevice();
  const nav = useNavInsets();
  const reduce = useReducedMotion();
  /** on a phone the floating bar would sit on top of the keyboard and cover the field: hide it while typing */
  const kb = useKeyboardHeight();
  const items = tabs(role);

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
        onPress={() => go(it.id)}
        accessibilityRole="tab"
        accessibilityState={{ selected: sel }}
        aria-selected={sel}
        accessibilityLabel={t(it.label)}
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
          {t(it.label)}
        </T>
      </Press>
    );
  };

  const ordered = items.map(renderItem);

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
              style={[{ position: "absolute", top: 0, height: itemH, borderRadius: radius.pill, backgroundColor: c.surf2, borderWidth: 1, borderColor: c.ink }, pill]}
            />
            {ordered}
          </View>
        </Glass>
      </View>
    </>
  );
}
