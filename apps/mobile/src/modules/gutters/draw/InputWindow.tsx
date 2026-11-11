import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { component, motion, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { ALL_ORIENTATIONS, Glass, Sheet } from "@/ui/overlays";

/**
 * The input window (DESIGN-SYSTEM Б1а, #924): a short input of one value with the keyboard. On a phone a small window
 * a little above the middle, narrower than the screen — and the keyboard never moves it: it is laid out from the top
 * of the window, with no keyboard avoidance (a sheet sitting on the keyboard jumped with it, founder 11.11). From 820 it
 * is the ordinary centred sheet window (Б1). A tap outside = «Отменить» (`onClose`).
 */
export function InputWindow({ visible, onClose, children, testID = "input-window" }: { visible: boolean; onClose: () => void; children: ReactNode; testID?: string }) {
  const { wide } = useDevice();
  const { c } = useTheme();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const { width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (wide) return <Sheet visible={visible} onClose={onClose}>{children}</Sheet>;
  const side = Math.max(insets.left, insets.right, space[4]);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent supportedOrientations={ALL_ORIENTATIONS}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-start", paddingTop: insets.top + space[8] * 2 }}>
          <Animated.View entering={reduce ? undefined : FadeIn.duration(motion.durBase)} exiting={reduce ? undefined : FadeOut.duration(motion.durFast)} style={StyleSheet.absoluteFill}>
            <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.close")} />
          </Animated.View>
          <Animated.View
            entering={reduce ? undefined : FadeIn.duration(motion.durBase)}
            exiting={reduce ? undefined : FadeOut.duration(motion.durFast)}
            style={{ width: Math.min(component.modalW + space[8] * 2, winW - side * 2), maxWidth: "100%" }}
            accessibilityViewIsModal
          >
            <Glass strong testID={testID} style={{ borderRadius: component.sheetRadius, padding: space[4], gap: space[3] }}>
              {children}
            </Glass>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
