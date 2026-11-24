import type { ComponentProps } from "react";
import { toastArmed } from "./toastArm";
import { stackDrop, stackLife, stackReplace, stackShow, stackTop } from "./toastStack";
import { useQueueLineHeight } from "./queueLineHeight";
import { toastBottom, useFooterInset, useToastRight, wideToastBottom } from "./footerInset";
import { fitMenuPlace, menuListHeight, menuScrollTo } from "./menuLayout";
import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ScreenScrollCtx } from "./requiredForm";
import { AccessibilityInfo, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewInstance } from "react-native";
import { avoidBehavior } from "./keyboard";
import { GestureDetector, GestureHandlerRootView, GestureStateManager, State, useNativeGesture, usePanGesture } from "react-native-gesture-handler";
import { menuPick } from "./menuPick";
import { exitDuration, scrimLevel, swipeCloses, swipeStart, swipeStep, type SwipeState } from "./sheetSwipe";
import { leaveBefore } from "./sheetLeave";
import { helpBack, helpClosed, helpOpen, pageSwitch, sheetHeader, type HelpPage } from "./sheetHelp";
import { useScrollFade } from "./scrollFade";
import { noteQuestionCancelled, registerDirtySheet } from "./dirtySheets";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut, SlideInDown, useAnimatedStyle, ReduceMotion, runOnJS, useReducedMotion, useSharedValue, withSpring, withTiming, Easing } from "react-native-reanimated";
import { component, motion, radius, size, space } from "@octo/design-tokens";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { router, type Href } from "expo-router";
import { Icon, Press, T, type IconKey } from "./primitives";
import type { GuardedUndo } from "@/data/undo";
import { SheetHead } from "./templates/screenHeader";

/**
 * Every modal turns with the device (docs/specs/32): without it an iPhone shows a modal in portrait only
 * (React Native's default) — a sheet opened in landscape turns the whole screen. Upside down too: an iPad in a stand
 * turned over (without the prop React Native gives an iPad all four); on an iPhone the app's own mask drops it.
 */
export const ALL_ORIENTATIONS: ("portrait" | "portrait-upside-down" | "landscape")[] = ["portrait", "portrait-upside-down", "landscape"];

/* ---------- Glass panel (overlay background --ov + blur --blurov) ---------- */
export function Glass({ children, style, strong, solid, testID }: { children: ReactNode; style?: object; strong?: boolean; solid?: boolean; testID?: string }) {
  const { c } = useTheme();
  // solid: no blur, `ovSolid` — a layer that sits over scrolling text must not show it through (the tab bar, #1467)
  if (solid) return <View testID={testID} style={[{ overflow: "hidden", backgroundColor: c.ovSolid, borderColor: c.bd, borderWidth: 1 }, style]}>{children}</View>;
  return (
    <View testID={testID} style={[{ overflow: "hidden", backgroundColor: c.ov, borderColor: c.bd, borderWidth: 1 }, style]}>
      <BlurView intensity={strong ? c.blurOverlay * 3 : c.blur * 3} tint={c.blurTint} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

/** the dim layer under a window; a tap on it asks to close (a window of a module that is not a Sheet) */
export function Scrim({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  const { t } = useI18n();
  return <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={t("common.close")} />;
}

/* ---------- Menu: iOS-style menu that opens right at the control (not a sheet from the bottom) ----------
 * `anchor` = the control's frame in the window (measureInWindow). Tap outside or Android back closes.
 */
export interface MenuItem<K extends string> {
  key: K;
  label: string;
  icon?: IconKey;
  selected?: boolean;
  destructive?: boolean;
  /** pale (`dimOpacity`) but pressable: the press explains why it cannot be done */
  dim?: boolean;
  /** the first item of its own group (after a line): actions after the choices of a label menu — «Сделать основным» (DS §9 А14а) */
  group?: boolean;
  testID?: string;
}
export function Menu<K extends string>({
  visible,
  anchor,
  items,
  onSelect,
  onClose,
  title,
  matchWidth,
  fit,
  a11yLabel,
}: {
  visible: boolean;
  anchor: { x: number; y: number; w: number; h: number } | null;
  items: MenuItem<K>[];
  onSelect: (k: K) => void;
  onClose: () => void;
  title?: string;
  /** a menu of a field: not narrower than its row, not wider than `modalW` (DS А2) */
  matchWidth?: boolean;
  /** the value menu of a field (DS §9б.4, #2412): as wide as its words (`menuW`…`select.menuMaxW`), its right edge on the field's
   *  (a field narrower than the menu — its left edge), `select.menuGap` under the field; no title */
  fit?: boolean;
  /** what the backdrop reads out when there is no title */
  a11yLabel?: string;
}) {
  const { c } = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  // an item picked runs only once the menu's Modal is gone (#743: on iOS a sheet opened while it closes never shows,
  // and its invisible layer takes every touch) — menuPick.ts
  const live = useRef({ onSelect, onClose });
  live.current = { onSelect, onClose };
  const picker = useMemo(
    () =>
      menuPick<K>({
        close: () => live.current.onClose(),
        select: (k) => live.current.onSelect(k),
        waitsForDismiss: Platform.OS === "ios",
        nextFrame: (f) => requestAnimationFrame(f),
        later: (f, ms) => {
          const id = setTimeout(f, ms);
          return () => clearTimeout(id);
        },
        // the net for a lost onDismiss: longer than any close of the menu (it has no animation on iOS)
        waitMs: motion.durSlow + motion.durFast,
      }),
    [],
  );
  // web: the focus goes back to what opened the menu when it closes — Esc, a pick or a tap outside (DS А2, З6)
  const opener = useRef<Element | null>(null);
  const isOpen = visible && !!anchor;
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (isOpen) {
      opener.current = document.activeElement;
      return;
    }
    const el = opener.current as HTMLElement | null;
    opener.current = null;
    if (el && el.isConnected && typeof el.focus === "function") el.focus();
  }, [isOpen]);
  // the Modal stays mounted after it closes (visible false), so iOS can say when it is gone; it keeps where it stood
  const listRef = useRef<ScrollViewInstance>(null);
  const scrolled = useRef(false);
  const rowAt = useRef<Record<string, { y: number; h: number }>>({});
  const contentSize = useRef(0);
  if (!(visible && !!anchor)) {
    scrolled.current = false;
    rowAt.current = {};
    contentSize.current = 0;
  }
  const last = useRef(anchor);
  if (anchor) last.current = anchor;
  const at = anchor ?? last.current;
  if (!at) return null;
  const open = visible && !!anchor;
  // the edges: 16 from the window, and clear of the notch and the home indicator (docs/specs/32)
  const e = { l: Math.max(insets.left, space[4]), r: Math.max(insets.right, space[4]), t: Math.max(insets.top, space[4]), b: Math.max(insets.bottom, space[4]) };
  const w = Math.min(fit ? component.select.menuMaxW : matchWidth ? Math.min(Math.max(component.menuW, at.w), component.modalW) : component.menuW, winW - e.l - e.r);
  const left = Math.max(e.l, Math.min(at.x, winW - w - e.r));
  // a value menu: the right edge on the field's when the field is as wide as the menu can be; else from the field's left edge
  const fitPlace = fitMenuPlace({ x: at.x, w: at.w, winW, minW: Math.min(component.menuW, w), maxW: w, edgeL: e.l, edgeR: e.r });
  const below = at.y + at.h + (fit ? component.select.menuGap : space[1]);
  // the menu never grows past the window (a phone on its side): it scrolls inside, every item can be reached
  const room = winH - e.t - e.b;
  // at most `menuMaxRows` rows show (the last one half: it scrolls); a window shorter than that cuts it further
  // the lines between groups (drawn below, before a group's first item) take their place too
  const lines = items.filter((it, i) => i > 0 && ((it.destructive && !items[i - 1]!.destructive) || it.group)).length;
  const listH = menuListHeight({ count: items.length, rowH: size.hitMin, maxRows: component.menuMaxRows, room, pad: space[2], titleH: title ? size.hitMin : 0, extra: lines * (component.hairline + space[1] * 2) });
  const scrollToChosen = () => {
    if (scrolled.current) return;
    const rows = Object.values(rowAt.current);
    if (rows.length < items.length) return; // every row has its place: the content is as high as the last one ends
    const contentH = Math.max(contentSize.current, ...rows.map((r) => r.y + r.h));
    if (contentH <= listH) return;
    const at = items.find((it) => it.selected);
    const row = at ? rowAt.current[at.key as string] : undefined;
    if (!row) return;
    scrolled.current = true;
    listRef.current?.scrollTo({ y: menuScrollTo({ rowY: row.y, rowH: row.h, viewH: listH, contentH }), animated: false });
  };
  const estH = Math.min(listH + (title ? size.hitMin : 0) + space[2] * 2, room);
  const gap = fit ? component.select.menuGap : space[1];
  const top = below + estH > winH - e.b ? Math.max(e.t, Math.min(at.y - estH - gap, winH - e.b - estH)) : below;
  return (
    <Modal transparent visible={open} animationType="none" onRequestClose={onClose} onDismiss={picker.dismissed} statusBarTranslucent supportedOrientations={ALL_ORIENTATIONS}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={title ?? a11yLabel ?? ""} />
      <Animated.View
        entering={reduce ? undefined : FadeIn.duration(motion.durFast)}
        exiting={reduce ? undefined : FadeOut.duration(motion.durFast)}
        style={fit ? { position: "absolute", top, ...fitPlace } : { position: "absolute", left, top, width: w }}
        accessibilityRole="menu"
      >
        <Glass strong style={{ borderRadius: radius.inner, paddingVertical: space[2] }}>
          {title ? (
            <T v="micro" tone="mut" style={{ paddingHorizontal: space[4], paddingVertical: space[1] }}>
              {title}
            </T>
          ) : null}
          <ScrollView
            ref={listRef}
            style={{ maxHeight: listH }}
            testID="menu-items"
            bounces={false}
            showsVerticalScrollIndicator
            // opens at the chosen item (in the middle of the window when the list is longer than it): by the rows' real
            // places (a long label wraps), once the content has its size (on a phone it can come after the first layout)
            onContentSizeChange={(_, contentH) => {
              contentSize.current = contentH;
              scrollToChosen();
            }}
          >
          {items.map((it, i) => (
            <Fragment key={it.key}>
            {/* the dangerous ones are the last group, after a line (DS Б4): drawn before the first of them when others come before */}
            {(it.destructive && i > 0 && !items[i - 1]!.destructive) || (it.group && i > 0) ? (
              <View testID="menu-divider" style={{ height: component.hairline, backgroundColor: c.bd, marginVertical: space[1], marginHorizontal: space[4] }} />
            ) : null}
            <Press
              testID={it.testID}
              onLayout={(e) => {
                rowAt.current[it.key as string] = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
                scrollToChosen(); // every row has its place, or not yet: tried at each
              }}
              onPress={() => picker.pick(it.key)}
              visibleHeight={size.hitMin}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: !!it.selected }}
              accessibilityLabel={it.label}
              style={{ minHeight: size.hitMin, paddingHorizontal: space[4], flexDirection: "row", alignItems: "center", gap: space[2], opacity: it.dim ? component.dimOpacity : 1 }}
            >
              <View style={{ width: size.iconMd }}>{it.selected ? <Icon name="check" color={c.ink} /> : null}</View>
              <T v="body" w={fit && it.selected ? "semibold" : undefined} tone={it.destructive ? "bad" : "ink"} style={fit ? { flexShrink: 1 } : { flex: 1 }} numberOfLines={fit ? 1 : undefined}>
                {it.label}
              </T>
              {it.icon ? <Icon name={it.icon} /> : null}
            </Press>
            </Fragment>
          ))}
          </ScrollView>
        </Glass>
      </Animated.View>
    </Modal>
  );
}

/**
 * A child of a sheet that keeps its finger (the tape, a signature): it says so while it holds it, and the sheet's
 * swipe to close never takes the finger over (#714). Outside a sheet — a ref nobody reads.
 */
const SheetHold = createContext<{ current: boolean }>({ current: false });
export const useSheetHold = () => useContext(SheetHold);

const SheetEscapeCtx = createContext<{ add: (f: () => boolean) => () => void } | null>(null);
/**
 * Inside a `Sheet`: `onEscape` runs first on Esc / Android «Назад»; it returns true when it closed something of its own (an open
 * calendar) — then the sheet stays. Outside a sheet nothing happens (a screen's Esc is its own).
 */
export function useSheetEscape(onEscape: (() => boolean) | null) {
  const api = useContext(SheetEscapeCtx);
  const live = useRef(onEscape);
  live.current = onEscape;
  const on = !!onEscape;
  useEffect(() => {
    if (!api || !on) return;
    return api.add(() => live.current?.() ?? false);
  }, [api, on]);
}

/**
 * The side insets of the open sheet (its left / right padding). A list inside a sheet scrolls in `SheetScroll`: the scroll view spans
 * the insets (negative margin) and pads its content back by the same, so the scroll indicator stands in the inset — not over the
 * arrows «›» at the end of the rows (founder 13.11, #1339; DS Б1).
 */
const SheetInset = createContext<{ l: number; r: number }>({ l: 0, r: 0 });
export function SheetScroll({ style, contentContainerStyle, ...rest }: ComponentProps<typeof ScrollView>) {
  const g = useContext(SheetInset);
  return (
    <ScrollView
      {...rest}
      style={[{ marginLeft: -g.l, marginRight: -g.r }, style]}
      contentContainerStyle={[{ paddingLeft: g.l, paddingRight: g.r }, contentContainerStyle]}
    />
  );
}

/* ---------- Sheet: iOS-style bottom sheet on phone, centered modal on tablet/desktop ----------
 * Phone: grabber; drag the top of the sheet down to close, up to open it full height; tap outside or Android back closes.
 * Swipe down anywhere on the body closes too, as on iPhone (#505, #714): a Gesture Handler pan alongside the list's own
 * scroll — the list scrolls back to its top first, then the sheet follows; a sideways drag stays a slider (the tape),
 * an upward drag stays a scroll.
 * `dirty` (unsaved changes): any way of closing asks "Save / Don't save / Cancel" first (DS rule 10).
 */
const releaseRule = {
  settle: component.sheetDismissRatio,
  project: component.sheetProjectMs,
  slow: component.sheetSlowVelocity,
  flick: component.sheetFlickVelocity,
};

export function Sheet({
  visible,
  onClose,
  title: titleNow,
  children: childrenNow,
  dirty,
  onSave,
  onExited,
  onEscape,
  canClose,
  footer: footerNow,
  height: heightNow = "fit",
  onBack: onBackNow,
  help: helpNow,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** the pinned bottom bar (DS Б1): the main action, always in view above the keyboard; the body scrolls above it */
  footer?: ReactNode;
  /** `fit` — by the content (default), at most `sheetHeightRatio`; `medium` — half the screen, can be pulled to `large`;
   *  `large` — nearly the full screen. Centred windows from 820 are always by the content. */
  height?: "fit" | "medium" | "large";
  /** a nested step is a page inside the sheet, never a second sheet (DS Б1): «‹ Назад» goes to the page before */
  onBack?: () => void;
  /** «?» right after the title (DS Б1, Б7): what it is, then the way to where it is set or made (`to`). It opens as a page inside
   *  this sheet (header «‹ Назад» + the help's title), never a second sheet; «‹» goes back to the content as it was */
  help?: SheetHelp;
  /** unsaved changes in the sheet */
  dirty?: boolean;
  /** "Save" in the unsaved-changes question */
  onSave?: () => void;
  /** the sheet has left the screen (after the way out): an owner that mounts it by data lets the data go now (`useHeldSheet`) */
  onExited?: () => void;
  /** Esc / Android «Назад» first asks the content: true — it took the key (a search to clear), the sheet stays (DS А3) */
  onEscape?: () => boolean;
  /** false while the owner will not let it close (a refund under way, a key to copy): ✕, the scrim, Esc and the swipe do nothing — it does not go out and come back */
  canClose?: boolean;
}) {
  // While the sheet goes out the owner has often already emptied what it showed (`visible={!!x}`, `{x ? … : null}`):
  // it keeps showing the last render from while it was open, so it does not collapse or jump on the way out
  const seen = useRef({ title: titleNow, children: childrenNow, footer: footerNow, height: heightNow, onBack: onBackNow, help: helpNow });
  if (visible) seen.current = { title: titleNow, children: childrenNow, footer: footerNow, height: heightNow, onBack: onBackNow, help: helpNow };
  const { title: ownTitle, children, footer: ownFooterSeen, height, onBack: ownBack, help } = seen.current;
  const { c } = useTheme();
  const { wide } = useDevice();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { t } = useI18n();
  const { height: winH } = useWindowDimensions();
  // the help page (DS Б1): the content stays mounted under it (its state is kept), its scroll is given back on «‹»
  const [helpPage, setHelpPage] = useState<HelpPage>(helpClosed);
  const bodyRef = useRef<ScrollViewInstance>(null);
  const bodyTop = useRef(0);
  const restoreTo = useRef<number | null>(null);
  const hdr = sheetHeader(helpPage, { title: ownTitle, hasBack: !!ownBack, help }, t("common.help"));
  const title = hdr.title;
  // the way between the pages (DS Б1, like a page of the sheet): the new page slides in over durBase and the body's height
  // goes from the old page's to the new one's — the window never jumps in one frame; reduced motion: no slide, no glide
  const slideX = useSharedValue(0);
  const bodyFixH = useSharedValue(-1); // ≥ 0 while the height glides: the body is held at it
  const bodyBox = useRef({ w: 0, h: 0 });
  const switching = useRef<null | "in" | "back">(null);
  const releaseBody = useCallback(() => {
    switching.current = null;
    bodyFixH.value = -1;
  }, [bodyFixH]);
  const startSwitch = (dir: "in" | "back") => {
    if (reduce) return;
    switching.current = dir;
    bodyFixH.value = bodyBox.current.h;
    slideX.value = dir === "in" ? bodyBox.current.w : -bodyBox.current.w;
    slideX.value = withTiming(0, { duration: motion.durBase, easing: Easing.bezier(...motion.easeOut) });
    // the new page has not told its size (the same as the old): the body is let go after the way
    setTimeout(() => {
      if (switching.current === dir) releaseBody();
    }, motion.durBase * 2);
  };
  // the new page's size is known: the body glides from the old height to the new, then is let go
  const pageSized = (contentH: number) => {
    const dir = switching.current;
    if (!dir) return;
    switching.current = null;
    const room = (wide ? winH - insets.top - insets.bottom - space[8] * 2 : maxH) - (sheetH.value || 0);
    const sw = pageSwitch(dir, bodyBox.current.w, bodyBox.current.h, room, contentH);
    bodyFixH.value = withTiming(sw.toH, { duration: motion.durBase, easing: Easing.bezier(...motion.easeOut) }, (done) => {
      "worklet";
      if (done) bodyFixH.value = -1;
    });
  };
  const openHelp = () => {
    startSwitch("in");
    setHelpPage((s) => helpOpen(s, bodyTop.current));
    restoreTo.current = 0;
  };
  const closeHelp = () => {
    startSwitch("back");
    const r = helpBack(helpPage);
    setHelpPage(r.state);
    restoreTo.current = r.restore;
  };
  const pageSlide = useAnimatedStyle(() => ({ transform: [{ translateX: slideX.value }] }));
  const bodyHold = useAnimatedStyle(() => (bodyFixH.value >= 0 ? { height: bodyFixH.value, flexShrink: 0 } : {}));
  const onBack = hdr.back === "help" ? closeHelp : ownBack;
  const footer = helpPage.on ? null : ownFooterSeen;
  useEffect(() => {
    // the page switched: the content goes back to where it was scrolled, the help starts at its top
    const y = restoreTo.current;
    if (y === null) return;
    restoreTo.current = null;
    const id = requestAnimationFrame(() => bodyRef.current?.scrollTo({ y, animated: false }));
    return () => cancelAnimationFrame(id);
  }, [helpPage.on]);
  // the help's way (`to`) is taken after the sheet has gone (onExited), never while it slides out (rule 27)
  const goTo = useRef<Href | null>(null);
  const drag = useSharedValue(0);
  const sideR = wide ? space[4] : Math.max(insets.right, space[4]);
  const edgeFade = useScrollFade(bodyRef, c.ov, sideR);
  const fade = useSharedValue(1); // the sheet and its scrim dissolve (reduce motion, the centred window): 1 → 0
  const sheetH = useSharedValue(0); // the sheet's own height: how far it has to go, and how the scrim follows
  const leaving = useRef(false); // a close is asked or under way: one onClose per close, whatever is pressed meanwhile
  const shown = useRef(visible);
  shown.current = visible;
  // How a sheet leaves (DS Б1, #1163) — two ways, by platform:
  //  after  (web, Android): the owner is asked first (`onClose`); the sheet stays on the screen while it goes out, also
  //         when the owner closes it by itself — `present` is "mounted", `visible` is what the owner wants;
  //  before (iOS): the Modal must be dismissed the very moment the owner closes it — a sheet the owner opens in the same
  //         beat (a chain: «Следующий шаг» → the next one) never shows over a Modal that is still going out, and its
  //         invisible layer takes every touch (#743). So the owner's own close cuts, as it always did, and the person's
  //         close (✕, the scrim, Esc, the swipe) goes out FIRST, inside the Modal, and only then asks the owner.
  // `session` marks one opening or one exit: the callback of an earlier one does nothing.
  const before = leaveBefore();
  const [present, setPresent] = useState(visible);
  const open = before ? visible : visible || present;
  // iOS: the sheet is going out by the person's close — its body takes no touches meanwhile (a second answer must not be possible)
  const [goingOut, setGoingOut] = useState(false);
  const session = useRef(0);
  const exitSpeed = useRef(0);
  const [asked, setAsked] = useState(0);
  const [full, setFull] = useState(false);
  const [ask, setAsk] = useState(false);
  const live = useRef({ dirty, onClose, onExited, onEscape, canClose });
  // what is open inside the sheet takes Esc and Android «Назад» first (DateField's calendar, DS А7): the first press closes it,
  // the next one the sheet; the newest one asks first
  const childEscape = useRef<(() => boolean)[]>([]);
  const escapeApi = useMemo(() => ({
    add: (f: () => boolean) => {
      childEscape.current = [f, ...childEscape.current];
      return () => { childEscape.current = childEscape.current.filter((x) => x !== f); };
    },
  }), []);
  live.current = { dirty, onClose, onExited, onEscape, canClose };
  useEffect(() => {
    if (visible) {
      session.current++;
      exitSpeed.current = 0;
      passThrough(false);
      drag.value = 0;
      fade.value = 1;
      leaving.current = false;
      setGoingOut(false);
      setPresent(true);
      setFull(false);
      setAsk(false);
      setHelpPage(helpClosed);
      goTo.current = null;
      switching.current = null;
      slideX.value = 0;
      bodyFixH.value = -1;
    }
  }, [visible, drag, fade]);
  // iOS: the owner closed it (by itself, or at a moment of its own while the sheet was going out): the exit that was under
  // way is void — a late end of it asks nothing — and the owner may let the data go now (the Modal is gone at once)
  useEffect(() => {
    if (!before || visible) return;
    session.current++;
    leaving.current = false;
    setGoingOut(false);
    exited();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  // web: the Modal's root is a fixed layer that takes every tap; while the sheet goes out it lets them through (DS §10:
  // do not wait for an animation to press). Native: the Modal is its own window — ⬜ (DS Б1)
  const rootRef = useRef<React.ComponentRef<typeof Animated.View>>(null);
  const passThrough = useCallback((on: boolean) => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    let el = rootRef.current as unknown as HTMLElement | null;
    if (!(el instanceof Element)) return;
    // every fixed layer above the sheet (the Modal has two): no taps (`important`: react-native-web puts
    // `pointer-events: auto !important` in the layer's class) and `inert` — the layer's focus trap lets go too
    for (; el; el = el.parentElement) {
      if (getComputedStyle(el).position !== "fixed") continue;
      if (on) {
        el.style.setProperty("pointer-events", "none", "important");
        el.setAttribute("inert", "");
      } else {
        el.style.removeProperty("pointer-events");
        el.removeAttribute("inert");
      }
    }
  }, []);
  const exited = useCallback(() => {
    live.current.onExited?.();
    const to = goTo.current;
    goTo.current = null;
    if (to) router.push(to);
  }, []);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => void (mounted.current = false);
  }, []);
  const gone = useCallback((id: number) => {
    if (id !== session.current || !mounted.current) return;
    leaving.current = false;
    setPresent(false);
    exited();
  }, [exited]);
  // it goes down at the finger's speed (✕, the scrim, Esc, the owner's own close — in durBase), the scrim fades with
  // it; reduce motion and the centred window (no swipe) — it dissolves; `then` runs once, when it has left
  const animateOut = useCallback(
    (speed: number, then: (id: number) => void) => {
      const id = ++session.current;
      leaving.current = true;
      if (before) setGoingOut(true);
      let ran = false;
      const finish = () => {
        if (ran || id !== session.current || !mounted.current) return;
        ran = true;
        then(id);
      };
      const done = (finished?: boolean) => {
        "worklet";
        if (finished) runOnJS(finish)();
      };
      // the animation's end can fail to come (the screen under the sheet went to the background, the frames stopped):
      // the sheet is taken off by this safety net too, once the exit has had its time
      if (reduce || wide) {
        // a dissolve is what reduce motion allows: it must not be skipped by the system setting
        fade.value = withTiming(0, { duration: motion.durFast, reduceMotion: ReduceMotion.Never }, done);
        setTimeout(finish, motion.durFast + motion.durBase);
        return;
      }
      const h = sheetH.value || winH;
      const ms = exitDuration(Math.max(h - drag.value, 0), speed, motion.durFast, motion.durSlow, motion.durBase);
      drag.value = withTiming(h, { duration: ms, easing: speed > 0 ? Easing.linear : Easing.bezier(...motion.easeOut) }, done);
      setTimeout(finish, ms + motion.durBase);
    },
    [reduce, wide, winH, drag, fade, sheetH, before],
  );
  // after-way: the owner closed it (after its own «Сохранить», or because we asked): now it goes out
  useEffect(() => {
    if (before || visible || !present) return;
    passThrough(true);
    animateOut(exitSpeed.current, gone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  // we asked the owner (onClose); if it is still open after the answer, the sheet comes back at once (busy, a key to enter…)
  useEffect(() => {
    if (asked === 0 || !shown.current) return;
    goTo.current = null; // the owner kept it open: the help's way is not taken
    leaving.current = false;
    setGoingOut(false);
    exitSpeed.current = 0;
    drag.value = withSpring(0, motion.spring);
    fade.value = withTiming(1, { duration: motion.durFast, reduceMotion: ReduceMotion.Never });
  }, [asked, drag, fade]);
  const requestClose = useCallback(
    (v?: number, discard?: boolean) => {
      if (leaving.current) return;
      if (live.current.canClose === false) {
        drag.value = withSpring(0, motion.spring); // a pull that began is let go back
        return;
      }
      if (live.current.dirty && !discard) {
        drag.value = withSpring(0, motion.spring);
        setAsk(true);
        return;
      }
      exitSpeed.current = typeof v === "number" ? v : 0;
      const ask = () => {
        live.current.onClose();
        setAsked((n) => n + 1);
      };
      if (before) {
        // iOS: it goes out first, inside the Modal, then the owner is asked (a refusal brings it back)
        animateOut(exitSpeed.current, ask);
      } else {
        leaving.current = true;
        ask();
      }
    },
    [drag, before, animateOut],
  );
  // #1912: while the sheet holds unsaved work, «Обновить» asks it through its own question and never reloads over it
  useEffect(() => {
    if (!visible || !dirty) return;
    return registerDirtySheet({ ask: () => requestClose() });
  }, [visible, dirty, requestClose]);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
        onPanResponderMove: (_, g) => {
          // down follows the finger; up is resisted (rubber band) until it opens full height
          drag.value = g.dy > 0 ? g.dy : g.dy / 3;
        },
        onPanResponderRelease: (_, g) => {
          const h = sheetH.value || winH;
          if (swipeCloses(g.dy, g.vy, h, releaseRule)) requestClose(g.vy);
          else {
            if (g.dy < -component.sheetExpandDrag || g.vy < -component.sheetFlickVelocity) setFull(true);
            drag.value = withSpring(0, motion.spring);
          }
        },
        onPanResponderTerminate: () => {
          drag.value = withSpring(0, motion.spring);
        },
      }),
    [drag, requestClose, sheetH, winH],
  );
  const scrollTop = useRef(0);
  const held = useRef(false);
  // the body (#505, #714): a native gesture together with the list's own scroll — on iPhone the list's scroll takes the
  // finger from a JS responder, so the swipe is a Gesture Handler pan that runs alongside it: down only (activeOffsetY),
  // not sideways (a slider, the tape), and the sheet follows only while the list is at its top (sheetSwipe.ts)
  const swipe = useRef<SwipeState>({ base: null });
  const scrollNative = useNativeGesture({});
  // activated by hand: a child that keeps its finger (the tape, a signature — useSheetHold) is never taken over
  const touchAt = useRef<[number, number] | null>(null);
  const bodyPan = usePanGesture({
    runOnJS: true,
    enabled: !wide,
    manualActivation: true,
    simultaneousWith: [scrollNative],
    onTouchesDown: (e) => {
      const t0 = e.allTouches[0];
      touchAt.current = t0 ? [t0.absoluteX, t0.absoluteY] : null;
    },
    onTouchesMove: (e) => {
      const t0 = e.allTouches[0];
      if (!t0 || !touchAt.current || e.state === State.ACTIVE) return;
      const go = swipeStart(t0.absoluteX - touchAt.current[0], t0.absoluteY - touchAt.current[1], component.sheetBodySlop, held.current);
      if (go === "activate") GestureStateManager.activate(e.handlerTag);
      else if (go === "fail") GestureStateManager.fail(e.handlerTag);
    },
    onActivate: () => {
      swipe.current = { base: null };
    },
    onUpdate: (e) => {
      const r = swipeStep(swipe.current, scrollTop.current, e.translationY);
      swipe.current = r.state;
      drag.value = r.drag;
    },
    onDeactivate: (e) => {
      const r = swipeStep(swipe.current, scrollTop.current, e.translationY);
      swipe.current = { base: null };
      // Gesture Handler counts pt per second, the grabber pt per ms
      const v = e.velocityY / 1000;
      if (swipeCloses(r.drag, v, sheetH.value || winH, releaseRule)) requestClose(v);
      else drag.value = withSpring(0, motion.spring);
    },
  });
  useEffect(() => {
    if (visible) scrollTop.current = 0;
  }, [visible]);
  const follow = useAnimatedStyle(() => ({ transform: [{ translateY: drag.value }], opacity: fade.value }));
  // the scrim goes out as the sheet goes down (1 → 0 over the sheet's height), and with the dissolve
  const scrimFollow = useAnimatedStyle(() => {
    return { opacity: fade.value * scrimLevel(drag.value, sheetH.value || winH) };
  });
  const fullH = winH - insets.top - space[2];
  const maxH = full || height === "large" ? fullH : height === "medium" ? winH * component.sheetMediumRatio : winH * component.sheetHeightRatio;
  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={() => { if (leaving.current || childEscape.current.some((f) => f())) return; if (onBack) onBack(); else if (!live.current.onEscape?.()) requestClose(); }} statusBarTranslucent supportedOrientations={ALL_ORIENTATIONS}>
      {/* a form in a sheet scrolls the sheet's own body, never the screen under it (DS §11 п.3) */}
      <ScreenScrollCtx.Provider value={null}>
      <SheetEscapeCtx.Provider value={escapeApi}>
      {/* a Modal is its own native root: gestures in it need their own root view (Gesture Handler) */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        pointerEvents={visible && !goingOut ? "auto" : "none"}
        behavior={avoidBehavior}
        // 820/1280: the centred sheet keeps clear of the home indicator too (docs/specs/32) — without one, as before;
        // the phone sheet runs to the edge
        // 820/1280: the window never comes closer than space[8] to the window's top and bottom (DS Б1); its body scrolls inside
        style={{ flex: 1, justifyContent: wide ? "center" : "flex-end", alignItems: "center", paddingTop: insets.top + (wide ? space[8] : space[2]), paddingBottom: wide ? insets.bottom + space[8] : 0 }}
      >
        <Animated.View
          entering={reduce ? undefined : FadeIn.duration(motion.durBase)}
          style={StyleSheet.absoluteFill}
        >
          <Animated.View testID="sheet-scrim" style={[StyleSheet.absoluteFill, scrimFollow]}>
            <Pressable
              style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
              onPress={() => requestClose()}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
            />
          </Animated.View>
        </Animated.View>
        <Animated.View
          entering={reduce ? undefined : SlideInDown.duration(motion.durSlow)}
          ref={rootRef}
          testID="sheet-panel"
          onLayout={(e) => {
            sheetH.value = e.nativeEvent.layout.height;
          }}
          style={[{ width: wide ? component.modalW + space[8] * 2 : "100%", maxWidth: "100%", maxHeight: wide ? "100%" : maxH }, // medium / large: the height the sheet wants, but it gives way when the keyboard takes room (the header never leaves the screen)
            !wide && height !== "fit" ? { flexBasis: maxH, flexShrink: 1 } : null, follow]}
          accessibilityViewIsModal
        >
          <SheetInset.Provider value={{ l: wide ? space[4] : Math.max(insets.left, space[4]), r: sideR }}>
          <Glass
            strong
            style={{
              flexShrink: 1,
              flexGrow: !wide && height !== "fit" ? 1 : 0,
              borderRadius: component.sheetRadius,
              borderBottomLeftRadius: wide ? component.sheetRadius : 0,
              borderBottomRightRadius: wide ? component.sheetRadius : 0,
              padding: space[4],
              paddingTop: wide ? space[4] : 0,
              paddingBottom: wide ? space[4] : insets.bottom + space[4],
              // the phone sheet is as wide as the screen: in landscape its rows keep clear of the notch (docs/specs/32)
              paddingLeft: wide ? space[4] : Math.max(insets.left, space[4]),
              paddingRight: wide ? space[4] : Math.max(insets.right, space[4]),
              gap: space[3],
            }}
          >
            {/* drag zone: grabber + title (44 pt tall at least) */}
            <View {...(wide ? {} : pan.panHandlers)} style={{ gap: space[2], paddingTop: wide ? 0 : space[2] }}>
              {!wide ? (
                <View
                  accessibilityRole="adjustable"
                  accessibilityLabel={t("sheet.grabber")}
                  accessibilityHint={t("sheet.grabberHint")}
                  style={{ alignSelf: "center", width: component.grabber.w, height: component.grabber.h, borderRadius: radius.pill, backgroundColor: c.track }}
                />
              ) : null}
              {title || onBack ? (
                // the one header's sheet kind (visual-v2 «Шторка»): the title 22/700 on the left, «×» 32 on the right
                <SheetHead title={title} onClose={() => requestClose()} closeLabel={t("common.close")} back={onBack ? { label: t("common.back"), onPress: onBack } : undefined} after={hdr.showHelp && help ? <HelpMark title={help.title ?? ownTitle ?? ""} onPress={openHelp} testID="sheet-help" /> : undefined} />
              ) : (
                <View style={{ height: space[2] }} />
              )}
            </View>
            {ask ? (
              <View style={{ gap: space[3] }} accessibilityLiveRegion="polite">
                <T v="heading">{t("sheet.unsavedTitle")}</T>
                <T v="body" tone="mut">{t("sheet.unsavedText")}</T>
                {onSave ? (
                  <Press
                    onPress={() => { setAsk(false); onSave(); }}
                    visibleHeight={component.button.phone}
                    accessibilityRole="button"
                    accessibilityLabel={t("ue.save")}
                    style={{ height: component.button.phone, borderRadius: radius.pill, backgroundColor: c.acc, alignItems: "center", justifyContent: "center" }}
                  >
                    <T v="button" style={{ color: c.onAcc }}>{t("ue.save")}</T>
                  </Press>
                ) : null}
                <Press
                  onPress={() => { setAsk(false); requestClose(0, true); }}
                  visibleHeight={component.button.phone}
                  accessibilityRole="button"
                  accessibilityLabel={t("sheet.discard")}
                  style={{ height: component.button.phone, borderRadius: radius.pill, backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}
                >
                  <T v="button" tone="bad">{t("sheet.discard")}</T>
                </Press>
                <Press
                  onPress={() => { setAsk(false); noteQuestionCancelled(); }}
                  visibleHeight={component.button.phone}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.cancel")}
                  style={{ height: component.button.phone, alignItems: "center", justifyContent: "center" }}
                >
                  <T v="button">{t("common.cancel")}</T>
                </Press>
              </View>
            ) : (
              /* the form scrolls when the keyboard leaves less room than the sheet needs */
              <GestureDetector gesture={bodyPan}>
              <Animated.View
                style={[{ flexShrink: 1, flexGrow: !wide && height !== "fit" ? 1 : 0 }, bodyHold]}
                testID="sheet-body"
                onLayout={(e) => {
                  bodyBox.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
                }}
              >
                <GestureDetector gesture={scrollNative}>
                <SheetScroll
                  ref={bodyRef}
                  testID="sheet-scroll"
                  style={{ flexGrow: 0 }}
                  contentContainerStyle={{ gap: space[3] }}
                  keyboardShouldPersistTaps="handled"
                  bounces={false}
                  scrollEventThrottle={16}
                  onLayout={edgeFade.onLayout}
                  onContentSizeChange={(w, h) => {
                    edgeFade.onContentSizeChange(w, h);
                    pageSized(h);
                  }}
                  onScroll={(e) => {
                    scrollTop.current = e.nativeEvent.contentOffset.y;
                    if (!helpPage.on) bodyTop.current = e.nativeEvent.contentOffset.y;
                    edgeFade.onScroll(e);
                  }}
                >
                  {/* the content stays mounted under the help page (its fields, its choices are kept) */}
                  <Animated.View style={[{ gap: space[3], display: helpPage.on ? "none" : "flex" }, pageSlide]} testID="sheet-content">
                    <SheetHold.Provider value={held}>{children}</SheetHold.Provider>
                  </Animated.View>
                  {helpPage.on && help ? (
                    <Animated.View testID="sheet-help-page" style={[{ gap: space[3] }, pageSlide]}>
                      {typeof help.body === "string" ? <T v="body">{help.body}</T> : help.body}
                    </Animated.View>
                  ) : null}
                </SheetScroll>
                </GestureDetector>
                {edgeFade.overlay}
              </Animated.View>
              </GestureDetector>
            )}
            {helpPage.on && help?.to && !ask ? (
              // the help's way at the bottom, where the sheet's main button stands (DS Б7)
              <View testID="sheet-footer" style={{ paddingTop: space[2] }}>
                <HelpLink
                  to={help.to}
                  testID="sheet-help-to"
                  onPress={() => {
                    goTo.current = help.to!.href;
                    requestClose();
                  }}
                />
              </View>
            ) : null}
            {footer && !ask ? (
              <View testID="sheet-footer" style={{ paddingTop: space[2] }}>
                {footer}
              </View>
            ) : null}
          </Glass>
          </SheetInset.Provider>
        </Animated.View>
      </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </SheetEscapeCtx.Provider>
    </ScreenScrollCtx.Provider>
    </Modal>
  );
}

/* ---------- "?" help: visible 18, hit 44 ---------- */
/** «?» (DS Б7). `onPress` — the screen opens its own sheet (several steps, not one text): the same «?», the same place */
/**
 * «?» (DS Б7, founder 16.11, #1843, #1853): it stands right after the words it explains — a screen's title, a section's, a field's,
 * a row's — never alone in a corner. Inside: what it is, then a way to it — `to` opens the place where the value is set (a
 * company or module setting) or where the thing is made (suppliers, catalog items). A value that can be set has `to`.
 */
export type SheetHelp = { title?: string; body: ReactNode | string; to?: { href: Href; label?: string } };

/** the «?» mark itself: visible 18, hit 44 (DS Б7); the label for the screen reader is «Справка: <title>» */
function HelpMark({ title, onPress, testID }: { title: string; onPress: () => void; testID?: string }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const s = component.help.visible;
  return (
    <Press onPress={onPress} visibleHeight={s} accessibilityRole="button" accessibilityLabel={`${t("common.help")}: ${title}`} testID={testID}>
      <View
        style={{
          width: s,
          height: s,
          borderRadius: s / 2,
          borderWidth: 1,
          borderColor: c.bd,
          backgroundColor: c.surf2,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <T v="micro" w="bold" style={{ fontSize: component.help.icon, lineHeight: component.help.icon + 2 }}>
          ?
        </T>
      </View>
    </Press>
  );
}

/** the way to where it is set or made: a secondary button with «›», the whole row is the target (DS Б7) */
function HelpLink({ to, onPress, testID }: { to: { href: Href; label?: string }; onPress: () => void; testID?: string }) {
  const { c } = useTheme();
  const { t } = useI18n();
  return (
    <Press onPress={onPress} visibleHeight={component.button.phone} accessibilityRole="link" testID={testID}>
      <View
        style={{
          minHeight: component.button.phone,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: c.bdField,
          backgroundColor: c.surf2,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: space[1],
          paddingHorizontal: space[4],
        }}
      >
        <T v="body" w="semibold">
          {to.label ?? t("common.helpSettings")}
        </T>
        <Icon name="chevronRight" s={size.iconSm} />
      </View>
    </Press>
  );
}

export function HelpButton({ title, text, to, onPress, testID }: { title: string; text?: string; to?: { href: Href; label?: string }; onPress?: () => void; testID?: string }) {
  const [open, setOpen] = useState(false);
  const leaving = useRef(false);
  // the way is taken after the sheet has gone (onExited), never while it slides out: a Modal closing under a new screen
  // jumps on iPhone (rule 27)
  const go = () => {
    leaving.current = true;
    setOpen(false);
  };
  const exited = () => {
    if (!leaving.current) return;
    leaving.current = false;
    if (to) router.push(to.href);
  };
  return (
    <>
      <HelpMark title={title} onPress={onPress ?? (() => setOpen(true))} testID={testID} />
      <Sheet visible={open} onClose={() => setOpen(false)} onExited={exited} title={title}>
        <T v="body">{text}</T>
        {to ? <HelpLink to={to} onPress={go} testID={testID ? `${testID}-to` : undefined} /> : null}
      </Sheet>
    </>
  );
}

/* ---------- Toasts «Вернуть» — a stack of up to three (DS rule 10, Б8, §15.2; #2211, #2214, closes #2213) ---------- */

interface ToastItem {
  /** the toast itself (it comes in once); a toast that grows (`grow`) keeps it */
  id: number;
  /** when its text last changed: «Вернуть» is armed from it, its clock runs from it */
  at: number;
  text: string;
  /** false: nothing could be taken back (it was changed since, #1193 п.6) — the toast then says so */
  undo?: GuardedUndo;
}
/**
 * A stack of up to `motion.toastStack` toasts, the newest on top (moved from the «Графит» pilot): a second action no longer takes
 * away the «Вернуть» of the first. Each toast has its own clock (≥ 5 s; it stands while a finger is on the toast; with VoiceOver a
 * toast with «Вернуть» has none — `stackLife`). `grow` — the id of the toast on top, which then stays and takes the new text and
 * «Вернуть» with 5 fresh seconds (a series of deletions is one toast «Удалено позиций: N»). `show` returns the toast's id;
 * `showing(id)` — is it still the newest toast on screen. The arithmetic — `toastStack.ts` (unit-tested).
 */
type ToastApi = { show: (text: string, undo?: GuardedUndo, opts?: { grow?: number }) => number; showing: (id: number) => boolean };
const ToastCtx = createContext<ToastApi | null>(null);

/** VoiceOver / TalkBack on: the toasts lose their clock (v2 §2.8) */
function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // the web cannot tell: react-native-web answers «on» always — there the toasts keep their clock
    if (Platform.OS === "web") return;
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled?.()
      .then((v) => live && setOn(!!v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.("screenReaderChanged", (v: boolean) => setOn(!!v));
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  return on;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [stack, setStackState] = useState<ToastItem[]>([]);
  const current = useRef<ToastItem[]>([]);
  const setStack = useCallback((f: (cur: ToastItem[]) => ToastItem[]) => {
    current.current = f(current.current);
    setStackState(current.current);
  }, []);
  const reader = useScreenReader();
  const readerRef = useRef(reader);
  readerRef.current = reader;
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const lastId = useRef(0);
  const stop = useCallback((id: number) => {
    const tm = timers.current.get(id);
    if (tm) clearTimeout(tm);
    timers.current.delete(id);
  }, []);
  const arm = useCallback(
    (id: number) => {
      stop(id);
      const item = current.current.find((x) => x.id === id);
      if (!item) return;
      const life = stackLife(!!item.undo, readerRef.current);
      if (life === null) return;
      const at = item.at;
      timers.current.set(id, setTimeout(() => {
        timers.current.delete(id);
        setStack((cur) => stackDrop(cur, id, at));
      }, life));
    },
    [setStack, stop],
  );
  const show = useCallback(
    (text: string, undo?: GuardedUndo, opts?: { grow?: number }) => {
      // ids are the moment it showed, made unique: three actions in one tick are three toasts
      const at = Math.max(Date.now(), lastId.current + 1);
      lastId.current = at;
      const before = current.current;
      setStack((cur) => stackShow(cur, { id: at, at, text, undo }, opts?.grow));
      const top = stackTop(current.current)!;
      // a toast pushed out of the stack takes its clock with it
      before.filter((x) => !current.current.some((y) => y.id === x.id)).forEach((x) => stop(x.id));
      arm(top.id);
      return top.id;
    },
    [arm, setStack, stop],
  );
  const late = useCallback(
    (id: number, text: string) => {
      setStack((cur) => stackReplace(cur, id, { id, at: Date.now(), text }));
      arm(id);
    },
    [arm, setStack],
  );
  const done = useCallback(
    (id: number) => {
      stop(id);
      setStack((cur) => stackDrop(cur, id));
    },
    [setStack, stop],
  );
  const showing = useCallback((id: number) => stackTop(current.current)?.id === id, []);
  // the screen reader turned on or off: every toast takes its clock anew
  useEffect(() => {
    current.current.forEach((x) => arm(x.id));
  }, [reader, arm]);
  useEffect(() => () => timers.current.forEach((tm) => clearTimeout(tm)), []);
  return (
    <ToastCtx.Provider value={{ show, showing }}>
      {children}
      <ToastStackView stack={stack} onDone={done} onLate={late} onHold={stop} onLetGo={arm} />
    </ToastCtx.Provider>
  );
}

function ToastStackView({
  stack,
  onDone,
  onLate,
  onHold,
  onLetGo,
}: {
  stack: ToastItem[];
  onDone: (id: number) => void;
  onLate: (id: number, text: string) => void;
  onHold: (id: number) => void;
  onLetGo: (id: number) => void;
}) {
  const { wide } = useDevice();
  const insets = useSafeAreaInsets();
  const bar = useFooterInset();
  // a panel the screen keeps at its right edge (from 820): the toast is centred in the rest (#1895)
  const side = useToastRight();
  // the offline queue's line over the tab bar (#2214) lifts the toasts by its height
  const queue = useQueueLineHeight();
  if (!stack.length) return null;
  // above the screen's pinned action bar when it has one (the toast must not cover «Сохранить»), on every width (DS §15.2; a
  // module's full-screen canvas gives the height of its bottom bar the same way — #1819: from 820 the toast lay on it too)
  const bottom = wide ? toastBottom(wideToastBottom(insets.bottom), bar, space[3]) : toastBottom(Math.max(insets.bottom, space[3]) + size.tabbarH + space[4] + queue, bar, space[3]);
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: Math.max(insets.left, space[4]), right: Math.max(insets.right, space[4]) + side, bottom, alignItems: "center", gap: space[2], zIndex: 100 }}
    >
      {stack.map((item) => (
        <OneToast key={item.id} item={item} onDone={onDone} onLate={onLate} onHold={onHold} onLetGo={onLetGo} />
      ))}
    </View>
  );
}

/** One toast of the stack (v2: a solid plate `toast`, radius `inner`, `body` 500, «Вернуть» a word in `toastAction`; no ring) */
function OneToast({
  item,
  onDone,
  onLate,
  onHold,
  onLetGo,
}: {
  item: ToastItem;
  onDone: (id: number) => void;
  onLate: (id: number, text: string) => void;
  onHold: (id: number) => void;
  onLetGo: (id: number) => void;
}) {
  const { c } = useTheme();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  // comes in: rises `space[3]` with opacity, ease-out (transform / opacity only); «Уменьшить движение» — only opacity, faster
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: reduce ? motion.durFast : motion.durBase, easing: Easing.bezier(...motion.easeOut) });
  }, [p, reduce]);
  // iOS: a toast is read out once when it comes (Android and the web: the live region)
  useEffect(() => {
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility?.(item.undo ? `${item.text}. ${t("common.undo")}` : item.text);
  }, [item.text, item.undo, t]);
  const a = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: reduce ? 0 : (1 - p.value) * space[3] }] }));
  return (
    // the layout animation (leaving) on the outer view, the coming-in look on the inner one (Reanimated: never both on one view)
    <Animated.View
      testID="toast"
      exiting={reduce ? undefined : FadeOut.duration(motion.durFast)}
      onTouchStart={() => onHold(item.id)}
      onTouchEnd={() => onLetGo(item.id)}
      onTouchCancel={() => onLetGo(item.id)}
      accessibilityLiveRegion="polite"
      style={{ width: "100%", maxWidth: component.modalW + space[8] }}
    >
      <Animated.View style={a}>
      <View
        style={{
          borderRadius: radius.inner,
          backgroundColor: c.toast,
          paddingLeft: space[4],
          paddingRight: item.undo ? space[1] : space[4],
          minHeight: size.hitMin,
          flexDirection: "row",
          alignItems: "center",
          gap: space[3],
          shadowColor: c.shadow.color,
          shadowOpacity: c.shadow.opacity,
          shadowRadius: c.shadow.radius,
          shadowOffset: { width: 0, height: c.shadow.offsetY },
          elevation: component.shadowSm.elevation,
        }}
      >
        <View testID="toast-text" style={{ flex: 1, paddingVertical: space[2] }}>
          <T v="body" w="medium" numberOfLines={2} style={{ color: c.onToast }}>
            {item.text}
          </T>
        </View>
        {item.undo ? (
          <UndoButton
            key={item.at}
            shownAt={item.at}
            onPress={() => {
              // the second tap of the double tap that made the thing is not «Отменить» (item.at = when it showed or grew)
              if (!toastArmed(item.at, Date.now())) return;
              // #1193 п.6: «Отменить» refused (the thing was changed since): the same toast says so instead of a silent nothing
              if (item.undo?.() === false) return onLate(item.id, t("common.undoLate"));
              onDone(item.id);
            }}
          />
        ) : null}
      </View>
      </Animated.View>
    </Animated.View>
  );
}

/** «Отменить» — a word in `toastAction` on the plate (v2: no countdown ring — «полос и колец прогресса нет»), hit area 44 */
function UndoButton({ onPress, shownAt }: { onPress: () => void; shownAt: number }) {
  const { c } = useTheme();
  const { t } = useI18n();
  // not yet armed (toastArmMs after the toast showed, see toastArm.ts): said as «busy» — a screen reader and an e2e know when a
  // press counts (#2086, #2134: a test pressed once at once; it waits for this, never for seconds)
  const [armed, setArmed] = useState(() => toastArmed(shownAt, Date.now()));
  useEffect(() => {
    if (armed) return;
    const left = Math.max(0, motion.toastArmMs - (Date.now() - shownAt));
    const id = setTimeout(() => setArmed(true), left);
    return () => clearTimeout(id);
  }, [armed, shownAt]);
  return (
    <Press onPress={onPress} testID="toast-undo" visibleHeight={size.hitMin} accessibilityRole="button" accessibilityLabel={t("common.undo")} aria-busy={!armed}>
      <View style={{ minHeight: size.hitMin, justifyContent: "center", paddingHorizontal: space[3] }}>
        <T v="button" style={{ color: c.toastAction }}>
          {t("common.undo")}
        </T>
      </View>
    </Press>
  );
}

export function useToast() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error("useToast outside ToastProvider");
  return v;
}
