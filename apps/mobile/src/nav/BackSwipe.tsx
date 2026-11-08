import type { ReactNode } from "react";
import { useWindowDimensions } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { motion } from "@octo/design-tokens";
import { useIsFocused } from "expo-router";
import { BACK_SWIPE_START, backSwipeEdge, swipeGoesBack } from "./backSwipe";

/**
 * The edge swipe of a tab screen that has a header «back» (./backSwipe.ts): the screen follows the finger from the
 * left edge; let go far or fast enough — `onBack` (the very handler of the header button), else it springs back.
 * Reduced motion: the screen does not follow the finger; letting go far or fast enough goes back at once. `enabled` = false — the gesture is off; the
 * wrapper stays, so turning it on or off (a rotation) never remounts the screen.
 */
export function BackSwipe({ enabled, edge, onBack, children }: { enabled: boolean; edge: number; onBack: () => void; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const tx = useSharedValue(0);
  // a screen the app is leaving (or one under another) does not take a second swipe in the middle of the change
  const focused = useIsFocused();
  const pan = usePanGesture({
    enabled: enabled && focused,
    runOnJS: true,
    hitSlop: { left: 0, width: backSwipeEdge(edge) },
    // only a rightward drag; a vertical one is the scroll's
    activeOffsetX: [-width, BACK_SWIPE_START],
    failOffsetY: [-BACK_SWIPE_START, BACK_SWIPE_START],
    onUpdate: (e) => {
      if (!reduce) tx.value = Math.max(0, e.translationX);
    },
    onDeactivate: (e) => {
      if (!e.canceled && swipeGoesBack(e.translationX, e.velocityX, width)) {
        tx.value = 0;
        onBack();
      } else tx.value = reduce ? 0 : withSpring(0, motion.spring);
    },
  });
  const a = useAnimatedStyle(() => ({ flex: 1, transform: [{ translateX: tx.value }] }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View testID={enabled ? "back-swipe" : undefined} style={a}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
