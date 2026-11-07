import { toastArmed } from "./toastArm";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { avoidBehavior } from "./keyboard";
import Svg, { Rect } from "react-native-svg";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, Easing } from "react-native-reanimated";
import { component, motion, radius, size, space } from "@octo/design-tokens";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { Icon, Press, T, type IconKey } from "./primitives";

/* ---------- Glass panel (overlay background --ov + blur --blurov) ---------- */
export function Glass({ children, style, strong }: { children: ReactNode; style?: object; strong?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[{ overflow: "hidden", backgroundColor: c.ov, borderColor: c.bd, borderWidth: 1 }, style]}>
      <BlurView intensity={strong ? c.blurOverlay * 3 : c.blur * 3} tint={c.blurTint} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
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
}
export function Menu<K extends string>({
  visible,
  anchor,
  items,
  onSelect,
  onClose,
  title,
}: {
  visible: boolean;
  anchor: { x: number; y: number; w: number; h: number } | null;
  items: MenuItem<K>[];
  onSelect: (k: K) => void;
  onClose: () => void;
  title?: string;
}) {
  const { c } = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const reduce = useReducedMotion();
  if (!visible || !anchor) return null;
  const w = Math.min(component.menuW, winW - space[4] * 2);
  const left = Math.max(space[4], Math.min(anchor.x, winW - w - space[4]));
  const below = anchor.y + anchor.h + space[1];
  const estH = (items.length + (title ? 1 : 0)) * size.hitMin + space[2] * 2;
  const top = below + estH > winH - space[4] ? Math.max(space[4], anchor.y - estH - space[1]) : below;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
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
          {items.map((it) => (
            <Press
              key={it.key}
              onPress={() => {
                onClose();
                onSelect(it.key);
              }}
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
        </Glass>
      </Animated.View>
    </Modal>
  );
}

/* ---------- Sheet: iOS-style bottom sheet on phone, centered modal on tablet/desktop ----------
 * Phone: grabber; drag the top of the sheet down to close, up to open it full height; tap outside or Android back closes.
 * `dirty` (unsaved changes): any way of closing asks "Save / Don't save / Cancel" first (DS rule 10).
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  dirty,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** unsaved changes in the sheet */
  dirty?: boolean;
  /** "Save" in the unsaved-changes question */
  onSave?: () => void;
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
  const live = useRef({ dirty, onClose });
  live.current = { dirty, onClose };
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
  const follow = useAnimatedStyle(() => ({ transform: [{ translateY: drag.value }] }));
  const maxH = full ? winH - insets.top - space[2] : winH * component.sheetHeightRatio;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={requestClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={avoidBehavior}
        style={{ flex: 1, justifyContent: wide ? "center" : "flex-end", alignItems: "center", paddingTop: insets.top + space[2] }}
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
          style={[{ width: wide ? component.modalW + space[8] * 2 : "100%", maxWidth: "100%", maxHeight: wide ? "100%" : maxH }, wide ? null : follow]}
          accessibilityViewIsModal
        >
          <Glass
            strong
            style={{
              flexShrink: 1,
              borderRadius: component.sheetRadius,
              borderBottomLeftRadius: wide ? component.sheetRadius : 0,
              borderBottomRightRadius: wide ? component.sheetRadius : 0,
              padding: space[4],
              paddingTop: wide ? space[4] : 0,
              paddingBottom: wide ? space[4] : insets.bottom + space[4],
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
              {title ? (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: size.hitMin }}>
                  <T v="title" style={{ flexShrink: 1 }}>{title}</T>
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
              <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space[3] }} keyboardShouldPersistTaps="handled" bounces={false}>
                {children}
              </ScrollView>
            )}
          </Glass>
        </Animated.View>
      </KeyboardAvoidingView>
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
      style={{ position: "absolute", left: space[4], right: space[4], bottom, alignItems: "center", zIndex: 100 }}
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
