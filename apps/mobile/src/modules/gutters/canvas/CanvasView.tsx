/**
 * The canvas layer (docs/specs/33-gutters-canvas.md П20.1): pan and pinch move one transform on the UI thread — the
 * drawing is not redrawn during the gesture; when the fingers lift, the new view is committed and the painter redraws
 * crisp at the new scale. `live` lets the speed bench drive the same transform without fingers.
 */
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { GestureDetector, usePanGesture, usePinchGesture, useSimultaneousGestures } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import type { View as PlanView } from "./scene";

/** the live part of the transform: shift, scale about a focal point (screen px of the canvas) */
export interface Live { tx: SharedValue<number>; ty: SharedValue<number>; s: SharedValue<number>; fx: SharedValue<number>; fy: SharedValue<number> }

export function useLive(): Live {
  return { tx: useSharedValue(0), ty: useSharedValue(0), s: useSharedValue(1), fx: useSharedValue(0), fy: useSharedValue(0) };
}

/** the committed view after a live transform: p' = f + s·(p − f) + t */
export function commitView(v: PlanView, tx: number, ty: number, s: number, fx: number, fy: number): PlanView {
  return { k: v.k * s, ox: fx + s * (v.ox - fx) + tx, oy: fy + s * (v.oy - fy) + ty };
}

/**
 * The canvas's own two gestures (pan, pinch). A screen that has one-finger gestures inside the canvas makes them with
 * this hook and lists `pinch` and `pan` in their `simultaneousWith`: otherwise the inner one-finger gesture, once it has
 * activated (the first finger moved before the second landed — always so on a phone), keeps the touch and the pinch never
 * comes (founder 09.11: «moved, but did not shrink»).
 */
export function useCanvasGestures(view: PlanView, onView: (v: PlanView) => void, live: Live, panPointers = 1) {
  const { tx, ty, s, fx, fy } = live;
  // the gesture's callbacks may be the ones made at an earlier render: they read the view of now from a ref
  const now = useRef({ view, onView });
  now.current = { view, onView };
  const commit = (a: number, b: number, k: number, x: number, y: number) => now.current.onView(commitView(now.current.view, a, b, k, x, y));
  const end = () => {
    "worklet";
    if (tx.value !== 0 || ty.value !== 0 || s.value !== 1) scheduleOnRN(commit, tx.value, ty.value, s.value, fx.value, fy.value);
  };
  const pan = usePanGesture({
    minPointers: panPointers,
    onUpdate: (e) => {
      "worklet";
      tx.value += e.changeX;
      ty.value += e.changeY;
    },
    onDeactivate: end,
  });
  const pinch = usePinchGesture({
    onActivate: (e) => {
      "worklet";
      fx.value = e.focalX;
      fy.value = e.focalY;
    },
    onUpdate: (e) => {
      "worklet";
      s.value *= e.scaleChange;
    },
    onDeactivate: end,
  });
  const both = useSimultaneousGestures(pan, pinch);
  return { pan, pinch, both };
}

export type CanvasGestures = ReturnType<typeof useCanvasGestures>;

export function CanvasView(props: {
  view: PlanView;
  onView: (v: PlanView) => void;
  live: Live;
  size: { w: number; h: number };
  onSize: (s: { w: number; h: number }) => void;
  /** 1 on the bench; 2 while drawing (one finger draws) */
  panPointers?: number;
  /** made by the screen with useCanvasGestures when it has gestures of its own inside */
  gestures?: CanvasGestures;
  children: ReactNode;
  testID?: string;
}) {
  return props.gestures ? <Canvas {...props} gestures={props.gestures} /> : <OwnGestures {...props} />;
}

function OwnGestures(props: Parameters<typeof CanvasView>[0]) {
  const g = useCanvasGestures(props.view, props.onView, props.live, props.panPointers);
  return <Canvas {...props} gestures={g} />;
}

function Canvas({ view, live, size, onSize, gestures, children, testID }: Parameters<typeof CanvasView>[0] & { gestures: CanvasGestures }) {
  const { tx, ty, s, fx, fy } = live;
  // the painter has redrawn at the committed view: drop the live transform in the same frame
  useLayoutEffect(() => {
    tx.value = 0;
    ty.value = 0;
    s.value = 1;
  }, [view, tx, ty, s]);

  const st = useAnimatedStyle(() => {
    const cx = size.w / 2;
    const cy = size.h / 2;
    return { transform: [{ translateX: (fx.value - cx) * (1 - s.value) + tx.value }, { translateY: (fy.value - cy) * (1 - s.value) + ty.value }, { scale: s.value }] };
  });
  const layout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.round(width) !== size.w || Math.round(height) !== size.h) onSize({ w: Math.round(width), h: Math.round(height) });
  };
  return (
    <GestureDetector gesture={gestures.both}>
      <View style={{ flex: 1, overflow: "hidden" }} onLayout={layout} testID={testID}>
        <Animated.View style={[{ width: size.w, height: size.h }, st]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}
