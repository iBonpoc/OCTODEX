import { VersionBadge } from "@/features/version";
import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { useFocusEffect, useLocalSearchParams, useRoute } from "expo-router";
import { goTo } from "@/nav/go";
import { screenPath } from "./screenPath";
import { breadcrumbs, collapseCrumbs, navContext, type Crumb, type Label } from "@/nav/hierarchy";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewInstance, type StyleProp, type ViewStyle } from "react-native";
import { avoidBehavior, useKeyboardHeight } from "./keyboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from "react-native-svg";
import { component, layout, radius, size, space, type StatusName } from "@octo/design-tokens";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Icon, Press, T, type IconKey } from "./primitives";
import { HelpButton, Menu } from "./overlays";
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

/* ---------- Breadcrumbs: "⌂ Today › Clients › Client card" — like an address bar, every level is a link ----------
 * Phone: more than 3 levels fold into "⌂ › … › Parent"; "…" opens the hidden levels as a menu.
 * The parent keeps the "Back to …" name (screen readers, the e2e runs).
 */
function Breadcrumbs({ trail, current, go }: { trail: Crumb[]; current?: string; go: (href: string) => void }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const { wide } = useDevice();
  const moreRef = useRef<ComponentRef<typeof View>>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const text = (l: Label) => ("key" in l ? t(l.key) : l.text);
  const { shown, hidden, at } = collapseCrumbs(trail, wide ? trail.length : 3);
  const parent = trail[trail.length - 1]!;
  const sep = <Icon name="chevronRight" s={size.iconSm} color={c.mut} />;
  const crumb = (cr: Crumb) => {
    const name = text(cr.label);
    const isParent = cr === parent;
    return (
      <Press
        key={cr.href}
        onPress={() => go(cr.href)}
        visibleHeight={component.dockBtn}
        accessibilityRole="button"
        accessibilityLabel={isParent ? t("nav.backTo", { to: name }) : t("nav.goTo", { to: name })}
        containerStyle={{ flexShrink: 1, minWidth: 0 }}
      >
        <RowView gap={space[1]} style={{ height: component.dockBtn, maxWidth: component.crumbMax }}>
          {cr.home ? <Icon name="home" s={size.iconSm} color={c.ink} /> : null}
          {cr.home && !wide && trail.length > 1 ? null : (
            <T v="caption" w={isParent ? "semibold" : "medium"} numberOfLines={1} style={{ flexShrink: 1 }}>
              {name}
            </T>
          )}
        </RowView>
      </Press>
    );
  };
  const items: ReactNode[] = [];
  shown.forEach((cr, i) => {
    if (i === at)
      items.push(
        <View key="more" ref={moreRef} collapsable={false}>
          <Press
            onPress={() => moreRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setMenu({ x, y, w, h }))}
            visibleHeight={component.dockBtn}
            accessibilityRole="button"
            accessibilityLabel={t("nav.hiddenLevels")}
          >
            <RowView style={{ height: component.dockBtn }}>
              <Icon name="more" s={size.iconSm} color={c.ink} />
            </RowView>
          </Press>
        </View>,
        <View key="sep-more">{sep}</View>,
      );
    items.push(crumb(cr));
    if (i < shown.length - 1 || current) items.push(<View key={`sep-${cr.href}`}>{sep}</View>);
  });
  return (
    <View accessibilityRole="toolbar" accessibilityLabel={t("nav.trail")} style={{ flex: 1, minWidth: 0 }}>
      <RowView gap={space[1]} style={{ minHeight: size.hitMin }}>
        {items}
        {current ? (
          <T v="caption" tone="mut" numberOfLines={1} style={{ flexShrink: 2 }}>
            {current}
          </T>
        ) : null}
      </RowView>
      <Menu
        visible={!!menu}
        anchor={menu}
        title={t("nav.hiddenLevels")}
        items={hidden.map((cr) => ({ key: cr.href, label: text(cr.label) }))}
        onSelect={(href) => go(href)}
        onClose={() => setMenu(null)}
      />
    </View>
  );
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
  // This screen's own address, not the app's: during «back» the app's address still points at the card
  // for a moment, and the list under it drew the card's header (screenPath.ts).
  const params = useLocalSearchParams();
  const pathname = screenPath(useRoute().name, params);
  const nav = navContext(pathname, params, store.db, store.role);
  const up = nav.up;
  const hasUp = !!(up || back);
  const upLabel = up ? ("key" in up.label ? t(up.label.key) : up.label.text) : undefined;
  const trail = up ? breadcrumbs(pathname, params, store.db, store.role) : [];
  const go = goTo;
  const goUp = () => (up ? go(up.href) : back?.());
  const { wide, device } = useDevice();
  /** tablet/desktop: the address bar is pinned above the scroll, with a round «‹» (spec 10, Н2) */
  const pinned = wide && hasUp;
  // Esc = one level up on the web (spec 10, Н3). Capture phase: an open sheet or menu (aria-modal) closes first, on its own.
  const goUpRef = useRef(goUp);
  goUpRef.current = goUp;
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "web" || !hasUp || typeof document === "undefined") return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape" || e.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
        // typing in a field: Esc is not "leave the screen"
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
        goUpRef.current();
      };
      document.addEventListener("keydown", onKey, true);
      return () => document.removeEventListener("keydown", onKey, true);
    }, [hasUp]),
  );
  const addressRow = hasUp ? (
          <RowView style={{ justifyContent: "space-between", minHeight: size.hitMin, gap: space[2] }}>
            {pinned && up ? (
              <Press
                onPress={goUp}
                visibleHeight={component.button.md}
                accessibilityRole="button"
                accessibilityLabel={t("nav.upTo", { to: upLabel ?? "" })}
                style={{ width: component.button.md, height: component.button.md, borderRadius: radius.pill, borderWidth: component.hairline, borderColor: c.bd, backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="chevronLeft" s={size.iconSm} color={c.ink} />
              </Press>
            ) : null}
            {trail.length ? (
              <Breadcrumbs trail={trail} current={nav.kind ? t(nav.kind) : undefined} go={go} />
            ) : (
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
            )}
            {device === "desktop" ? (
              <RowView gap={space[1]} style={{ flexShrink: 0 }}>
                <View style={{ borderWidth: component.hairline, borderColor: c.bd, borderRadius: radius.tip, paddingHorizontal: space[1] }}>
                  <T v="caption" w="semibold">
                    Esc
                  </T>
                </View>
                <T v="caption" tone="mut">
                  {t("nav.escHint")}
                </T>
              </RowView>
            ) : null}
            {right}
          </RowView>
  ) : null;
  const header = (
    <View style={{ gap: space[2], marginBottom: space[3] }}>
      <VersionBadge />
      {hasUp ? (
        <>
          {/* detail screen: the trail "Home › … › Parent › This", actions on the right, then the title.
              Back is a swipe (iOS) / system back (Android); on the trail the parent is the "back" button.
              Tablet/desktop: the same row is pinned above the scroll (addressBar). */}
          {pinned ? null : addressRow}
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
  const top = pinned ? space[3] : navInsets.top;
  return (
    <View style={{ flex: 1 }}>
      <Background />
      {pinned ? (
        <View
          accessibilityRole="header"
          style={{ paddingTop: navInsets.top - space[3], paddingBottom: space[1], paddingHorizontal: space[4], borderBottomWidth: component.hairline, borderBottomColor: c.bd }}
        >
          <View style={column}>{addressRow}</View>
        </View>
      ) : null}
      {scroll ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "android" ? avoidBehavior : undefined} enabled={Platform.OS === "android"}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ paddingTop: top, paddingBottom: kb ? space[6] : navInsets.bottom, paddingHorizontal: space[4] }}
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
            {tabs ? <View style={[column, { gap: space[3], paddingTop: space[2], minHeight: winH - top - navInsets.bottom }]}>{below}</View> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <View style={{ flex: 1, paddingTop: top, paddingBottom: navInsets.bottom, paddingHorizontal: space[4] }}>{content}</View>
      )}
    </View>
  );
}
