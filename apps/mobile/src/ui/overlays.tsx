import { toastArmed } from "./toastArm";
import { menuListHeight, menuScrollTo } from "./menuLayout";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewInstance } from "react-native";
import { avoidBehavior } from "./keyboard";
import { GestureDetector, GestureHandlerRootView, GestureStateManager, State, useNativeGesture, usePanGesture } from "react-native-gesture-handler";
import { menuPick } from "./menuPick";
import { swipeCloses, swipeStart, swipeStep, type SwipeState } from "./sheetSwipe";
import Svg, { Rect } from "react-native-svg";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, Easing } from "react-native-reanimated";
import { component, motion, radius, size, space } from "@octo/design-tokens";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { Icon, Press, T, type IconKey } from "./primitives";

/**
 * Every modal turns with the device (docs/specs/32): without it an iPhone shows a modal in portrait only
 * (React Native's default) — a sheet opened in landscape turns the whole screen. Upside down too: an iPad in a stand
 * turned over (without the prop React Native gives an iPad all four); on an iPhone the app's own mask drops it.
 */
export const ALL_ORIENTATIONS: ("portrait" | "portrait-upside-down" | "landscape")[] = ["portrait", "portrait-upside-down", "landscape"];

/* ---------- Glass panel (overlay background --ov + blur --blurov) ---------- */
export function Glass({ children, style, strong, testID }: { children: ReactNode; style?: object; strong?: boolean; testID?: string }) {
  const { c } = useTheme();
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
}: {
  visible: boolean;
  anchor: { x: number; y: number; w: number; h: number } | null;
  items: MenuItem<K>[];
  onSelect: (k: K) => void;
  onClose: () => void;
  title?: string;
  /** a menu of a field: not narrower than its row, not wider than `modalW` (DS А2) */
  matchWidth?: boolean;
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
  const w = Math.min(matchWidth ? Math.min(Math.max(component.menuW, at.w), component.modalW) : component.menuW, winW - e.l - e.r);
  const left = Math.max(e.l, Math.min(at.x, winW - w - e.r));
  const below = at.y + at.h + space[1];
  // the menu never grows past the window (a phone on its side): it scrolls inside, every item can be reached
  const room = winH - e.t - e.b;
  // at most `menuMaxRows` rows show (the last one half: it scrolls); a window shorter than that cuts it further
  const listH = menuListHeight({ count: items.length, rowH: size.hitMin, maxRows: component.menuMaxRows, room, pad: space[2], titleH: title ? size.hitMin : 0 });
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
  const top = below + estH > winH - e.b ? Math.max(e.t, Math.min(at.y - estH - space[1], winH - e.b - estH)) : below;
  return (
    <Modal transparent visible={open} animationType="none" onRequestClose={onClose} onDismiss={picker.dismissed} statusBarTranslucent supportedOrientations={ALL_ORIENTATIONS}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={title ?? ""} />
      <Animated.View
        entering={reduce ? undefined : FadeIn.duration(motion.durFast)}
        exiting={reduce ? undefined : FadeOut.duration(motion.durFast)}
        style={{ position: "absolute", left, top, width: w }}
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
          {items.map((it) => (
            <Press
              key={it.key}
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
              style={{ minHeight: size.hitMin, paddingHorizontal: space[4], flexDirection: "row", alignItems: "center", gap: space[2] }}
            >
              <View style={{ width: size.iconMd }}>{it.selected ? <Icon name="check" color={c.ink} /> : null}</View>
              <T v="body" tone={it.destructive ? "bad" : "ink"} style={{ flex: 1 }}>
                {it.label}
              </T>
              {it.icon ? <Icon name={it.icon} /> : null}
            </Press>
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

/* ---------- Sheet: iOS-style bottom sheet on phone, centered modal on tablet/desktop ----------
 * Phone: grabber; drag the top of the sheet down to close, up to open it full height; tap outside or Android back closes.
 * Swipe down anywhere on the body closes too, as on iPhone (#505, #714): a Gesture Handler pan alongside the list's own
 * scroll — the list scrolls back to its top first, then the sheet follows; a sideways drag stays a slider (the tape),
 * an upward drag stays a scroll.
 * `dirty` (unsaved changes): any way of closing asks "Save / Don't save / Cancel" first (DS rule 10).
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  dirty,
  onSave,
  onEscape,
  footer,
  height = "fit",
  onBack,
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
  /** unsaved changes in the sheet */
  dirty?: boolean;
  /** "Save" in the unsaved-changes question */
  onSave?: () => void;
  /** Esc / Android «Назад» first asks the content: true — it took the key (a search to clear), the sheet stays (DS А3) */
  onEscape?: () => boolean;
}) {
  const { c } = useTheme();
  const { wide } = useDevice();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { t } = useI18n();
  const { height: winH } = useWindowDimensions();
  const drag = useSharedValue(0);
  const [full, setFull] = useState(false);
  const [ask, setAsk] = useState(false);
  const live = useRef({ dirty, onClose, onEscape });
  live.current = { dirty, onClose, onEscape };
  useEffect(() => {
    if (visible) {
      drag.value = 0;
      setFull(false);
      setAsk(false);
    }
  }, [visible, drag]);
  const requestClose = useCallback(() => {
    if (live.current.dirty) {
      drag.value = withSpring(0, motion.spring);
      setAsk(true);
    } else live.current.onClose();
  }, [drag]);
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
          if (g.dy > component.sheetDismissDrag || g.vy > component.sheetDismissVelocity) requestClose();
          else {
            if (g.dy < -component.sheetDismissDrag / 2 || g.vy < -component.sheetDismissVelocity) setFull(true);
            drag.value = withSpring(0, motion.spring);
          }
        },
        onPanResponderTerminate: () => {
          drag.value = withSpring(0, motion.spring);
        },
      }),
    [drag, requestClose],
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
      if (swipeCloses(r.drag, e.velocityY / 1000, component.sheetDismissDrag, component.sheetDismissVelocity)) requestClose();
      else drag.value = withSpring(0, motion.spring);
    },
  });
  useEffect(() => {
    if (visible) scrollTop.current = 0;
  }, [visible]);
  const follow = useAnimatedStyle(() => ({ transform: [{ translateY: drag.value }] }));
  const fullH = winH - insets.top - space[2];
  const maxH = full || height === "large" ? fullH : height === "medium" ? winH * component.sheetMediumRatio : winH * component.sheetHeightRatio;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onBack ?? (() => (live.current.onEscape?.() ? undefined : requestClose()))} statusBarTranslucent supportedOrientations={ALL_ORIENTATIONS}>
      {/* a Modal is its own native root: gestures in it need their own root view (Gesture Handler) */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={avoidBehavior}
        // 820/1280: the centred sheet keeps clear of the home indicator too (docs/specs/32) — without one, as before;
        // the phone sheet runs to the edge
        style={{ flex: 1, justifyContent: wide ? "center" : "flex-end", alignItems: "center", paddingTop: insets.top + space[2], paddingBottom: wide ? insets.bottom : 0 }}
      >
        <Animated.View
          entering={reduce ? undefined : FadeIn.duration(motion.durBase)}
          exiting={reduce ? undefined : FadeOut.duration(motion.durFast)}
          style={StyleSheet.absoluteFill}
        >
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
            onPress={requestClose}
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
          />
        </Animated.View>
        <Animated.View
          entering={reduce ? undefined : SlideInDown.duration(motion.durSlow)}
          exiting={reduce ? undefined : SlideOutDown.duration(motion.durBase)}
          style={[{ width: wide ? component.modalW + space[8] * 2 : "100%", maxWidth: "100%", maxHeight: wide ? "100%" : maxH }, // medium / large: the height the sheet wants, but it gives way when the keyboard takes room (the header never leaves the screen)
            !wide && height !== "fit" ? { flexBasis: maxH, flexShrink: 1 } : null, wide ? null : follow]}
          accessibilityViewIsModal
        >
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], minHeight: size.hitMin }}>
                  {onBack ? (
                    <Press testID="sheet-back" onPress={onBack} visibleHeight={component.dockBtn} accessibilityRole="button" accessibilityLabel={t("common.back")}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
                        <Icon name="chevronLeft" s={size.iconSm} />
                        <T v="button">{t("common.back")}</T>
                      </View>
                    </Press>
                  ) : null}
                  <View testID="sheet-title" style={{ flex: 1 }}>
                    <T v="title" numberOfLines={2}>{title ?? ""}</T>
                  </View>
                  <Press onPress={requestClose} visibleHeight={component.dockBtn} accessibilityRole="button" accessibilityLabel={t("common.close")}>
                    <View
                      style={{
                        width: component.dockBtn,
                        height: component.dockBtn,
                        borderRadius: radius.pill,
                        backgroundColor: c.surf2,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name="close" s={size.iconSm} />
                    </View>
                  </Press>
                </View>
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
                  onPress={() => { setAsk(false); onClose(); }}
                  visibleHeight={component.button.phone}
                  accessibilityRole="button"
                  accessibilityLabel={t("sheet.discard")}
                  style={{ height: component.button.phone, borderRadius: radius.pill, backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}
                >
                  <T v="button" tone="bad">{t("sheet.discard")}</T>
                </Press>
                <Press
                  onPress={() => setAsk(false)}
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
              <View style={{ flexShrink: 1, flexGrow: !wide && height !== "fit" ? 1 : 0 }} testID="sheet-body">
                <GestureDetector gesture={scrollNative}>
                <ScrollView
                  style={{ flexGrow: 0 }}
                  contentContainerStyle={{ gap: space[3] }}
                  keyboardShouldPersistTaps="handled"
                  bounces={false}
                  scrollEventThrottle={16}
                  onScroll={(e) => {
                    scrollTop.current = e.nativeEvent.contentOffset.y;
                  }}
                >
                  <SheetHold.Provider value={held}>{children}</SheetHold.Provider>
                </ScrollView>
                </GestureDetector>
              </View>
              </GestureDetector>
            )}
            {footer && !ask ? (
              <View testID="sheet-footer" style={{ paddingTop: space[2] }}>
                {footer}
              </View>
            ) : null}
          </Glass>
        </Animated.View>
      </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

/* ---------- "?" help: visible 18, hit 44 ---------- */
export function HelpButton({ title, text, where }: { title: string; text: string; where?: string }) {
  const [open, setOpen] = useState(false);
  const { c } = useTheme();
  const { t } = useI18n();
  const s = component.help.visible;
  return (
    <>
      <Press onPress={() => setOpen(true)} visibleHeight={s} accessibilityRole="button" accessibilityLabel={`${t("common.help")}: ${title}`}>
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
      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        <T v="body">{text}</T>
        {where ? (
          <T v="caption" tone="mut">
            {t("common.whereToSet", { where })}
          </T>
        ) : null}
      </Sheet>
    </>
  );
}

/* ---------- Toast with 5-second Undo (DS rule 10) ---------- */

interface ToastItem {
  id: number;
  text: string;
  undo?: () => void;
}
const ToastCtx = createContext<{ show: (text: string, undo?: () => void) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, undo?: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    const id = Date.now();
    setItem({ id, text, undo });
    timer.current = setTimeout(() => setItem((cur) => (cur?.id === id ? null : cur)), motion.toastUndoMs);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <ToastView item={item} onDone={() => setItem(null)} />
    </ToastCtx.Provider>
  );
}

function ToastView({ item, onDone }: { item: ToastItem | null; onDone: () => void }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const { wide } = useDevice();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  if (!item) return null;
  const bottom = wide ? insets.bottom + space[6] : Math.max(insets.bottom, space[3]) + size.tabbarH + space[4];
  return (
    <Animated.View
      key={item.id}
      entering={reduce ? undefined : SlideInDown.duration(motion.durBase)}
      exiting={reduce ? undefined : FadeOut.duration(motion.durFast)}
      pointerEvents="box-none"
      style={{ position: "absolute", left: Math.max(insets.left, space[4]), right: Math.max(insets.right, space[4]), bottom, alignItems: "center", zIndex: 100 }}
      accessibilityLiveRegion="polite"
    >
      <Glass
        strong
        style={{
          borderRadius: radius.pill,
          paddingLeft: space[4],
          paddingRight: item.undo ? space[1] : space[4],
          minHeight: size.hitMin,
          flexDirection: "row",
          alignItems: "center",
          gap: space[3],
          maxWidth: component.modalW + space[8],
        }}
      >
        <T v="body" w="medium" style={{ flexShrink: 1 }} numberOfLines={2}>
          {item.text}
        </T>
        {item.undo ? (
          <UndoButton
            onPress={() => {
              // the second tap of the double tap that made the thing is not «Отменить» (item.id = when it showed)
              if (!toastArmed(item.id, Date.now())) return;
              item.undo?.();
              onDone();
            }}
          />
        ) : null}
      </Glass>
    </Animated.View>
  );
}

const ARect = Animated.createAnimatedComponent(Rect);

/** "Undo" with a ring around it that burns down over the 5 seconds the toast stays (reduced motion: static ring). */
function UndoButton({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const left = useSharedValue(1);
  useEffect(() => {
    left.value = 1;
    if (!reduce) left.value = withTiming(0, { duration: motion.toastUndoMs, easing: Easing.linear });
  }, [left, reduce]);
  const ring = component.toastRing;
  const w = (box?.w ?? 0) - ring;
  const h = (box?.h ?? 0) - ring;
  const perimeter = 2 * Math.max(0, w - h) + Math.PI * h;
  const props = useAnimatedProps(() => ({ strokeDashoffset: perimeter * (1 - left.value) }));
  return (
    <Press
      onPress={onPress}
      visibleHeight={component.button.md}
      accessibilityRole="button"
      accessibilityLabel={t("common.undo")}
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={{
        height: component.button.md,
        paddingHorizontal: space[3],
        borderRadius: radius.pill,
        backgroundColor: c.acc,
        justifyContent: "center",
      }}
    >
      <T v="button" style={{ color: c.onAcc }}>
        {t("common.undo")}
      </T>
      {box ? (
        <Svg pointerEvents="none" width={box.w} height={box.h} style={StyleSheet.absoluteFill}>
          <ARect
            x={ring / 2}
            y={ring / 2}
            width={w}
            height={h}
            rx={h / 2}
            fill="none"
            stroke={c.onAcc}
            strokeWidth={ring}
            strokeDasharray={`${perimeter} ${perimeter}`}
            animatedProps={props}
          />
        </Svg>
      ) : null}
    </Press>
  );
}

export function useToast() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error("useToast outside ToastProvider");
  return v;
}
