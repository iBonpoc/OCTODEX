/**
 * The grid layer (#1403, #1434): a Svg of the screen's size that does NOT move with the drawing; its two paths are made every frame on the UI thread
 * from the committed view and the live transform (grid.ts), so the grid is never cut and never scaled with the picture. Under the drawing, no touches.
 */
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedProps, useDerivedValue } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { drawing } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { gridPaths } from "./grid";
import type { Live } from "./CanvasView";

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function GridLayer({ live, size, minPx }: { live: Live; size: { w: number; h: number }; minPx: number }) {
  const { c } = useTheme();
  const paths = useDerivedValue(() => {
    const S = live.s.value;
    // the view the screen shows now: the committed view under the live transform p' = S·p + T
    return gridPaths(live.baseK.value * S, S * live.baseOx.value + live.tx.value, S * live.baseOy.value + live.ty.value, size.w, size.h, minPx);
  });
  const minor = useAnimatedProps(() => ({ d: paths.value.minor }));
  const major = useAnimatedProps(() => ({ d: paths.value.major }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={size.w} height={size.h} testID="draw-grid">
        <AnimatedPath id="grid-minor" animatedProps={minor} stroke={c.bd} strokeWidth={drawing.runW / 4} fill="none" />
        <AnimatedPath id="grid-major" animatedProps={major} stroke={c.bd} strokeWidth={drawing.runW / 2} fill="none" />
      </Svg>
    </View>
  );
}
