import { toastArmed } from "./toastArm";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { avoidBehavior } from "./keyboard";
import { GestureDetector, GestureHandlerRootView, GestureStateManager, State, useNativeGesture, usePanGesture } from "react-native-gesture-handler";
import { menuPick } from "./menuPick";
import { exitDuration, scrimLevel, swipeCloses, swipeStart, swipeStep, type SwipeState } from "./sheetSwipe";
import { setGatePlatform, sheetGate, sheetMayShow, useSheetGate } from "./sheetGate";

setGatePlatform(Platform.OS === "ios");
import Svg, { Rect } from "react-native-svg";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut, SlideInDown, useAnimatedProps, useAnimatedStyle, ReduceMotion, runOnJS, useReducedMotion, useSharedValue, withSpring, withTiming, Easing } from "react-native-reanimated";
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
  const estH = Math.min((items.length + (title ? 1 : 0)) * size.hitMin + space[2] * 2, room);
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
          <ScrollView style={{ maxHeight: room - space[2] * 2 - (title ? size.hitMin : 0) }} testID="menu-items" bounces={false}>
          {items.map((it) => (
            <Press
              key={it.key}
              testID={it.testID}
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
  footer: footerNow,
  height: heightNow = "fit",
  onBack: onBackNow,
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
  /** the sheet has left the screen (after the way out): an owner that mounts it by data lets the data go now (`useHeldSheet`) */
  onExited?: () => void;
}) {
  // While the sheet goes out the owner has often already emptied what it showed (`visible={!!x}`, `{x ? … : null}`):
  // it keeps showing the last render from while it was open, so it does not collapse or jump on the way out
  const seen = useRef({ title: titleNow, children: childrenNow, footer: footerNow, height: heightNow, onBack: onBackNow });
  if (visible) seen.current = { title: titleNow, children: childrenNow, footer: footerNow, height: heightNow, onBack: onBackNow };
  const { title, children, footer, height, onBack } = seen.current;
  const { c } = useTheme();
  const { wide } = useDevice();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { t } = useI18n();
  const { height: winH } = useWindowDimensions();
  const drag = useSharedValue(0);
  const fade = useSharedValue(1); // the sheet and its scrim dissolve (reduce motion, the centred window): 1 → 0
  const sheetH = useSharedValue(0); // the sheet's own height: how far it has to go, and how the scrim follows
  const leaving = useRef(false); // a close is asked or under way: one onClose per close, whatever is pressed meanwhile
  const shown = useRef(visible);
  shown.current = visible;
  // The sheet stays on the screen while it goes out, also when the owner closes it by itself (DS Б1, #1163):
  // `present` is "mounted", `visible` is what the owner wants. `session` marks one opening or one exit: the callback
  // of an earlier one does nothing.
  const [present, setPresent] = useState(visible);
  // iOS: a sheet the owner opens while another is going out waits for it (sheetGate.ts). It does not show in the beat it
  // is asked in — it is armed one tick later, when the sheet that closed in the same beat has registered that it leaves —
  // and one at a time, in the order asked
  const gateOn = sheetGate.on();
  useSheetGate(); // re-render when the gate changes
  const counted = useRef(false); // this sheet is counted in the gate while its Modal is on the way out
  const ticket = useRef(0); // its place in the queue of those that wait to open
  const [armed, setArmed] = useState(false);
  const may =
    !gateOn ||
    (armed && sheetMayShow({ gate: true, leavingAll: sheetGate.count(), selfLeaving: counted.current, first: ticket.current === sheetGate.first() }));
  const canShow = visible && may;
  const open = canShow || present;
  const presentNow = useRef(present);
  presentNow.current = present;
  const session = useRef(0);
  const exitSpeed = useRef(0);
  const [asked, setAsked] = useState(0);
  const [full, setFull] = useState(false);
  const [ask, setAsk] = useState(false);
  const live = useRef({ dirty, onClose, onExited });
  live.current = { dirty, onClose, onExited };
  const uncount = useCallback(() => {
    if (!counted.current) return;
    counted.current = false;
    sheetGate.leave();
  }, []);
  const unqueue = useCallback(() => {
    if (!ticket.current) return;
    sheetGate.unqueue(ticket.current);
    ticket.current = 0;
  }, []);
  // unmounted on the way out or while waiting: the gate must not stay held
  useEffect(
    () => () => {
      uncount();
      unqueue();
    },
    [uncount, unqueue],
  );
  useEffect(() => {
    if (canShow) {
      unqueue();
      uncount(); // it came back while it was going out: it is the same sheet, no longer leaving
      session.current++;
      exitSpeed.current = 0;
      passThrough(false);
      drag.value = 0;
      fade.value = 1;
      leaving.current = false;
      setPresent(true);
      setFull(false);
      setAsk(false);
    }
  }, [canShow, drag, fade, unqueue, uncount]);
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
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);
  // the arming (after the beat's effects), and a wish taken back before it was shown
  useEffect(() => {
    if (!gateOn) return;
    if (visible) {
      const id = setTimeout(() => {
        if (!ticket.current) ticket.current = sheetGate.queue();
        setArmed(true);
      }, 0);
      return () => clearTimeout(id);
    }
    const waited = armed || ticket.current !== 0;
    unqueue();
    setArmed(false);
    // asked to open and closed before it ever showed: no exit will come, the owner can let the data go
    if (waited && !presentNow.current) live.current.onExited?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, gateOn]);
  const gone = useCallback((id: number) => {
    if (id !== session.current || !mounted.current) return;
    leaving.current = false;
    setPresent(false);
    live.current.onExited?.();
    // the gate opens when the Modal is really dismissed (iOS: onDismiss); this is the net, as in menuPick
    if (counted.current) setTimeout(uncount, motion.durSlow + motion.durFast);
  }, [uncount]);
  // it goes down at the finger's speed (✕, the scrim, Esc, the owner's own close — in durBase), the scrim fades with
  // it; reduce motion and the centred window (no swipe) — it dissolves
  const exit = useCallback(
    (speed: number) => {
      const id = ++session.current;
      leaving.current = true;
      if (sheetGate.on() && !counted.current) {
        counted.current = true;
        sheetGate.enter();
      }
      passThrough(true);
      const done = (finished?: boolean) => {
        "worklet";
        if (finished) runOnJS(gone)(id);
      };
      // the animation's end can fail to come (the screen under the sheet went to the background, the frames stopped):
      // the sheet is taken off by this safety net too, once the exit has had its time
      if (reduce || wide) {
        // a dissolve is what reduce motion allows: it must not be skipped by the system setting
        fade.value = withTiming(0, { duration: motion.durFast, reduceMotion: ReduceMotion.Never }, done);
        setTimeout(() => gone(id), motion.durFast + motion.durBase);
        return;
      }
      const h = sheetH.value || winH;
      const ms = exitDuration(Math.max(h - drag.value, 0), speed, motion.durFast, motion.durSlow, motion.durBase);
      drag.value = withTiming(h, { duration: ms, easing: speed > 0 ? Easing.linear : Easing.bezier(...motion.easeOut) }, done);
      setTimeout(() => gone(id), ms + motion.durBase);
    },
    [reduce, wide, winH, drag, fade, sheetH, gone, passThrough],
  );
  const exitNow = useRef(exit);
  exitNow.current = exit;
  // the owner closed it (after its own «Сохранить», or because we asked): now it goes out
  useEffect(() => {
    if (!visible && present) exitNow.current(exitSpeed.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  // we asked the owner (onClose); if it is still open after the answer, the sheet comes back at once (busy, a key to enter…)
  useEffect(() => {
    if (asked === 0 || !shown.current) return;
    leaving.current = false;
    exitSpeed.current = 0;
    drag.value = withSpring(0, motion.spring);
    fade.value = withTiming(1, { duration: motion.durFast, reduceMotion: ReduceMotion.Never });
  }, [asked, drag, fade]);
  const requestClose = useCallback(
    (v?: number, discard?: boolean) => {
      if (leaving.current) return;
      if (live.current.dirty && !discard) {
        drag.value = withSpring(0, motion.spring);
        setAsk(true);
        return;
      }
      leaving.current = true;
      exitSpeed.current = typeof v === "number" ? v : 0;
      live.current.onClose();
      setAsked((n) => n + 1);
    },
    [drag],
  );
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
    <Modal visible={open} transparent animationType="none" onDismiss={uncount} onRequestClose={onBack ? () => { if (!leaving.current) onBack(); } : () => requestClose()} statusBarTranslucent supportedOrientations={ALL_ORIENTATIONS}>
      {/* a Modal is its own native root: gestures in it need their own root view (Gesture Handler) */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        pointerEvents={visible ? "auto" : "none"}
        behavior={avoidBehavior}
        // 820/1280: the centred sheet keeps clear of the home indicator too (docs/specs/32) — without one, as before;
        // the phone sheet runs to the edge
        style={{ flex: 1, justifyContent: wide ? "center" : "flex-end", alignItems: "center", paddingTop: insets.top + space[2], paddingBottom: wide ? insets.bottom : 0 }}
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
                  <Press testID="sheet-close" onPress={() => requestClose()} visibleHeight={component.dockBtn} accessibilityRole="button" accessibilityLabel={t("common.close")}>
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
                  onPress={() => { setAsk(false); requestClose(0, true); }}
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
