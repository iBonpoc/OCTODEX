/**
 * The canvas grid as its own layer (#1434): a screen-sized Svg under the drawing's scaled layer, never scaled itself. Its two
 * paths are computed on the UI thread from the committed view and the live transform of the fingers (grid.ts), so a pinch or
 * a pan shows the grid over the whole screen at every frame — on an iPhone too, where a scaled Svg is clipped to its own box
 * (#1405 relied on `overflow: visible`: build 1405 showed the grid as a small rectangle). ids «grid-minor» / «grid-major» kept.
 */
import { useLayoutEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedProps, useAnimatedReaction, useDerivedValue, useSharedValue } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { drawing } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import type { Live } from "./CanvasView";
import { gridPaths, gridStepHyst, liveView } from "./grid";
import type { View as PlanView } from "./scene";

const APath = Animated.createAnimatedComponent(Path);

export function GridLayer({ view, live, size, minPx, testID }: { view: PlanView; live: Live; size: { w: number; h: number }; /** a minor cell is never finer than this on the screen, px */ minPx: number; testID?: string }) {
  const { c } = useTheme();
  const { tx, ty, s, fx, fy } = live;
  // the committed view, as the UI thread sees it: written in the same commit in which the canvas drops its live transform
  const k = useSharedValue(view.k);
  const ox = useSharedValue(view.ox);
  const oy = useSharedValue(view.oy);
  useLayoutEffect(() => {
    k.value = view.k;
    ox.value = view.ox;
    oy.value = view.oy;
  }, [view, k, ox, oy]);
  // the step, with a margin at its thresholds (#1477): a shaking hand at a threshold does not flip the fine lines every frame. A
  // reaction, not the derived value below: the step must remember itself, and a derived value that reads what it writes runs again
  const step = useSharedValue(0);
  useAnimatedReaction(
    () => k.value * s.value,
    (kNow) => {
      step.value = gridStepHyst(kNow, minPx, step.value);
    },
    [minPx],
  );
  const paths = useDerivedValue(() => {
    const v = liveView(k.value, ox.value, oy.value, s.value, tx.value, ty.value, fx.value, fy.value);
    return gridPaths(v.k, v.ox, v.oy, size.w, size.h, minPx, step.value);
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
