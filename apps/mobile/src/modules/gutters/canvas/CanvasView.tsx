/**
 * The canvas layer (docs/specs/33-gutters-canvas.md П20.1): pan and pinch move one transform on the UI thread — the
 * drawing is not redrawn during the gesture; when the fingers lift, the new view is committed and the painter redraws
 * crisp at the new scale. `live` lets the speed bench drive the same transform without fingers.
 */
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { GestureDetector, usePanGesture, usePinchGesture, useSimultaneousGestures } from "react-native-gesture-handler";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import { clampView, type View as PlanView, type ZoomLimits } from "./scene";
import { applyTf, endGesture, panFrame, pinchFrame, settleDone, settleLive, type LiveState, type Pending, type Tf } from "./gestureState";

/** the live part of the transform: shift, scale about a focal point (screen px of the canvas) */
export interface Live {
  tx: SharedValue<number>; ty: SharedValue<number>; s: SharedValue<number>; fx: SharedValue<number>; fy: SharedValue<number>;
  /** the committed view the live transform is against (k, ox, oy; k 0 — none yet), written by the settle on the UI thread in ONE step with
   * the live transform (#1403): the grid layer (#1434) draws the view on the screen from both, and never sees a new view with an old transform */
  vk: SharedValue<number>; vox: SharedValue<number>; voy: SharedValue<number>;
}

export function useLive(): Live {
  return { tx: useSharedValue(0), ty: useSharedValue(0), s: useSharedValue(1), fx: useSharedValue(0), fy: useSharedValue(0), vk: useSharedValue(0), vox: useSharedValue(0), voy: useSharedValue(0) };
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
  const { tx, ty, s, fx, fy, vk, vox, voy } = live;
  // the gesture's callbacks may be the ones made at an earlier render: they read the view of now from a ref
  const now = useRef({ view, onView, zoom });
  now.current = { view, onView, zoom };
  // commits made and not rendered yet (gestureState.ts: the render takes away exactly its commit from the live transform)
  const pending = useRef<Pending[]>([]);
  /** when a two-finger segment last began or ended (ms): a tap right after it is the fingers lifting, not a tap (a pinch that ends over a length label opened its sheet) */
  const multiAt = useRef(0);
  const markMulti = () => {
    multiAt.current = Date.now();
  };
  const commit = (S: number, Tx: number, Ty: number) => {
    markMulti();
    const t = { S, Tx, Ty };
    const z = now.current.zoom;
    const raw = applyTf(now.current.view, t);
    const v = z ? clampView(raw, z.lim, z.viewport) : raw;
    pending.current.push({ view: v, tf: t });
    now.current.onView(v);
  };
  /** the view last settled: the same view again is only another render of the screen, never a reason to touch the live transform (#1403) */
  const settled = useRef<PlanView | null>(null);
  /** the render of `v` arrived (Canvas' layout effect): the live transform loses the commit that made it — on the UI thread (#1403) */
  const settleView = (v: PlanView) => {
    if (settled.current === v) return;
    const r = settleDone(pending.current, v);
    settled.current = v;
    pending.current = r.pending;
    scheduleOnUI(applySettle, v.k, v.ox, v.oy, r.done);
  };
  /**
   * The settle on the UI thread, between two frames of the fingers (#1403): the live transform is read and written there in one step, so no
   * frame of a pinch that goes on is lost (on the JS thread it was read, then written back a moment later — the frames between were dropped:
   * a jump). The committed view is written in the same step: the grid never draws a new view under an old transform, or the other way round.
   */
  const applySettle = (k: number, ox: number, oy: number, done: Tf | null) => {
    "worklet";
    const next = settleLive({ S: s.value, Tx: tx.value, Ty: ty.value }, done);
    vk.value = k;
    vox.value = ox;
    voy.value = oy;
    tx.value = next.Tx;
    ty.value = next.Ty;
    s.value = next.S;
    fx.value = 0;
    fy.value = 0;
  };
  // the live transform is kept in the origin form (fx = fy = 0): p' = S·p + T
  const seg = useSharedValue(false);
  const nPinch = useSharedValue(0);
  const nPan = useSharedValue(0);
  const edge = useSharedValue<-1 | 0 | 1>(0);
  /** the scale limits as factors of the view on the screen are kMin / vk and kMax / vk (the live scale is against that view) */
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
    if (st.seg && !seg.value) scheduleOnRN(markMulti); // a two-finger segment began (before `seg` is written)
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
  // The configs are made ONCE (again only if `panPointers` changes): RNGH 3 keys its handler on the config object
  // (useClonedAndRemappedConfig → useGesture's effect), and a new object on every render of the screen sent the config to the native
  // handler and registered it again on every render — in the middle of a pinch too (#1403: «пальцы отлипают»). What the callbacks hold is
  // stable: shared values, refs, and `commit` / `markMulti` / `edgeTick`, which read the refs.
  const panConfig = useMemo(
    () => ({
      minPointers: panPointers,
      onUpdate: (e: Parameters<typeof panFrame>[1]) => {
        "worklet";
        const st = state();
        put(st, panFrame(st, e, panPointers));
      },
      onDeactivate: end,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panPointers],
  );
  const pinchConfig = useMemo(
    () => ({
      onUpdate: (e: Parameters<typeof pinchFrame>[1]) => {
        "worklet";
        const st = state();
        put(st, pinchFrame(st, e, kMax.value > 0 && vk.value > 0 ? { lo: kMin.value / vk.value, hi: kMax.value / vk.value } : undefined));
      },
      onDeactivate: end,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const pan = usePanGesture(panConfig);
  const pinch = usePinchGesture(pinchConfig);
  const both = useSimultaneousGestures(pan, pinch);
  // one object for the screen's whole life (the gestures themselves are kept by the library): a new object every render made the
  // canvas settle again after every render (#1403); `settleView` reads what it needs from refs and shared values
  const settleRef = useRef(settleView);
  settleRef.current = settleView;
  const stableSettle = useMemo(() => (v: PlanView) => settleRef.current(v), []);
  return useMemo(() => ({ pan, pinch, both, settleView: stableSettle, multiAt }), [pan, pinch, both, stableSettle]);
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
  /** drawn under the scaled layer and never scaled: the grid (#1434), which follows the live view by itself */
  under?: ReactNode;
  children: ReactNode;
  testID?: string;
}) {
  return props.gestures ? <Canvas {...props} gestures={props.gestures} /> : <OwnGestures {...props} />;
}

function OwnGestures(props: Parameters<typeof CanvasView>[0]) {
  const g = useCanvasGestures(props.view, props.onView, props.live, props.panPointers);
  return <Canvas {...props} gestures={g} />;
}

function Canvas({ view, live, size, onSize, gestures, under, children, testID }: Parameters<typeof CanvasView>[0] & { gestures: CanvasGestures }) {
  const { tx, ty, s, fx, fy } = live;
  // the painter has redrawn at the committed view: drop the live transform in the same frame — only when the VIEW changed, never on
  // another render of the screen (#1403: a blink or a hint re-rendered mid-pinch and the drawing jumped back under the fingers)
  const settleNow = useRef(gestures.settleView);
  settleNow.current = gestures.settleView;
  useLayoutEffect(() => {
    settleNow.current(view);
  }, [view]);

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
        {under}
        <Animated.View style={[{ width: size.w, height: size.h }, st]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}
