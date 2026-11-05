import { VersionBadge } from "@/features/version";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { router, useGlobalSearchParams, usePathname, type Href } from "expo-router";
import { navContext } from "@/nav/hierarchy";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewInstance, type StyleProp, type ViewStyle } from "react-native";
import { avoidBehavior, useKeyboardHeight } from "./keyboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from "react-native-svg";
import { component, layout, radius, size, space, type StatusName } from "@octo/design-tokens";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Icon, Press, T, type IconKey } from "./primitives";
import { HelpButton } from "./overlays";
import { useHints } from "./hints";

/* ---------- Background: --bg + three soft glows (theme.css --glow) ---------- */
export function Background() {
  const { c, name } = useTheme();
  const { width, height } = useWindowDimensions();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          {c.glow.map((g, i) => (
            <RadialGradient key={i} id={`g${name}${i}`} cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={g.color} stopOpacity={g.opacity} />
              <Stop offset="0.6" stopColor={g.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        <Rect width={width} height={height} fill={c.bg} />
        {c.glow.map((g, i) => (
          <Ellipse key={i} cx={g.cx * width} cy={g.cy * height} rx={g.rx} ry={g.ry} fill={`url(#g${name}${i})`} />
        ))}
      </Svg>
    </View>
  );
}

/* ---------- Card (glass surface) ---------- */
export function Card({
  children,
  style,
  status,
  onPress,
  accessibilityLabel,
  inner,
  containerStyle,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** layout of the touch target when the card is pressable (flex in a row) */
  containerStyle?: StyleProp<ViewStyle>;
  /** tints the left edge with a status color (color = status only) */
  status?: StatusName;
  onPress?: () => void;
  accessibilityLabel?: string;
  inner?: boolean;
}) {
  const { c } = useTheme();
  const base: ViewStyle = {
    backgroundColor: inner ? c.in : c.surf,
    borderWidth: 1,
    borderColor: c.bd,
    borderRadius: inner ? radius.inner : radius.card,
    padding: inner ? space[3] : space[4],
    gap: space[2],
    overflow: "hidden",
    shadowColor: c.shadow.color,
    shadowOpacity: inner ? 0 : c.shadow.opacity,
    shadowRadius: c.shadow.radius,
    shadowOffset: { width: 0, height: c.shadow.offsetY },
  };
  const edge =
    status && status !== "neutral" ? (
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: component.statusEdge, backgroundColor: c.status[status].fill }} />
    ) : null;
  if (onPress)
    return (
      <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[base, style]} containerStyle={containerStyle}>
        {edge}
        {children}
      </Press>
    );
  return (
    <View style={[base, style]}>
      {edge}
      {children}
    </View>
  );
}

/* ---------- Layout helpers ---------- */
export function RowView({ children, style, gap = space[2] }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>;
}

export function Grid({ children, raise }: { children: ReactNode[] | ReactNode; /** index of the item to draw above siblings (drag) */ raise?: number }) {
  const { device } = useDevice();
  const [w, setW] = useState(0);
  const cols = layout.gridCols[device];
  const arr = (Array.isArray(children) ? children : [children]).filter(Boolean);
  if (cols === 1)
    return (
      <View style={{ gap: space[3] }}>
        {arr.map((ch, i) => (
          <View key={i} style={{ zIndex: raise === i ? 10 : 0 }}>
            {ch}
          </View>
        ))}
      </View>
    );
  const itemW = w ? (w - space[3] * (cols - 1)) / cols : undefined;
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3], alignItems: "flex-start" }}
    >
      {arr.map((ch, i) => (
        <View key={i} style={{ width: itemW ?? `${Math.floor(100 / cols) - 2}%`, zIndex: raise === i ? 10 : 0 }}>
          {ch}
        </View>
      ))}
    </View>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <RowView style={{ justifyContent: "space-between", marginTop: space[3] }}>
      <T v="heading">{title}</T>
      {right}
    </RowView>
  );
}

/** List row: 44–52 tall (rows are not buttons). */
export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  const body = (
    <RowView style={{ minHeight: size.rowMax, paddingVertical: space[2], gap: space[3] }}>
      {left}
      <View style={{ flex: 1 }}>
        <T v="body" w="semibold" numberOfLines={1}>
          {title}
        </T>
        {subtitle ? (
          <T v="caption" tone="mut" numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
      {onPress ? <Icon name="chevronRight" s={size.iconSm} color={c.mut} /> : null}
    </RowView>
  );
  return onPress ? (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      {body}
    </Press>
  ) : (
    body
  );
}

/**
 * Lists of objects (clients, leads, estimates, invoices, receipts, catalog items, attention items):
 * every object is its own card (founder's rule, 04.11). Rows inside one card are only for details of ONE object.
 */
export function CardList({ children }: { children: ReactNode }) {
  return <View style={{ gap: space[2] }}>{children}</View>;
}

export function ItemCard({
  title,
  subtitle,
  left,
  right,
  onPress,
  status,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  status?: StatusName;
}) {
  return (
    <Card status={status} style={{ paddingVertical: space[1] }}>
      <ListRow title={title} subtitle={subtitle} left={left} right={right} onPress={onPress} />
    </Card>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.bd }} />;
}

export function Empty({ icon, title, hint, action }: { icon: IconKey; title: string; hint?: string; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <Card style={{ alignItems: "center", paddingVertical: space[8], gap: space[3] }}>
      <View
        style={{
          width: component.fab + space[4],
          height: component.fab + space[4],
          borderRadius: radius.pill,
          backgroundColor: c.surf2,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} s={size.iconLg} />
      </View>
      <T v="heading" center>
        {title}
      </T>
      {hint ? (
        <T v="body" tone="mut" center>
          {hint}
        </T>
      ) : null}
      {action}
    </Card>
  );
}

/* ---------- Offline badge (DS rule 11: queue counter visible) ---------- */
export function OfflineBadge() {
  const { online, queue } = useStore();
  const { c } = useTheme();
  const { t } = useI18n();
  if (online) return null;
  return (
    <RowView
      style={{
        alignSelf: "flex-start",
        height: component.chip.h,
        paddingHorizontal: component.chip.px,
        borderRadius: radius.pill,
        backgroundColor: c.status.warn.fill,
        gap: space[1],
      }}
    >
      <Icon name="wifiOff" s={size.iconSm} color={c.status.warn.on} />
      <T v="caption" w="semibold" style={{ color: c.status.warn.on }}>
        {t("offline.badge", { n: queue.length })}
      </T>
    </RowView>
  );
}

/* ---------- Nav metrics shared by Screen and TabBar ---------- */
export function useNavInsets() {
  const insets = useSafeAreaInsets();
  const { wide } = useDevice();
  const bottomGap = space[2];
  return {
    wide,
    top: wide ? insets.top + space[3] + component.dockBtn + space[4] + space[3] : insets.top + space[2],
    bottom: wide ? insets.bottom + space[6] : Math.max(insets.bottom, space[3]) + size.tabbarH + bottomGap + space[6],
    tabBottom: Math.max(insets.bottom, space[3]),
    safeTop: insets.top,
  };
}

/* ---------- Screen: background, header with title + "?" + offline badge, scroll ---------- */
export function Screen({
  title,
  help,
  right,
  children,
  scroll = true,
  back,
  subtitle,
  hintKey,
  tabs,
  tabKey,
  below,
}: {
  title: string;
  help?: string;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  back?: () => void;
  subtitle?: string;
  /** stable id for the first-visit hint (shown once when `help` is set) */
  hintKey?: string;
  /**
   * Tabs that stick to the top while scrolling (like the App Store), with `below` = the tab's content.
   * When `tabKey` changes and the page is scrolled past the tabs, it glides back so the tabs sit at the top;
   * the content area is at least one screen tall, so switching tabs never makes the page jump.
   */
  tabs?: ReactNode;
  tabKey?: string;
  below?: ReactNode;
}) {
  const navInsets = useNavInsets();
  const kb = useKeyboardHeight();
  const hints = useHints();
  const { c } = useTheme();
  const { t } = useI18n();
  const store = useStore();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const nav = navContext(pathname, params, store.db, store.role);
  const up = nav.up;
  const hasUp = !!(up || back);
  const upLabel = up ? ("key" in up.label ? t(up.label.key) : up.label.text) : undefined;
  /** one level up; if the parent is already below us in the stack we pop to it, otherwise it replaces this screen */
  const goUp = () => {
    if (!up) return back?.();
    if (router.canDismiss()) router.dismissTo(up.href as Href);
    else router.replace(up.href as Href);
  };
  const header = (
    <View style={{ gap: space[2], marginBottom: space[3] }}>
      <VersionBadge />
      {hasUp ? (
        <>
          {/* detail screen: "‹ Parent" + actions, then the section, then the title */}
          <RowView style={{ justifyContent: "space-between", minHeight: size.hitMin }}>
            <Press
              onPress={goUp}
              visibleHeight={component.dockBtn}
              accessibilityRole="button"
              accessibilityLabel={upLabel ? t("nav.backTo", { to: upLabel }) : t("common.back")}
              containerStyle={{ flexShrink: 1 }}
            >
              <RowView gap={space[1]} style={{ height: component.dockBtn, paddingRight: space[2], maxWidth: component.backMax }}>
                <Icon name="chevronLeft" color={c.ink} />
                <T v="body" w="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {upLabel ?? t("common.back")}
                </T>
              </RowView>
            </Press>
            {right}
          </RowView>
          {nav.section ? (
            <T v="micro" tone="mut" w="semibold">
              {[t(nav.section), nav.kind ? t(nav.kind) : null].filter(Boolean).join(" · ")}
            </T>
          ) : null}
          <RowView style={{ gap: space[1] }}>
            <T v="title" numberOfLines={2} style={{ flexShrink: 1 }}>
              {title}
            </T>
            {help ? <HelpButton title={title} text={help} /> : null}
          </RowView>
        </>
      ) : (
        /* tab root: the big title is where you are */
        <RowView style={{ justifyContent: "space-between", minHeight: size.hitMin }}>
          <RowView style={{ flex: 1, gap: space[1] }}>
            <T v="display" numberOfLines={1} style={{ flexShrink: 1 }}>
              {title}
            </T>
            {help ? <HelpButton title={title} text={help} /> : null}
          </RowView>
          {right}
        </RowView>
      )}
      {subtitle ? (
        <T v="body" tone="mut">
          {subtitle}
        </T>
      ) : null}
      <OfflineBadge />
      {help && hintKey && !hints.seen(hintKey) ? (
        <Card style={{ borderColor: c.acc }}>
          <RowView style={{ alignItems: "flex-start" }}>
            <Icon name="help" s={size.iconMd} />
            <T v="body" style={{ flex: 1 }}>
              {help}
            </T>
          </RowView>
          <Press
            onPress={() => hints.dismiss(hintKey)}
            visibleHeight={component.button.sm}
            accessibilityRole="button"
            accessibilityLabel={t("common.gotIt")}
            style={{ alignSelf: "flex-end", height: component.button.sm, paddingHorizontal: space[3], borderRadius: radius.pill, backgroundColor: c.surf2, justifyContent: "center" }}
          >
            <T v="button">{t("common.gotIt")}</T>
          </Press>
        </Card>
      ) : null}
    </View>
  );
  const content = (
    <View style={{ width: "100%", maxWidth: layout.contentMax, alignSelf: "center", gap: space[3] }}>
      {header}
      {children}
    </View>
  );
  const { height: winH } = useWindowDimensions();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const tabsY = useRef(0);
  const offset = useRef(0);
  useEffect(() => {
    if (tabs && offset.current > tabsY.current) scrollRef.current?.scrollTo({ y: tabsY.current, animated: true });
  }, [tabKey, tabs]);
  const column = { width: "100%" as const, maxWidth: layout.contentMax, alignSelf: "center" as const };
  return (
    <View style={{ flex: 1 }}>
      <Background />
      {scroll ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "android" ? avoidBehavior : undefined} enabled={Platform.OS === "android"}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ paddingTop: navInsets.top, paddingBottom: kb ? space[6] : navInsets.bottom, paddingHorizontal: space[4] }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets
            stickyHeaderIndices={tabs ? [1] : undefined}
            scrollEventThrottle={16}
            onScroll={tabs ? (e) => (offset.current = e.nativeEvent.contentOffset.y) : undefined}
          >
            {content}
            {tabs ? (
              <View
                onLayout={(e) => (tabsY.current = e.nativeEvent.layout.y)}
                style={{ backgroundColor: c.bg, paddingVertical: space[2], marginHorizontal: -space[4], paddingHorizontal: space[4] }}
              >
                <View style={column}>{tabs}</View>
              </View>
            ) : null}
            {tabs ? <View style={[column, { gap: space[3], paddingTop: space[2], minHeight: winH - navInsets.top - navInsets.bottom }]}>{below}</View> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <View style={{ flex: 1, paddingTop: navInsets.top, paddingBottom: navInsets.bottom, paddingHorizontal: space[4] }}>{content}</View>
      )}
    </View>
  );
}
