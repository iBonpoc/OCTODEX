import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { component, gesture, motion, radius, size, space, z } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { haptics } from "@/ui/haptics";
import { Icon } from "@/ui/primitives";
import { useScreenScroll } from "@/ui/requiredForm";
import { useScrollLock } from "@/ui/surfaces";
import { finePointer, holdConfig } from "@/ui/pointer";
import { canBegin, dragKind, edgeStep, feelOf, insertionIndex, ownsDrag, resolveDrop, rowKey, shiftOf, withoutBlock, type Drop, type DropResult } from "./sortable";
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
  /** 0 → 1 while a row is lifted (scale, tilt, shadow); stays 0 under reduced motion */
  lift: ReturnType<typeof useSharedValue<number>>;
  /** 1 while a row is held (frame, ground): shown also under reduced motion */
  held: ReturnType<typeof useSharedValue<number>>;
  dragY: ReturnType<typeof useSharedValue<number>>;
  /** how far the page has scrolled since the row was taken (the row goes with it) */
  scrolled: ReturnType<typeof useSharedValue<number>>;
  /** counts the drops that moved something */
  snap: number;
  layout: (key: string, y: number, h: number) => void;
  node: (key: string, n: ComponentRef<typeof View> | null) => void;
  begin: (key: string, absY: number) => void;
  move: (key: string, ty: number, absY: number) => void;
  /** `ty` — the last translation the gesture reports with its end (its last update may not have reached JS yet) */
  end: (key: string, canceled: boolean, ty: number) => void;
  canDrag: (key: string) => boolean;
}
const SortCtx = createContext<Ctl | null>(null);

export type { DropResult };

export interface SortableListProps {
  rows: ViewRow[];
  /** the open row: only its handle drags (a hold would fight the text selection) */
  openKey?: string | null;
  /** a signed estimate: nothing drags */
  locked?: boolean;
  /**
   * The place the held row was dropped at. The screen moves the line / section and says what came of it: «moved» (the list is
   * different now: «medium»), «same» (it ended where it was: nothing), «refused» (the module leads it: «warning», its toast).
   */
  onDrop: (drop: Drop) => DropResult;
  /** a section is held: the screen folds it while it is carried (its lines go with it), `null` — let go */
  onHold?: (sectionId: string | null) => void;
  /** before a section is taken (it folds, and an open row inside it would be unmounted): false — the drag does not start */
  beforeBegin?: (row: ViewRow) => boolean;
  renderRow: (row: ViewRow, index: number) => ReactNode;
}

export function SortableList({ rows, openKey, locked, onDrop, onHold, beforeBegin, renderRow }: SortableListProps) {
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
  const held = useSharedValue(0);
  const dragY = useSharedValue(0);
  const scrolled = useSharedValue(0);
  const visible = useRef<{ top: number; bottom: number } | null>(null);
  const startOffset = useRef(0);
  /** the slot the held row started in, and the one it is over now (a change of slot = one tick of «selection», DS §15.6) */
  const fromSlot = useRef(0);
  const slot = useRef(0);
  const lastT = useRef(0);
  /** where the finger is in the window; null until the drag has told (a 0 would read as «at the top edge» and the page would run) */
  const absY = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** the key held now (a ref: two fingers are two handlers, and a state would be one render late) */
  const activeKey = useRef<string | null>(null);
  /** counts the drops that moved something: the rows stand where the new order puts them, at once, no sliding from ±h */
  const [snap, setSnap] = useState(0);
  const [, bump] = useState(0);
  const latest = useRef({ rows, onDrop, onHold, beforeBegin, state, scroll, openKey, locked });
  latest.current = { rows, onDrop, onHold, beforeBegin, state, scroll, openKey, locked };

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
    (key: string, fromTimer = false) => {
      const moved = (latest.current.scroll?.offset() ?? 0) - startOffset.current;
      const ty = lastT.current + moved;
      scrolled.value = moved;
      // the finger moves the row on the UI thread; JS writes it only when the PAGE moved under a still finger (a write per move shook it)
      if (fromTimer) dragY.value = ty;
      const r = place(key, ty);
      if (r) {
        if (r.p !== slot.current) {
          slot.current = r.p;
          haptics.selection();
        }
        setState((s) => (s.active === key && s.to !== r.p ? { ...s, to: r.p } : s));
      }
    },
    [dragY, scrolled, place],
  );

  /** where each row stands NOW, in the list (the browser tells a layout only when a size changes, not when a row above grew) */
  const measureAll = useCallback((withHeld = false) => {
    boxRef.current?.measureInWindow((_x: number, cy: number) => {
      // the first measure (at the start) takes every row, the held one too — its place may be stale after a drop (the browser tells a
      // layout only when a size changes). A later measure leaves the held row out: it is lifted (scaled, tilted) by then.
      const pending = [...nodes.current.entries()].filter(([k]) => withHeld || k !== activeKey.current);
      let left = pending.length;
      if (!left) return;
      pending.forEach(([k, n]) =>
        n?.measureInWindow((_nx: number, ny: number, _w: number, nh: number) => {
          layouts.current.set(k, { y: ny - cy, h: nh });
          // the bar is drawn from these: draw it again with the new numbers
          if (--left === 0) bump((v) => v + 1);
        }),
      );
    });
  }, []);

  const ctl = useMemo<Ctl>(
    () => ({
      keys,
      active: state.active,
      to: state.to,
      from: state.from,
      h: state.h,
      lift,
      held,
      dragY,
      scrolled,
      snap,
      layout: (key, y, h) => void layouts.current.set(key, { y, h }),
      node: (key, n) => void nodes.current.set(key, n),
      canDrag: (key) => !latest.current.locked && !!keys.includes(key),
      begin: (key, y) => {
        // one drag at a time: a second finger on another row (a handle and a body are two handlers) starts nothing
        if (!canBegin(activeKey.current)) return;
        const { rows: rs, scroll: sc, onHold: hold, beforeBegin: before } = latest.current;
        const idx = rs.findIndex((r) => rowKey(r) === key);
        const row = rs[idx];
        const me = layouts.current.get(key);
        if (!row || !me) return;
        // a section folds when taken: an open row inside it must close first (a wrong one speaks and the drag does not start)
        if (before && !before(row)) return;
        activeKey.current = key;
        startOffset.current = sc?.offset() ?? 0;
        // the finger's place is known from the first moment (before, the page ran up from a 0 and the row with it)
        absY.current = y;
        visible.current = null;
        sc?.measureVisible((v) => (visible.current = v));
        measureAll(true);
        lastT.current = 0;
        dragY.value = 0;
        scrolled.value = 0;
        lock(true);
        haptics.light();
        held.value = 1;
        // reduced motion: no lift (the frame and the ground still show which row is held)
        lift.value = reduce ? 0 : withTiming(1, { duration: motion.durSlow });
        const { at } = withoutBlock(rs, key);
        // `from`: the slot of the held row among the others
        fromSlot.current = at;
        slot.current = at;
        setState({ active: key, from: at, to: at, h: me.h });
        if (row.type === "section") {
          hold?.(row.section.id);
          // the section folds: the rows below it have moved — measure them again once the fold is drawn
          requestAnimationFrame(() => requestAnimationFrame(() => measureAll()));
        }
        // the page follows the held row near the edges of what can be seen (below the header, above the bottom bar)
        timer.current = setInterval(() => {
          const s = latest.current.scroll;
          if (!s) return;
          const v = visible.current ?? { top: insets.top, bottom: winH - insets.bottom };
          const step = edgeStep(absY.current, v.top, v.bottom, gesture.autoScrollEdge, space[3]);
          if (!step) return;
          s.scrollBy(step);
          refresh(key, true);
        }, 16);
      },
      move: (key, ty, y) => {
        if (!ownsDrag(activeKey.current, key)) return;
        lastT.current = ty;
        absY.current = y;
        refresh(key);
      },
      end: (key, canceled, endTy) => {
        // only the held row's own finger ends the drag (the other finger's end took its place, its lastT and its lock)
        if (!ownsDrag(activeKey.current, key)) return;
        activeKey.current = null;
        lastT.current = endTy;
        stop();
        lock(false);
        const { rows: rs, onDrop: drop, onHold: hold } = latest.current;
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
        held.value = 0;
        absY.current = null;
        // what the drop CAME TO decides the feel, and it is known before the buzz: moved — «medium»; ended where it was — nothing;
        // refused — «warning» (never «medium» for a move that did not happen)
        const res: DropResult = d ? drop(d) : "same";
        const feel = feelOf(res);
        if (feel) haptics[feel]();
        // moved: the row's offset stays until the new order is drawn (zeroing it first showed the row at its old place for a frame)
        if (res === "moved") setSnap((n) => n + 1);
        else dragY.value = reduce ? 0 : withSpring(0, motion.spring);
        lift.value = reduce ? 0 : withSpring(0, motion.spring);
      },
    }),
    [keys, state, snap, lift, held, dragY, scrolled, lock, reduce, refresh, place, stop, measureAll, insets.top, insets.bottom, winH],
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
          <Item key={rowKey(r)} k={rowKey(r)} index={i} dragKind={dragKind(r) ? "x" : null} open={openKey === rowKey(r)}>
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
  const reduce = useReducedMotion();
  const mine = ctl.active === k;
  const idx = ctl.keys.indexOf(k);
  // this row's place among the OTHER rows: before the held one's slot — its own index, after it — one less
  const restIndex = ctl.active ? (idx > ctl.from ? idx - 1 : idx) : idx;
  const shift = ctl.active && !mine ? shiftOf(restIndex, ctl.from, ctl.to, ctl.h) : 0;
  const sh = useSharedValue(0);
  const lastSnap = useRef(ctl.snap);
  useEffect(() => {
    // a drop that moved something: the new order is drawn at once — the rows were ±h to make room, now they stand in their places
    if (lastSnap.current !== ctl.snap) {
      lastSnap.current = ctl.snap;
      sh.value = shift;
      return;
    }
    sh.value = reduce ? shift : withTiming(shift, { duration: motion.durBase, easing: Easing.out(Easing.cubic) });
  }, [shift, reduce, sh, ctl.snap]);

  // the movement is on the UI thread (no bridge per frame): the row follows the finger and the page's scroll; the JS side is told
  // only to find the place (`move`). One finger: a second one cancels the drag.
  const { dragY, scrolled, held, lift } = ctl;
  const begin = ctl.begin;
  const move = ctl.move;
  const end = ctl.end;
  const handle = usePanGesture({
    minDistance: gesture.dragStart,
    maxPointers: 1,
    onActivate: (e) => {
      "worklet";
      runOnJS(begin)(k, e.absoluteY);
    },
    onUpdate: (e) => {
      "worklet";
      dragY.value = e.translationY + scrolled.value;
      runOnJS(move)(k, e.translationY, e.absoluteY);
    },
    onDeactivate: (e) => {
      "worklet";
      runOnJS(end)(k, e.canceled, e.translationY);
    },
  });
  // the body of a row: a mouse / pen starts after a move of `dragStart`, a finger only after a hold (else the page's scroll is lost)
  const cfg = useMemo(() => holdConfig(finePointer()), []);
  const hold = usePanGesture({
    minDistance: cfg.minDistance,
    activateAfterLongPress: cfg.activateAfterLongPress,
    maxPointers: 1,
    onActivate: (e) => {
      "worklet";
      runOnJS(begin)(k, e.absoluteY);
    },
    onUpdate: (e) => {
      "worklet";
      dragY.value = e.translationY + scrolled.value;
      runOnJS(move)(k, e.translationY, e.absoluteY);
    },
    onDeactivate: (e) => {
      "worklet";
      runOnJS(end)(k, e.canceled, e.translationY);
    },
  });

  const a = useAnimatedStyle(() => {
    const on = mine;
    return {
      transform: [
        { translateY: on ? dragY.value : sh.value },
        { scale: on ? 1 + (motion.liftScale - 1) * lift.value : 1 },
        { rotate: on ? `${motion.liftTilt * lift.value}deg` : "0deg" },
      ],
      zIndex: on ? z.lift : 0,
      shadowOpacity: on ? 0.35 * lift.value : 0,
      shadowRadius: c.shadow.radius,
      shadowOffset: { width: 0, height: component.dragHandle },
      shadowColor: c.shadow.color,
      borderRadius: radius.inner,
      borderWidth: component.selectedBorder,
      borderColor: on && held.value > 0.5 ? c.acc : "transparent",
      backgroundColor: on && held.value > 0.5 ? c.bg : "transparent",
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
