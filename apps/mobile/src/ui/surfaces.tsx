import { BlurView } from "expo-blur";
import { VersionBadge } from "@/features/version";
import { DemoBadge } from "@/features/DemoBadge";
import { ScreenScrollCtx, type ScreenScroll } from "./requiredForm";
import { coveredBottomOf, scrollTargetY } from "./requiredLogic";
import { setFooterInset } from "./footerInset";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { router, useFocusEffect, useLocalSearchParams, useRoute } from "expo-router";
import { isAppPath, navInsets } from "@/nav/shell";
import { goTo } from "@/nav/go";
import { rememberFocus, takeFocus } from "@/nav/focusMemory";
import { isTabScreen } from "@/nav/roles";
import { BackSwipe } from "@/nav/BackSwipe";
import { tabBackSwipe } from "@/nav/backSwipe";
import { showsTabBar } from "@/nav/tabBarRule";
import { useAuth } from "@/cloud/auth";
import { useTabBarHidden } from "@/nav/tabBarHide";
import { Fab } from "@/nav/Fab";
import { HomeHeader } from "@/nav/HomeHeader";
import { SearchEntry } from "@/nav/SearchEntry";
import type { FabCtx, FabItem, FabSet } from "@/nav/sections";
import { badgeState } from "@/data/syncLink";
import { screenPath } from "./screenPath";
import { breadcrumbs, collapseCrumbs, navContext, type Crumb, type Label } from "@/nav/hierarchy";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewInstance, type StyleProp, type ViewStyle } from "react-native";
import { avoidBehavior, useKeyboardHeight } from "./keyboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from "react-native-svg";
import { component, layout, motion, radius, size, space, z, type StatusName } from "@octo/design-tokens";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
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
  return (
    <FieldColumnCtx.Provider value={false}>
      <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>
    </FieldColumnCtx.Provider>
  );
}

/**
 * True inside a `FieldGroup` (a column of fields), false again inside a `RowView`. A labelled field shares a row's width (`flex: 1`),
 * but in a column it takes its own height: on the web a column of `flex: 1` items makes them all one height, and a tall
 * field (a note) was cut (#1411).
 */
const FieldColumnCtx = createContext(false);
export const useFieldColumn = () => useContext(FieldColumnCtx);

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

/**
 * A group of a form's fields, straight on the screen's background — no card around them (DS §11 п.17, #1411): the field has its own
 * frame and fill, a second plate only eats the width. The group's title is a `SectionTitle` (a group without one keeps the same room above it); fields inside are `space[3]` apart.
 */
export function FieldGroup({
  title,
  right,
  children,
  testID,
  under,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  testID?: string;
  /** the group stands right under a title the screen already shows: no room of its own above it */
  under?: boolean;
}) {
  // a group without a title keeps the same room above it as a title would (`SectionTitle` stands `space[3]` lower): groups stay apart;
  // flexShrink 0: the screen's column never squeezes the group
  return (
    <FieldColumnCtx.Provider value>
      <View testID={testID} style={{ gap: space[3], marginTop: title || under ? 0 : space[3], flexShrink: 0 }}>
        {title ? <SectionTitle title={title} right={right} /> : null}
        {children}
      </View>
    </FieldColumnCtx.Provider>
  );
}

/** List row: 44–52 tall (rows are not buttons). */
export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  selected,
  chevron = true,
  minHeight = size.rowMax,
  lines = 1,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  /** a chosen row of a list of choices: read out as selected (a mark is `right`) */
  selected?: boolean;
  /** the «›» of a row that opens something; a row that CHOOSES shows its own mark instead (default: shown with `onPress`) */
  chevron?: boolean;
  /** the row's least height (`rowMax` 52; a choice row — `rowOption` 48) */
  minHeight?: number;
  /** how many lines the title and the subtitle may take (default 1; long addresses — 2) */
  lines?: number;
}) {
  const { c } = useTheme();
  const body = (
    <RowView style={{ minHeight, paddingVertical: space[2], gap: space[3] }}>
      {left}
      <View style={{ flex: 1 }}>
        <T v="body" w="semibold" numberOfLines={lines}>
          {title}
        </T>
        {subtitle ? (
          <T v="caption" tone="mut" numberOfLines={lines}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
      {onPress && chevron ? <Icon name="chevronRight" s={size.iconSm} color={c.mut} /> : null}
    </RowView>
  );
  return onPress ? (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={title} accessibilityState={selected === undefined ? undefined : { selected }} aria-selected={selected}>
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

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.bd }} />;
}

export function Empty({ icon, title, hint, action, testID }: { icon: IconKey; title: string; hint?: string; action?: ReactNode; testID?: string }) {
  const { c } = useTheme();
  return (
    <Card style={{ alignItems: "center", paddingVertical: space[8], gap: space[3] }}>
      <View
        testID={testID}
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
  const { notSavedOnDevice } = useStore();
  const { c } = useTheme();
  const { t } = useI18n();
  const sync = <SyncChip compact={compact} />;
  if (!notSavedOnDevice) return sync;
  // the device refused a write (full storage, A-02): its own line next to «Не отправлено: N», never instead of it
  const label = t("storage.notSaved.badge");
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", alignSelf: compact ? "center" : "flex-start", gap: space[1] }}>
      {sync}
      <View
        testID="storage-not-saved"
        accessibilityLabel={label}
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: component.chip.h,
          paddingHorizontal: component.chip.px,
          borderRadius: radius.pill,
          backgroundColor: c.status.bad.fill,
          gap: space[1],
        }}
      >
        <Icon name="alert" s={size.iconSm} color={c.status.bad.on} />
        <T v="caption" w="semibold" style={{ color: c.status.bad.on }} numberOfLines={1}>
          {label}
        </T>
      </View>
    </View>
  );
}
function SyncChip({ compact }: { compact?: boolean }) {
  const { online, link, queue, stuckOps } = useStore();
  const { c } = useTheme();
  const { t } = useI18n();
  // the network is there, the server answers «not now» (5xx, 429): not «no network» (docs/specs/23 §3)
  const state = badgeState(online, link, queue.length, stuckOps.length);
  if (!state) return null;
  const tone = state === "sending" ? c.status.info : state === "stuck" ? c.status.bad : c.status.warn;
  const label =
    state === "offline" ? t("offline.badge", { n: queue.length }) : state === "server" ? t("sync.server.badge", { n: queue.length }) : state === "stuck" ? t("sync.stuck.badge", { n: stuckOps.length }) : t("nav.sync.sending", { n: queue.length });
  const chip = (
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
      <Icon name={state === "offline" ? "wifiOff" : state === "server" || state === "stuck" ? "alert" : "send"} s={size.iconSm} color={tone.on} />
      <T v="caption" w="semibold" style={{ color: tone.on }} numberOfLines={1}>
        {label}
      </T>
    </View>
  );
  // «Не отправлено»: the badge opens the cards with «Повторить» / «Отменить изменение…» (docs/specs/23 §3)
  return state === "stuck" ? (
    <Press accessibilityRole="button" accessibilityLabel={label} visibleHeight={component.chip.h} onPress={() => router.push("/settings/profile")} containerStyle={{ alignSelf: compact ? "center" : "flex-start" }}>
      {chip}
    </Press>
  ) : (
    chip
  );
}
/* ---------- Nav metrics shared by Screen, TabBar, «＋», sheets (pure part: navInsets in nav/shell.ts) ---------- */
/** `path`: the screen's own address — the client page and sign-in have no side menu, their left edge takes the notch */
export function useNavInsets(path?: string) {
  const insets = useSafeAreaInsets();
  const { wide } = useDevice();
  return navInsets(insets, wide, wide && (path === undefined || isAppPath(path)));
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
/**
 * Lock the screen's scroll while a finger draws (signature, founder 07.11: «страница скроллится вместе с пальцем —
 * подписать нельзя»). On iOS the native scroll takes the gesture from a JS responder inside it; the pad asks the
 * screen to stop scrolling for the stroke. Outside a Screen it is a no-op.
 */
const ScrollLockCtx = createContext<(locked: boolean) => void>(() => {});
export const useScrollLock = () => useContext(ScrollLockCtx);

export function Screen({
  title,
  help,
  right,
  children,
  scroll = true,
  onScrollBegin,
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
  footer,
  aside,
  testID,
}: {
  title: string;
  help?: string;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  /** a finger starts to scroll the page (an open row of the estimate closes and keeps what is typed, DS §8.3) */
  onScrollBegin?: () => void;
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
  /** the pinned panel of the screen's main action (ui/actionBar.tsx, DS §8.9): phone — at the bottom over the content, which leaves room
   *  for it; hidden while the keyboard is up (the keys cover it, the field is what the person is in). From 820 the screen puts the same
   *  buttons in its own column. */
  footer?: ReactNode;
  /** 1280: the open card beside the list (ui/listPanel.tsx, spec 06 «Панель 1280»): the list scrolls on its own, the panel on the right */
  aside?: ReactNode;
  /** the screen's content, for the tests (a record that opened: its own testID, not its words — CHECKS §9 п.2) */
  testID?: string;
}) {
  const kb = useKeyboardHeight();
  /** the pinned panel stands on a phone only, and not under the keyboard */
  const [footH, setFootH] = useState(0);
  // the pinned bar stands on the screen's own bottom edge (the home indicator), not on the room kept for the tab bar and «＋»
  const safe = useSafeAreaInsets();
  const hints = useHints();
  const { c } = useTheme();
  const { t } = useI18n();
  const store = useStore();
  // This screen's own address, not the app's: during «back» the app's address still points at the card
  // for a moment, and the list under it drew the card's header (screenPath.ts).
  const params = useLocalSearchParams();
  const pathname = screenPath(useRoute().name, params);
  const navInsets = useNavInsets(pathname);
  const routeName = useRoute().name;
  const auth = useAuth();
  /** the bar is away while a signature is drawn (docs/specs/28): «＋» goes down to its place */
  const barAway = useTabBarHidden();
  // the legal texts: «‹ Помощь» only inside the open app; from sign-in / the consent gate their own «back» (review #274)
  const nav = navContext(pathname, params, store.db, store.role, { appOpen: !!auth.session && auth.legal !== "first" && auth.legal !== "changed" });
  const up = nav.up;
  /** a ☰ root (Leads, Jobs, Catalog…, docs/specs/13а §3): a root like a tab — ☰, not the screen's own «back» */
  const menuRoot = !up && !!nav.section;
  const hasUp = !!(up || (back && !menuRoot));
  const upLabel = up ? ("key" in up.label ? t(up.label.key) : up.label.text) : undefined;
  const trail = up ? breadcrumbs(pathname, params, store.db, store.role) : [];
  const go = goTo;
  const goUp = () => (up ? go(up.href) : back?.());
  const { wide, device } = useDevice();
  /** the pinned bar stands only where the phone has no tab bar (docs: NO_TAB_BAR — a form, a full-screen flow), else the two would meet */
  const footerOn = !!footer && !wide && !showsTabBar(routeName);
  /** tablet/desktop: the address bar is pinned above the scroll, with a round «‹» (spec 10, Н2) */
  // a tab opened from «More» (Plan, Triage…) has a parent too, but it lives in the tab navigator that already draws the pill
  const pinned = wide && !!up && !isTabScreen(routeName);
  /** phone, a section opened from «Ещё» (Jobs, Money, Catalog…; Leads with from=more): «‹ Ещё» — no ☰ any more (variant Б) */
  const backMore = !wide && menuRoot && (!isTabScreen(routeName) || params.from === "more");
  const toMore = () => go("/more");
  /** a tab screen with a header «back» swipes back from the left edge too, by the same handler (nav/backSwipe.ts) */
  const swipeBack = tabBackSwipe({ tabScreen: isTabScreen(routeName), wide, os: Platform.OS, back: hasUp || backMore, keyboard: kb > 0 });
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
      <DemoBadge />
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
            {backMore ? (
              <Press
                testID="back-more"
                onPress={toMore}
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
      {/* «Искать везде» on «Главная» (13 v2 §2.2) */}
      {home ? <SearchEntry /> : null}
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
    <View testID={testID} style={{ width: "100%", maxWidth: layout.contentMax, alignSelf: "center", gap: space[3] }}>
      {header}
      {children}
    </View>
  );
  const { height: winH } = useWindowDimensions();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [scrollLocked, setScrollLocked] = useState(false);
  /** the content has gone up under the status bar: the clock gets its glass backdrop (spec 32 §7) */
  const [under, setUnder] = useState(false);
  const reduce = useReducedMotion();
  const tabsY = useRef(0);
  const offset = useRef(0);
  // the forms under the screen scroll it to a field (DS §11 п.3): the view's place in the window, then to `margin` below the top
  // the top of the content lies under the status bar / header (`top`, below): the field stops below it, not at the very top
  const coveredTop = useRef(0);
  const coveredBottom = useRef(0);
  /** the height of the content and of the window it scrolls in: the page can go no further than their difference */
  const contentH = useRef(0);
  /** the last jump we made with scrollTo: scroll events of the jumps before it may still arrive and are older than it */
  const lastJump = useRef<{ y: number; at: number } | null>(null);
  const viewH = useRef(0);
  /** the browser's page: where it is scrolled to right now (a phone: unknown here — the scroll events tell) */
  const realTop = (): number | undefined => {
    if (Platform.OS !== "web") return undefined;
    const top = (scrollRef.current as unknown as { getScrollableNode?: () => { scrollTop?: number } | null } | null)?.getScrollableNode?.()?.scrollTop;
    return typeof top === "number" ? top : undefined;
  };
  const screenScroll = useRef<ScreenScroll>({
    scrollBy: (dy) => {
      // the place is kept at once: the next tick of a held row must not read the old one while the scroll event is on its way
      offset.current = Math.max(0, Math.min(offset.current + dy, contentH.current > 0 ? Math.max(0, contentH.current - viewH.current) : Number.POSITIVE_INFINITY));
      scrollRef.current?.scrollTo({ y: offset.current, animated: false });
      // the browser scrolls at once and stops at the real end (the page may have got shorter a moment ago — a held row folds the
      // list): read where it really is, else the asked place runs past the end and a held row drifts from the finger (#1307 «б»)
      const real = realTop();
      if (real !== undefined) offset.current = real;
      lastJump.current = { y: offset.current, at: Date.now() };
    },
    offsetNow: () => {
      const real = realTop();
      if (real !== undefined) offset.current = real;
      return offset.current;
    },
    measureVisible: (cb) => {
      const sv = scrollRef.current;
      if (!sv) return cb(null);
      sv.measureInWindow((_x, y, _w, h) => cb({ top: y + coveredTop.current, bottom: y + h - coveredBottom.current }));
    },
    offset: () => offset.current,
    scrollToNode: (node, margin, animated, done) => {
      const sv = scrollRef.current;
      if (!sv) return void done?.();
      sv.measureInWindow((_sx, sy) => {
        node.measureInWindow((_x, y) => {
          sv.scrollTo({ y: scrollTargetY({ offset: offset.current, nodeY: y, viewY: sy, covered: coveredTop.current, margin }), animated });
          // the scroll event of a jump comes a frame later: a caller that focuses a field waits for it (a scroll right after
          // the focus is a drag to «on-drag» keyboard dismiss, and the field loses it)
          if (done) requestAnimationFrame(() => requestAnimationFrame(done));
        });
      });
    },
  }).current;
  useEffect(() => {
    if (tabs && offset.current > tabsY.current) scrollRef.current?.scrollTo({ y: tabsY.current, animated: true });
  }, [tabKey, tabs]);
  const column = { width: "100%" as const, maxWidth: layout.contentMax, alignSelf: "center" as const };
  const top = pinned ? space[3] : navInsets.top;
  coveredTop.current = pinned ? 0 : navInsets.top;
  coveredBottom.current = coveredBottomOf({ keyboard: !!kb, keyboardMargin: space[6], navBottom: navInsets.bottom, fab: floatFab ? component.fab + space[3] : 0, footer: footerOn ? footH : 0 });
  useEffect(() => {
    setFooterInset(footerOn && !kb ? footH : 0);
    return () => setFooterInset(0);
  }, [footerOn, kb, footH]);
  /** the pinned bar is outside the scroll: the sticky-tabs area below is one screen minus the bar */
  const [barH, setBarH] = useState(0);
  return (
    <BackSwipe enabled={swipeBack} edge={navInsets.left} onBack={hasUp ? goUp : toMore}>
      <View style={{ flex: 1 }}>
        <Background />
        {pinned ? (
          <View
            onLayout={(e) => setBarH(e.nativeEvent.layout.height)}
            style={{ paddingTop: navInsets.safeTop + space[3], paddingBottom: space[1], paddingLeft: navInsets.left, paddingRight: navInsets.right, gap: space[2], borderBottomWidth: component.hairline, borderBottomColor: c.bd }}
          >
            <View style={column}>{addressRow}</View>
          </View>
        ) : null}
        <View style={{ flex: 1, flexDirection: "row" }}>
        <View style={{ flex: 1 }}>
        {scroll ? (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "android" ? avoidBehavior : undefined} enabled={Platform.OS === "android"}>
            <ScrollView
              ref={scrollRef}
              scrollEnabled={!scrollLocked}
              contentContainerStyle={{ paddingTop: top, paddingBottom: kb ? space[6] : navInsets.bottom + (floatFab ? component.fab + space[3] : 0) + (footerOn ? footH : 0), paddingLeft: navInsets.left, paddingRight: navInsets.right }}
              keyboardShouldPersistTaps="handled"
              // react-native-web closes the field on ANY scroll event with "on-drag" (even the browser's own scroll to a field that takes the
              // focus, or ours to a heading): a field closed after 0–1 letters (#1241). The web has no finger dragging a keyboard away.
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : Platform.OS === "android" ? "on-drag" : "none"}
              automaticallyAdjustKeyboardInsets
              stickyHeaderIndices={tabs ? [1] : undefined}
              scrollEventThrottle={16}
              onContentSizeChange={(_w, h) => (contentH.current = h)}
              onLayout={(e) => (viewH.current = e.nativeEvent.layout.height)}
              onScrollBeginDrag={onScrollBegin}
              onScroll={(e) => {
                const y = e.nativeEvent.contentOffset.y;
                // a late event of an earlier jump (a held row's autoscroll makes one every 16 ms) is older than what we asked of the
                // scroll: the place is the last one asked, until the events catch up with it (else the held row lagged by a few steps)
                const jump = lastJump.current;
                if (!jump || Date.now() - jump.at > 250 || Math.abs(y - jump.y) < 1) offset.current = y;
                const now = y > 0;
                if (now !== under) setUnder(now);
              }}
            >
              <ScrollLockCtx.Provider value={setScrollLocked}>
                <ScreenScrollCtx.Provider value={screenScroll}>{content}</ScreenScrollCtx.Provider>
              </ScrollLockCtx.Provider>
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
          <View style={{ flex: 1, paddingTop: top, paddingBottom: navInsets.bottom, paddingLeft: navInsets.left, paddingRight: navInsets.right }}>{content}</View>
        )}
        </View>
        {aside}
        </View>
        {/* the status bar backdrop: the same glass as the bars (--ov + blur), only while something is under the clock */}
        {scroll && under && !pinned && navInsets.safeTop > 0 ? (
          // the hairline makes the cut-off card go under the glass, not end at a line; it fades in (none with reduced motion)
          <Animated.View
            testID="status-backdrop"
            pointerEvents="none"
            entering={reduce ? undefined : FadeIn.duration(motion.durFast)}
            exiting={reduce ? undefined : FadeOut.duration(motion.durFast)}
            style={{ position: "absolute", top: 0, left: 0, right: 0, height: navInsets.safeTop, backgroundColor: c.ov, overflow: "hidden", borderBottomWidth: component.hairline, borderBottomColor: c.bd }}
          >
            <BlurView intensity={c.blur * 3} tint={c.blurTint} style={StyleSheet.absoluteFill} />
          </Animated.View>
        ) : null}
        {footerOn && !kb ? (
          <View
            onLayout={(e) => setFootH(e.nativeEvent.layout.height)}
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: z.nav, paddingLeft: navInsets.left, paddingRight: navInsets.right }}
          >
            {footer}
            {/* under the home indicator the bar goes on in one fill (the glass has its own, the corners above stay round) */}
            {safe.bottom > 0 ? <View style={{ height: safe.bottom, backgroundColor: c.ov }} /> : null}
          </View>
        ) : null}
        {floatFab && !kb ? (
          <Fab placement="float" set={fab!} ctx={fabCtx} on={fabOn} right={navInsets.right} bottom={showsTabBar(routeName) && !barAway ? navInsets.tabBottom + size.tabbarH + space[3] : navInsets.tabBottom + space[2]} />
        ) : null}
      </View>
    </BackSwipe>
  );
}
