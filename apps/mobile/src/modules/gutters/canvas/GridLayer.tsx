/**
 * The canvas grid as its own layer (#1434): a screen-sized Svg under the drawing's scaled layer, never scaled itself. Its two
 * paths are computed on the UI thread from the committed view and the live transform of the fingers (grid.ts), so a pinch or
 * a pan shows the grid over the whole screen at every frame — on an iPhone too, where a scaled Svg is clipped to its own box
 * (#1405 relied on `overflow: visible`: build 1405 showed the grid as a small rectangle). ids «grid-minor» / «grid-major» kept.
 */
import { View } from "react-native";
import Animated, { useAnimatedProps, useDerivedValue } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { drawing } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import type { Live } from "./CanvasView";
import { gridPaths, liveView } from "./grid";

const APath = Animated.createAnimatedComponent(Path);

export function GridLayer({ live, size, minPx, testID }: { live: Live; size: { w: number; h: number }; /** a minor cell is never finer than this on the screen, px */ minPx: number; testID?: string }) {
  const { c } = useTheme();
  // the committed view (vk, vox, voy) and the live transform: both written by the canvas's settle in one step on the UI thread (#1403)
  const { tx, ty, s, fx, fy, vk, vox, voy } = live;
  const paths = useDerivedValue(() => {
    const v = liveView(vk.value, vox.value, voy.value, s.value, tx.value, ty.value, fx.value, fy.value);
    return gridPaths(v.k, v.ox, v.oy, size.w, size.h, minPx);
  });
  const minor = useAnimatedProps(() => ({ d: paths.value.minor }));
  const major = useAnimatedProps(() => ({ d: paths.value.major }));
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: size.w, height: size.h }}>
      <Svg width={size.w} height={size.h} testID={testID}>
        {/* paths, not lines — e2e counts lines; the major lines a little bolder */}
        <APath id="grid-minor" animatedProps={minor} stroke={c.bd} strokeWidth={drawing.runW / 4} fill="none" />
        <APath id="grid-major" animatedProps={major} stroke={c.bd} strokeWidth={drawing.runW / 2} fill="none" />
      </Svg>
    </View>
  );
}
