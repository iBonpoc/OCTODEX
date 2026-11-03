import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useReducedMotion } from "react-native-reanimated";
import { component, motion, radius, size, space } from "@octo/design-tokens";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { Icon, Press, T } from "./primitives";

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

/* ---------- Sheet: bottom sheet on phone, centered modal on tablet/desktop ---------- */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const { c } = useTheme();
  const { wide } = useDevice();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: wide ? "center" : "flex-end", alignItems: "center" }}>
        <Animated.View
          entering={reduce ? undefined : FadeIn.duration(motion.durBase)}
          exiting={reduce ? undefined : FadeOut.duration(motion.durFast)}
          style={StyleSheet.absoluteFill}
        >
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
          />
        </Animated.View>
        <Animated.View
          entering={reduce ? undefined : SlideInDown.duration(motion.durSlow)}
          exiting={reduce ? undefined : SlideOutDown.duration(motion.durBase)}
          style={{ width: wide ? component.modalW + space[8] * 2 : "100%", maxWidth: "100%" }}
          accessibilityViewIsModal
        >
          <Glass
            strong
            style={{
              borderRadius: component.sheetRadius,
              borderBottomLeftRadius: wide ? component.sheetRadius : 0,
              borderBottomRightRadius: wide ? component.sheetRadius : 0,
              padding: space[4],
              paddingBottom: wide ? space[4] : insets.bottom + space[4],
              gap: space[3],
            }}
          >
            {!wide ? (
              <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: radius.pill, backgroundColor: c.track }} />
            ) : null}
            {title ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <T v="title">{title}</T>
                <Press onPress={onClose} visibleHeight={component.dockBtn} accessibilityRole="button" accessibilityLabel={t("common.close")}>
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
                    <Icon name="close" s={16} />
                  </View>
                </Press>
              </View>
            ) : null}
            {children}
          </Glass>
        </Animated.View>
      </View>
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
          <Press
            onPress={() => {
              item.undo?.();
              onDone();
            }}
            visibleHeight={component.button.md}
            accessibilityRole="button"
            accessibilityLabel={t("common.undo")}
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
          </Press>
        ) : null}
      </Glass>
    </Animated.View>
  );
}

export function useToast() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error("useToast outside ToastProvider");
  return v;
}
