import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { component, gesture, motion, radius, size, space, z } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { haptics } from "@/ui/haptics";
import { Icon } from "@/ui/primitives";
import { useScreenScroll } from "@/ui/requiredForm";
import { useScrollLock } from "@/ui/surfaces";
import { insertionIndex, resolveDrop, rowKey, shiftOf, withoutBlock, type Drop } from "./sortable";
import type { ViewRow } from "./sectionLayout";

/**
 * The estimate's list you can drag in (DS §14.6, spec Р5): a row is taken by its handle «≡» (at once, after `gesture.dragStart`)
 * or — a folded one — by a hold of `gesture.dragHoldMs` (a mouse: after a move of `dragStart`). It lifts (`motion.liftScale`,
 * `liftTilt`, shadow, frame `acc`), the rows make room (`durBase`) and a bar shows the place; near the top or bottom of the
 * screen the page scrolls (`gesture.autoScrollEdge`); let go over the list — it lands (`medium`), over nothing — it springs back.
 * A section is carried whole (it folds while held). Reduced motion: no lift, no spring.
 */
interface Ctl {
  keys: string[];
  active: string | null;
  to: number;
  from: number;
  h: number;
  lift: ReturnType<typeof useSharedValue<number>>;
  dragY: ReturnType<typeof useSharedValue<number>>;
  layout: (key: string, y: number, h: number) => void;
  node: (key: string, n: ComponentRef<typeof View> | null) => void;
  begin: (key: string) => void;
  move: (key: string, ty: number, absY: number) => void;
  end: (key: string, canceled: boolean) => void;
  canDrag: (key: string) => boolean;
}
const SortCtx = createContext<Ctl | null>(null);

export interface SortableListProps {
  rows: ViewRow[];
  /** the open row: only its handle drags (a hold would fight the text selection) */
  openKey?: string | null;
  /** a signed estimate: nothing drags */
  locked?: boolean;
  /** the place the held row was dropped at (the screen moves the line / section; a refusal is its toast) */
  onDrop: (drop: Drop) => void;
  /** a section is held: the screen folds it while it is carried (its lines go with it), `null` — let go */
  onHold?: (sectionId: string | null) => void;
  renderRow: (row: ViewRow, index: number) => ReactNode;
}

export function SortableList({ rows, openKey, locked, onDrop, onHold, renderRow }: SortableListProps) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const lock = useScrollLock();
  const scroll = useScreenScroll();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const layouts = useRef(new Map<string, { y: number; h: number }>());
  const nodes = useRef(new Map<string, ComponentRef<typeof View> | null>());
  const boxRef = useRef<ComponentRef<typeof View>>(null);
  const box = useRef({ h: 0 });
  const keys = useMemo(() => rows.map(rowKey), [rows]);
  const [state, setState] = useState<{ active: string | null; to: number; from: number; h: number }>({ active: null, to: 0, from: 0, h: 0 });
  const lift = useSharedValue(0);
  const dragY = useSharedValue(0);
  const startOffset = useRef(0);
  /** the slot the held row started in, and the one it is over now (a change of slot = one tick of «selection», DS §15.6) */
  const fromSlot = useRef(0);
  const slot = useRef(0);
  const lastT = useRef(0);
  const absY = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latest = useRef({ rows, onDrop, onHold, state, scroll, openKey, locked });
  latest.current = { rows, onDrop, onHold, state, scroll, openKey, locked };

  const place = useCallback((key: string, ty: number) => {
    const { rows: rs } = latest.current;
    const { rest } = withoutBlock(rs, key);
    const me = layouts.current.get(key);
    if (!me) return null;
    const mids = rest.map((r) => {
      const l = layouts.current.get(rowKey(r));
      return l ? l.y + l.h / 2 : Number.POSITIVE_INFINITY;
    });
    const centre = me.y + me.h / 2 + ty;
    return { p: insertionIndex(mids, centre), centre };
  }, []);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const refresh = useCallback(
    (key: string) => {
      const ty = lastT.current + ((latest.current.scroll?.offset() ?? 0) - startOffset.current);
      dragY.value = ty;
      const r = place(key, ty);
      if (r) {
        if (r.p !== slot.current) {
          slot.current = r.p;
          haptics.selection();
        }
        setState((s) => (s.active === key && s.to !== r.p ? { ...s, to: r.p } : s));
      }
    },
    [dragY, place],
  );

  const ctl = useMemo<Ctl>(
    () => ({
      keys,
      active: state.active,
      to: state.to,
      from: state.from,
      h: state.h,
      lift,
      dragY,
      layout: (key, y, h) => void layouts.current.set(key, { y, h }),
      node: (key, n) => void nodes.current.set(key, n),
      canDrag: (key) => !latest.current.locked && !!keys.includes(key),
      begin: (key) => {
        const { rows: rs, scroll: sc, onHold: hold } = latest.current;
        const idx = rs.findIndex((r) => rowKey(r) === key);
        const row = rs[idx];
        const me = layouts.current.get(key);
        if (!row || !me) return;
        startOffset.current = sc?.offset() ?? 0;
        // where each row stands NOW, in the list (the browser tells a layout only when a size changes, not when a row above grew)
        boxRef.current?.measureInWindow((_x: number, cy: number) => {
          nodes.current.forEach((n, k) => n?.measureInWindow((_nx: number, ny: number, _w: number, nh: number) => layouts.current.set(k, { y: ny - cy, h: nh })));
        });
        lastT.current = 0;
        dragY.value = 0;
        lock(true);
        haptics.light();
        lift.value = reduce ? 1 : withTiming(1, { duration: motion.durSlow });
        const { rest, at } = withoutBlock(rs, key);
        // `from`: the slot of the held row among the others
        fromSlot.current = at;
        slot.current = at;
        setState({ active: key, from: at, to: at, h: me.h });
        void rest;
        if (row.type === "section") hold?.(row.section.id);
        // the page follows the held row near the edges of the screen
        timer.current = setInterval(() => {
          const s = latest.current.scroll;
          if (!s) return;
          const top = insets.top + gesture.autoScrollEdge;
          const bottom = winH - gesture.autoScrollEdge;
          const y = absY.current;
          const depth = y < top ? (top - y) / gesture.autoScrollEdge : y > bottom ? (y - bottom) / gesture.autoScrollEdge : 0;
          if (depth <= 0) return;
          const step = Math.max(1, Math.round(Math.min(1, depth) * space[3]));
          s.scrollBy(y < top ? -step : step);
          refresh(key);
        }, 16);
      },
      move: (key, ty, y) => {
        lastT.current = ty;
        absY.current = y;
        refresh(key);
      },
      end: (key, canceled) => {
        stop();
        lock(false);
        const { rows: rs, onDrop: drop, onHold: hold, state: st } = latest.current;
        const ty = lastT.current + ((latest.current.scroll?.offset() ?? 0) - startOffset.current);
        const r = place(key, ty);
        const total = box.current.h;
        const me = layouts.current.get(key);
        const centre = me ? me.y + me.h / 2 + ty : 0;
        const inside = centre > -gesture.autoScrollEdge && centre < total + gesture.autoScrollEdge;
        // let go where it was taken: nothing moved — no «medium», no move, no toast
        const d = !canceled && r && inside && r.p !== fromSlot.current ? resolveDrop(rs, key, r.p) : null;
        setState({ active: null, to: 0, from: 0, h: 0 });
        hold?.(null);
        void st;
        if (d) {
          haptics.medium();
          dragY.value = 0;
          lift.value = reduce ? 0 : withSpring(0, motion.spring);
          drop(d);
        } else {
          dragY.value = reduce ? 0 : withSpring(0, motion.spring);
          lift.value = reduce ? 0 : withSpring(0, motion.spring);
        }
      },
    }),
    [keys, state, lift, dragY, lock, reduce, refresh, place, stop, insets.top, winH],
  );

  // the bar: where the held row will stand
  const rest = state.active ? withoutBlock(rows, state.active).rest : [];
  const barY = (() => {
    if (!state.active) return 0;
    const after = rest[state.to];
    if (after) return layouts.current.get(rowKey(after))?.y ?? 0;
    const last = rest[rest.length - 1];
    const l = last ? layouts.current.get(rowKey(last)) : undefined;
    return l ? l.y + l.h : 0;
  })();

  return (
    <SortCtx.Provider value={ctl}>
      <View ref={boxRef} collapsable={false} onLayout={(e) => (box.current.h = e.nativeEvent.layout.height)} style={{ position: "relative" }}>
        {rows.map((r, i) => (
          <Item key={rowKey(r)} k={rowKey(r)} index={i} dragKind={r.type === "unsectioned" ? null : "x"} open={openKey === rowKey(r)}>
            {renderRow(r, i)}
          </Item>
        ))}
        {state.active ? <View pointerEvents="none" testID="sort-bar" style={{ position: "absolute", left: 0, right: 0, top: barY - component.selectedBorder / 2, height: component.selectedBorder, backgroundColor: c.ink, zIndex: z.lift }} /> : null}
      </View>
    </SortCtx.Provider>
  );
}

function Item({ k, index, dragKind, open, children }: { k: string; index: number; dragKind: "x" | null; open: boolean; children: ReactNode }) {
  const ctl = useContext(SortCtx)!;
  const { c } = useTheme();
  const { t } = useI18n();
  const { wide } = useDevice();
  const reduce = useReducedMotion();
  const mine = ctl.active === k;
  const idx = ctl.keys.indexOf(k);
  // this row's place among the OTHER rows: before the held one's slot — its own index, after it — one less
  const restIndex = ctl.active ? (idx > ctl.from ? idx - 1 : idx) : idx;
  const shift = ctl.active && !mine ? shiftOf(restIndex, ctl.from, ctl.to, ctl.h) : 0;
  const sh = useSharedValue(0);
  useEffect(() => {
    sh.value = reduce ? shift : withTiming(shift, { duration: motion.durBase, easing: Easing.out(Easing.cubic) });
  }, [shift, reduce, sh]);

  const handle = usePanGesture({
    runOnJS: true,
    minDistance: gesture.dragStart,
    onActivate: () => ctl.begin(k),
    onUpdate: (e) => ctl.move(k, e.translationY, e.absoluteY),
    onDeactivate: (e) => ctl.end(k, e.canceled),
  });
  const hold = usePanGesture({
    runOnJS: true,
    minDistance: wide ? gesture.dragStart : undefined,
    activateAfterLongPress: wide ? undefined : gesture.dragHoldMs,
    onActivate: () => ctl.begin(k),
    onUpdate: (e) => ctl.move(k, e.translationY, e.absoluteY),
    onDeactivate: (e) => ctl.end(k, e.canceled),
  });

  const a = useAnimatedStyle(() => {
    const on = mine;
    return {
      transform: [
        { translateY: on ? ctl.dragY.value : sh.value },
        { scale: on ? 1 + (motion.liftScale - 1) * ctl.lift.value : 1 },
        { rotate: on ? `${motion.liftTilt * ctl.lift.value}deg` : "0deg" },
      ],
      zIndex: on ? z.lift : 0,
      shadowOpacity: on ? 0.35 * ctl.lift.value : 0,
      shadowRadius: c.shadow.radius,
      shadowOffset: { width: 0, height: component.dragHandle },
      shadowColor: c.shadow.color,
      borderRadius: radius.inner,
      borderWidth: component.selectedBorder,
      borderColor: on && ctl.lift.value > 0.01 ? c.acc : "transparent",
      backgroundColor: on && ctl.lift.value > 0.01 ? c.bg : "transparent",
    };
  });

  const canDrag = dragKind !== null && ctl.canDrag(k);
  const body = (
    <View style={{ flex: 1 }} testID={`sort-row-${k}`}>
      {children}
    </View>
  );
  return (
    <Animated.View ref={(n: unknown) => ctl.node(k, n as ComponentRef<typeof View> | null)} collapsable={false} onLayout={(e) => ctl.layout(k, e.nativeEvent.layout.y, e.nativeEvent.layout.height)} style={a}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {canDrag && !open ? <GestureDetector gesture={hold}>{body}</GestureDetector> : body}
        {canDrag ? (
          <GestureDetector gesture={handle}>
            <View testID={`sort-handle-${k}`} accessibilityRole="button" accessibilityLabel={t("est.sec.drag")} style={{ width: size.hitMin, minHeight: size.hitMin, alignItems: "center", justifyContent: "center", alignSelf: "stretch" }}>
              <Icon name="menu" s={size.iconMd} color={c.mut} />
            </View>
          </GestureDetector>
        ) : null}
      </View>
    </Animated.View>
  );
}
