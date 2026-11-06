import { BlurView } from "expo-blur";
import { VersionBadge } from "@/features/version";
import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { useFocusEffect, useLocalSearchParams, useRoute } from "expo-router";
import { goTo } from "@/nav/go";
import { rememberFocus, takeFocus } from "@/nav/focusMemory";
import { isTabScreen } from "@/nav/roles";
import { Fab } from "@/nav/Fab";
import { HomeHeader } from "@/nav/HomeHeader";
import type { FabCtx, FabItem, FabSet } from "@/nav/sections";
import { syncState } from "@/nav/shell";
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
    // clipped to the screen: next to the side menu (820/1280) the screen is narrower than the window
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, overflow: "hidden" }]} pointerEvents="none">
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

/* ---------- Sync badge (DS rule 11: queue counter visible; 13 v2 §2.2, §2.6) ----------
 * Only while there is something to say: no network (warn) or the queue still going out (info). */
export function SyncBadge({ compact }: { compact?: boolean }) {
  const { online, queue } = useStore();
  const { c } = useTheme();
  const { t } = useI18n();
  const state = syncState(online, queue.length);
  if (!state) return null;
  const tone = state === "offline" ? c.status.warn : c.status.info;
  const label = state === "offline" ? t("offline.badge", { n: queue.length }) : t("nav.sync.sending", { n: queue.length });
  return (
    <View
      testID="sync-badge"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: compact ? "center" : "flex-start",
        height: component.chip.h,
        paddingHorizontal: component.chip.px,
        borderRadius: radius.pill,
        backgroundColor: tone.fill,
        gap: space[1],
      }}
    >
      <Icon name={state === "offline" ? "wifiOff" : "send"} s={size.iconSm} color={tone.on} />
      <T v="caption" w="semibold" style={{ color: tone.on }} numberOfLines={1}>
        {label}
      </T>
    </View>
  );
}
/* ---------- Nav metrics shared by Screen and TabBar ---------- */
export function useNavInsets() {
  const insets = useSafeAreaInsets();
  const { wide } = useDevice();
  const bottomGap = space[2];
  return {
    wide,
    // 820/1280: the menu is on the left (SideNav, docs/specs/13 §2.5) — nothing above the screen any more
    top: wide ? insets.top + space[3] : insets.top + space[2],
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

/** The screen title takes focus only so a screen reader starts there (spec 10, Н3а): it is not a control, no ring.
 *  react-native-web passes outlineStyle through; RN's types only list solid/dotted/dashed. */
const noFocusRing = (Platform.OS === "web" ? { outlineStyle: "none" } : {}) as ViewStyle;

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
  fab,
  fabCtx,
  fabOn,
  home,
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
  /** the screen's «＋» set (13 v2 §2.4): phone — floating bottom-right; 820/1280 — «＋» in the header */
  fab?: FabSet;
  /** what the new thing is tied to (the screen's client, job, visit…) */
  fabCtx?: FabCtx;
  /** «＋» items only this screen can do (Plan: its own «Записать в план» sheet) */
  fabOn?: Partial<Record<NonNullable<FabItem["act"]>, () => void>>;
  /** «Главная» of a role: the bell, the sync badge and the profile on the right (13 v2 §2.2, §3.14) */
  home?: boolean;
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
  const routeName = useRoute().name;
  const nav = navContext(pathname, params, store.db, store.role);
  const up = nav.up;
  /** a ☰ root (Leads, Jobs, Catalog…, docs/specs/13а §3): a root like a tab — ☰, not the screen's own «back» */
  const menuRoot = !up && !!nav.section;
  const hasUp = !!(up || (back && !menuRoot));
  const upLabel = up ? ("key" in up.label ? t(up.label.key) : up.label.text) : undefined;
  const trail = up ? breadcrumbs(pathname, params, store.db, store.role) : [];
  const go = goTo;
  const goUp = () => (up ? go(up.href) : back?.());
  const { wide, device } = useDevice();
  /** tablet/desktop: the address bar is pinned above the scroll, with a round «‹» (spec 10, Н2) */
  // a tab opened from «More» (Plan, Triage…) has a parent too, but it lives in the tab navigator that already draws the pill
  const pinned = wide && !!up && !isTabScreen(routeName);
  // Esc = one level up on the web (spec 10, Н3); only screens with a parent (not the client page /p, not sign-in).
  const goUpRef = useRef(goUp);
  goUpRef.current = goUp;
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "web" || !up || typeof document === "undefined") return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape" || e.defaultPrevented || e.repeat || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        // an open sheet or menu closes first (react-native-web Modal closes on keyup, aria-modal is still there now)
        if (document.querySelector('[aria-modal="true"]')) return;
        // typing in a field: Esc is not "leave the screen"
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
        goUpRef.current();
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [up?.href]),
  );
  // Focus after a move (spec 10, 1.7, Н3а; web only): coming back UP — where you left; coming DOWN — this screen's title.
  const titleRef = useRef<ComponentRef<typeof View>>(null);
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "web" || typeof document === "undefined") return;
      const back = takeFocus(pathname) as HTMLElement | undefined;
      const frame = requestAnimationFrame(() => {
        // the screen already put the focus somewhere (a field with autoFocus): leave it
        const cur = document.activeElement as HTMLElement | null;
        if (cur && cur !== document.body && cur.offsetParent !== null) return;
        const target = back && back.isConnected && back.offsetParent !== null ? back : (titleRef.current as unknown as HTMLElement | null);
        target?.focus?.({ preventScroll: !!back });
      });
      return () => {
        cancelAnimationFrame(frame);
        const el = document.activeElement;
        rememberFocus(pathname, el && el !== document.body ? el : null);
      };
    }, [pathname]),
  );
  /** 820/1280: the screen's «＋» sits in its header, no floating button (13 v2 §2.5) */
  const headerFab = fab && wide ? <Fab placement="header" set={fab} ctx={fabCtx} on={fabOn} /> : null;
  const floatFab = !!fab && !wide;
  const addressRow = hasUp ? (
          <RowView style={{ justifyContent: "space-between", minHeight: size.hitMin, gap: space[2] }}>
            {pinned && up ? (
              <Press
                onPress={goUp}
                visibleHeight={component.button.md}
                accessibilityRole="button"
                accessibilityLabel={upLabel ? t("nav.backTo", { to: upLabel }) : t("common.back")}
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
            {right || headerFab ? (
              <RowView gap={space[2]} style={{ flexShrink: 0 }}>
                {right}
                {headerFab}
              </RowView>
            ) : null}
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
            <View ref={titleRef} role="heading" aria-level={1} tabIndex={-1} style={[{ flexShrink: 1 }, noFocusRing]}>
              <T v="title" numberOfLines={2}>
                {title}
              </T>
            </View>
            {help ? <HelpButton title={title} text={help} /> : null}
          </RowView>
        </>
      ) : (
        /* tab root: the big title is where you are (docs/specs/13 §2.2; no ☰ since variant Б).
           The screen's actions wrap under the title when the row is too narrow (Plan at 390), never squeeze it. */
        <RowView style={{ justifyContent: "space-between", minHeight: size.hitMin, flexWrap: "wrap", rowGap: space[2] }}>
          <RowView style={{ flexGrow: 1, flexShrink: 0, maxWidth: "100%", gap: space[1] }}>
            {/* phone, a section opened from «Ещё» outside the tabs (Jobs, Money, Catalog…): «‹ Ещё» — no ☰ any more (variant Б) */}
            {!wide && menuRoot && !isTabScreen(routeName) ? (
              <Press
                testID="back-more"
                onPress={() => go("/more")}
                visibleHeight={component.dockBtn}
                accessibilityRole="button"
                accessibilityLabel={t("nav.more")}
                style={{ width: component.dockBtn, height: component.dockBtn, borderRadius: radius.pill, backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="chevronLeft" s={size.iconMd} color={c.ink} />
              </Press>
            ) : null}
            <View ref={titleRef} role="heading" aria-level={1} tabIndex={-1} style={[{ flexShrink: 1 }, noFocusRing]}>
              <T v="display" numberOfLines={1}>
                {title}
              </T>
            </View>
            {help ? <HelpButton title={title} text={help} /> : null}
          </RowView>
          {right || headerFab || home ? (
            <RowView gap={space[2]} style={{ marginLeft: "auto" }}>
              {right}
              {headerFab}
              {home ? <HomeHeader /> : null}
            </RowView>
          ) : null}
        </RowView>
      )}
      {subtitle ? (
        <T v="body" tone="mut">
          {subtitle}
        </T>
      ) : null}
      {home ? null : <SyncBadge />}
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
  /** the pinned bar is outside the scroll: the sticky-tabs area below is one screen minus the bar */
  const [barH, setBarH] = useState(0);
  return (
    <View style={{ flex: 1 }}>
      <Background />
      {pinned ? (
        <View
          onLayout={(e) => setBarH(e.nativeEvent.layout.height)}
          style={{ paddingTop: navInsets.safeTop + space[3], paddingBottom: space[1], paddingHorizontal: space[4], gap: space[2], borderBottomWidth: component.hairline, borderBottomColor: c.bd }}
        >
          <View style={column}>{addressRow}</View>
        </View>
      ) : null}
      {scroll ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "android" ? avoidBehavior : undefined} enabled={Platform.OS === "android"}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ paddingTop: top, paddingBottom: kb ? space[6] : navInsets.bottom + (floatFab ? component.fab + space[3] : 0), paddingHorizontal: space[4] }}
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
                // glass (--ov + blur), not a solid plate: in the light theme the bar blends with the page (unslop 05.11)
                style={{ backgroundColor: c.ov, overflow: "hidden", paddingVertical: space[2], marginHorizontal: -space[4], paddingHorizontal: space[4] }}
              >
                <BlurView intensity={c.blur * 3} tint={c.blurTint} style={StyleSheet.absoluteFill} />
                <View style={column}>{tabs}</View>
              </View>
            ) : null}
            {tabs ? <View style={[column, { gap: space[3], paddingTop: space[2], minHeight: winH - top - navInsets.bottom - (pinned ? barH : 0) }]}>{below}</View> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <View style={{ flex: 1, paddingTop: top, paddingBottom: navInsets.bottom, paddingHorizontal: space[4] }}>{content}</View>
      )}
      {floatFab && !kb ? (
        <Fab placement="float" set={fab!} ctx={fabCtx} on={fabOn} bottom={isTabScreen(routeName) ? navInsets.tabBottom + size.tabbarH + space[3] : navInsets.tabBottom + space[2]} />
      ) : null}
    </View>
  );
}
