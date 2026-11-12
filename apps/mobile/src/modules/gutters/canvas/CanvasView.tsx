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
import { clampView, type View as PlanView, type ZoomLimits } from "./scene";
import { applyTf, endGesture, panFrame, pinchFrame, settle, type LiveState, type Pending, type Tf } from "./gestureState";

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
/** the limits of the scale and what to do at one (#1281): the viewport is for the clamp at the commit; `onEdge` is the tick when the pinch reaches a limit */
export interface ZoomGuard { lim: ZoomLimits; viewport: { w: number; h: number }; onEdge?: () => void }

export function useCanvasGestures(view: PlanView, onView: (v: PlanView) => void, live: Live, panPointers = 1, zoom?: ZoomGuard) {
  const { tx, ty, s, fx, fy } = live;
  // the gesture's callbacks may be the ones made at an earlier render: they read the view of now from a ref
  const now = useRef({ view, onView, zoom });
  now.current = { view, onView, zoom };
  // commits made and not rendered yet (gestureState.ts: the render takes away exactly its commit from the live transform)
  const pending = useRef<Pending[]>([]);
  const commit = (S: number, Tx: number, Ty: number) => {
    const t = { S, Tx, Ty };
    const z = now.current.zoom;
    const raw = applyTf(now.current.view, t);
    const v = z ? clampView(raw, z.lim, z.viewport) : raw;
    pending.current.push({ view: v, tf: t });
    now.current.onView(v);
  };
  /** the render of `v` arrived (Canvas' layout effect): the live transform loses the commit that made it */
  const settleView = (v: PlanView) => {
    const r = settle({ S: s.value, Tx: tx.value, Ty: ty.value }, pending.current, v);
    pending.current = r.pending;
    baseK.value = v.k;
    tx.value = r.live.Tx;
    ty.value = r.live.Ty;
    s.value = r.live.S;
    fx.value = 0;
    fy.value = 0;
  };
  // the live transform is kept in the origin form (fx = fy = 0): p' = S·p + T
  const seg = useSharedValue(false);
  const nPinch = useSharedValue(0);
  const nPan = useSharedValue(0);
  const edge = useSharedValue<-1 | 0 | 1>(0);
  /** the scale limits as factors of the view on the screen are kMin / baseK and kMax / baseK (the live scale is against that view) */
  const baseK = useSharedValue(view.k);
  const kMin = useSharedValue(zoom ? zoom.lim.kMin : 0);
  const kMax = useSharedValue(zoom ? zoom.lim.kMax : 0);
  useLayoutEffect(() => {
    kMin.value = zoom ? zoom.lim.kMin : 0;
    kMax.value = zoom ? zoom.lim.kMax : 0;
  }, [zoom?.lim.kMin, zoom?.lim.kMax, kMin, kMax]);
  const edgeTick = () => now.current.zoom?.onEdge?.();
  const state = (): LiveState => {
    "worklet";
    return { S: s.value, Tx: tx.value, Ty: ty.value, seg: seg.value, nPinch: nPinch.value, nPan: nPan.value, edge: edge.value };
  };
  const put = (st: LiveState, req: Tf | null) => {
    "worklet";
    tx.value = st.Tx;
    ty.value = st.Ty;
    s.value = st.S;
    fx.value = 0;
    fy.value = 0;
    seg.value = st.seg;
    nPinch.value = st.nPinch;
    nPan.value = st.nPan;
    if (st.edge !== 0 && st.edge !== edge.value) scheduleOnRN(edgeTick); // a tick on reaching a limit of the scale, once
    edge.value = st.edge;
    if (req) scheduleOnRN(commit, req.S, req.Tx, req.Ty);
  };
  const end = () => {
    "worklet";
    const st = state();
    put(st, endGesture(st));
  };
  const pan = usePanGesture({
    minPointers: panPointers,
    onUpdate: (e) => {
      "worklet";
      const st = state();
      put(st, panFrame(st, e, panPointers));
    },
    onDeactivate: end,
  });
  const pinch = usePinchGesture({
    onUpdate: (e) => {
      "worklet";
      const st = state();
      put(st, pinchFrame(st, e, kMax.value > 0 && baseK.value > 0 ? { lo: kMin.value / baseK.value, hi: kMax.value / baseK.value } : undefined));
    },
    onDeactivate: end,
  });
  const both = useSimultaneousGestures(pan, pinch);
  return { pan, pinch, both, settleView };
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
    gestures.settleView(view);
  }, [view, gestures]);

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
