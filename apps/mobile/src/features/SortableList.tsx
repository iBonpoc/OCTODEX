import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { Easing, ReduceMotion, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { component, gesture, motion, radius, size, space, z } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { haptics } from "@/ui/haptics";
import { Icon } from "@/ui/primitives";
import { useScreenScroll } from "@/ui/requiredForm";
import { useScrollLock } from "@/ui/surfaces";
import { finePointer, holdConfig } from "@/ui/pointer";
import { canBegin, crossesSection, dragKind, dragWrite, edgeStep, feelOf, heldGone, ownsDrag, placeWithMargin, resolveDrop, rowKey, shiftOf, withoutBlock, type Drop, type DropResult } from "./sortable";
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
  /** the key of the held row for the UI thread ("" — none): only its own finger writes the row's place */
  activeSV: ReturnType<typeof useSharedValue<string>>;
  dragY: ReturnType<typeof useSharedValue<number>>;
  /** how far the page has scrolled since the row was taken (the row goes with it) */
  scrolled: ReturnType<typeof useSharedValue<number>>;
  /** counts the drops that moved something */
  snap: number;
  /** the row that has just landed in a new place: it flashes (`durSlow`, DS §14.6) */
  flash: string | null;
  layout: (key: string, y: number, h: number) => void;
  node: (key: string, n: ComponentRef<typeof View> | null) => void;
  begin: (key: string, absY: number) => void;
  move: (key: string, ty: number, absY: number) => void;
  /** `ty` — the last translation the gesture reports with its end (its last update may not have reached JS yet) */
  end: (key: string, canceled: boolean, ty: number) => void;
  canDrag: (key: string) => boolean;
}
const SortCtx = createContext<Ctl | null>(null);

/**
 * The handle «≡» of the OPEN line stands in its header (DS §8.3: «˄ Свернуть» … корзина, «⋯», «≡»), not in a column beside the
 * row — the row's fields take the whole width. The handle itself stays where it always is in the tree (the list draws it over the
 * header's right end): taken by it, the open row folds, and a handle that moved in the tree would lose the finger (code review of «б»).
 * `true` — the line keeps the place for it at the right end of its header.
 */
const HandleCtx = createContext(false);
export const useRowHandle = (): boolean => useContext(HandleCtx);

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
  /**
   * any row is lifted (its key) / let go (`null`): the screen folds THE WHOLE LIST into short rows while it is carried (DS §14.6,
   * decision 13.11) — the list keeps the held row under the finger and scrolls its place there
   */
  onLift?: (key: string | null) => void;
  /** before a section is taken (it folds, and an open row inside it would be unmounted): false — the drag does not start */
  beforeBegin?: (row: ViewRow) => boolean;
  renderRow: (row: ViewRow, index: number) => ReactNode;
}

export function SortableList({ rows, openKey, locked, onDrop, onHold, onLift, beforeBegin, renderRow }: SortableListProps) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const lock = useScrollLock();
  const scroll = useScreenScroll();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const layouts = useRef(new Map<string, { y: number; h: number }>());
  const nodes = useRef(new Map<string, ComponentRef<typeof View> | null>());
  const boxRef = useRef<ComponentRef<typeof View>>(null);
  const box = useRef({ h: 0, y: 0 });
  const keys = useMemo(() => rows.map(rowKey), [rows]);
  const [state, setState] = useState<{ active: string | null; to: number; from: number; h: number }>({ active: null, to: 0, from: 0, h: 0 });
  const lift = useSharedValue(0);
  const held = useSharedValue(0);
  const activeSV = useSharedValue("");
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
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);
  const [, bump] = useState(0);
  /** the list folded when the row was lifted: how far the held row's top moved up (the row is kept under the finger by it) */
  const foldShift = useRef(0);
  /** the held row before the fold: its top and height in the list, and where on it the finger took it (0 — its top, 1 — its bottom) */
  const liftTop = useRef(0);
  const liftH = useRef(0);
  const liftAt = useRef(0.5);
  const foldGap = useRef(0);
  /** how far the edge zone has scrolled the page since the row was taken (the finger's scroll; any other is the fold's) */
  const edgeScrolled = useRef(0);
  const latest = useRef({ rows, onDrop, onHold, onLift, beforeBegin, state, scroll, openKey, locked });
  latest.current = { rows, onDrop, onHold, onLift, beforeBegin, state, scroll, openKey, locked };

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
    // the place changes only past a margin (`gesture.slotHysteresis`): no flicker between two places under a resting finger
    return { p: placeWithMargin(mids, centre, slot.current, gesture.slotHysteresis), centre };
  }, []);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const refresh = useCallback(
    (key: string, fromTimer = false) => {
      const moved = (latest.current.scroll?.offset() ?? 0) - startOffset.current + foldShift.current;
      const ty = lastT.current + moved;
      scrolled.value = moved;
      // the finger moves the row on the UI thread; JS writes it only when the PAGE moved under a still finger (a write per move shook it)
      if (fromTimer) dragY.value = ty;
      // until the folded list is measured the rows' places are the old ones: no place, no bar move, no buzz from them
      if (settled.current !== key) return;
      const r = place(key, ty);
      if (r) {
        if (r.p !== slot.current) {
          // «selection» only when the place crosses into another section (#1312), not on every place
          if (crossesSection(latest.current.rows, key, slot.current, r.p)) haptics.selection();
          slot.current = r.p;
        }
        setState((s) => (s.active === key && s.to !== r.p ? { ...s, to: r.p } : s));
      }
    },
    [dragY, scrolled, place],
  );

  /** where each row stands NOW, in the list (the browser tells a layout only when a size changes, not when a row above grew) */
  const measureAll = useCallback((withHeld = false, done?: () => void) => {
    boxRef.current?.measureInWindow((_x: number, cy: number, _bw: number, bh: number) => {
      box.current.h = bh;
      box.current.y = cy;
      // the first measure (at the start) takes every row, the held one too — its place may be stale after a drop (the browser tells a
      // layout only when a size changes). A later measure leaves the held row out: it is lifted (scaled, tilted) by then.
      // (a row that is gone has no node: it would never answer, and `done` would never come)
      const pending = [...nodes.current.entries()].filter(([k, n]) => !!n && (withHeld || k !== activeKey.current));
      let left = pending.length;
      if (!left) return void done?.();
      const one = () => {
        // the bar is drawn from these: draw it again with the new numbers
        if (--left === 0) {
          bump((v) => v + 1);
          done?.();
        }
      };
      const boxNode = boxRef.current;
      pending.forEach(([k, n]) => {
        // the row's place IN THE LIST in one read (the list and the row together): two reads in the window, a frame apart, gave
        // nonsense while the page was scrolling (a row 388 px off, #1307 «б»)
        if (n && boxNode) {
          n.measureLayout(
            boxNode as never,
            (_x: number, y: number, _w: number, h: number) => {
              layouts.current.set(k, { y, h });
              one();
            },
            () => one(),
          );
        } else one();
      });
    });
  }, []);

  /** the drag ends by itself: the held row is gone (its adding was undone, another option opened) or the list goes — the page must scroll again */
  const abort = useCallback(() => {
    if (activeKey.current === null) return;
    activeKey.current = null;
    activeSV.value = "";
    stop();
    lock(false);
    held.value = 0;
    lift.value = 0;
    dragY.value = 0;
    foldShift.current = 0;
    settled.current = null;
    pendingFold.current = null;
    setFolded(null);
    setState({ active: null, to: 0, from: 0, h: 0 });
    latest.current.onHold?.(null);
    latest.current.onLift?.(null);
  }, [activeSV, stop, lock, held, lift, dragY]);

  /**
   * The list has folded under the lifted row (DS §14.6): the row stays where the finger holds it (its top moved by `shift`, the drag
   * offset takes it back), and the page scrolls by the same amount so the row's PLACE in the folded list is under the finger too.
   */
  const afterFold = useCallback((key: string) => {
    if (activeKey.current !== key) return;
    const ks = latest.current.rows.map(rowKey);
    const i = ks.indexOf(key);
    const prev = i > 0 ? layouts.current.get(ks[i - 1]!) : undefined;
    const next = i >= 0 && i < ks.length - 1 ? layouts.current.get(ks[i + 1]!) : undefined;
    if (i < 0) return;
    // the held row is lifted (scaled): its own size is read from its neighbours, which stand still
    const top = prev ? prev.y + prev.h : 0;
    const h = Math.max(0, (next ? next.y : box.current.h) - top);
    // the finger keeps the same point of the row (its handle is in the row's middle, a folded row is shorter)
    const shift = liftTop.current + liftAt.current * liftH.current - (top + liftAt.current * h);
    layouts.current.set(key, { y: top, h });
    setState((s) => (s.active === key ? { ...s, h } : s));
    // the page scrolls so the row's place comes under the finger — as far as it CAN (at the top, or a page that got shorter than the
    // screen, it cannot; `scrollBy` reads where the page really stopped). The row is kept under the finger only by what the page
    // really scrolled; the rest puts it on its own place in the folded list (else it hung past the list's end, cut off by the card,
    // or covered a neighbour — design review of #1307 «б»)
    const sc = latest.current.scroll;
    if (shift) sc?.scrollBy(-shift);
    // how far the page went up for the fold: all it moved since the row was taken but what the edge zone scrolled (that one is the
    // finger's). The browser itself trims the scroll when the page gets shorter — that is the fold's too.
    const now = sc?.offsetNow?.() ?? sc?.offset() ?? 0;
    const scrolledBy = startOffset.current - now + edgeScrolled.current;
    // the row stands on its own place moved by the finger (the page's scroll is taken back): under the finger where the page
    // scrolled the place there, else off it by the rest — `foldGap`: the edges and the landing go by the ROW
    foldShift.current = scrolledBy;
    foldGap.current = shift - scrolledBy;
    dragY.value = lastT.current;
    settled.current = key;
    refresh(key, true);
    // the folded list is drawn and the page has stood: a mark for the tests
    requestAnimationFrame(() => setFolded((f) => (activeKey.current === key ? key : f)));
  }, [refresh, dragY]);
  useEffect(() => {
    if (heldGone(activeKey.current, keys)) abort();
  }, [keys, abort]);
  // the screen has drawn the folded list (new rows): now every row stands where it will stay while the row is carried
  const pendingFold = useRef<string | null>(null);
  /** the row let go, where the finger was in the window and its point on the row: once the list unfolds, the row stays under it */
  const pendingLand = useRef<{ key: string; y: number; at: number } | null>(null);
  /** the held row whose folded list is measured: only then its place is looked for */
  const settled = useRef<string | null>(null);
  /** the held row whose list has folded and settled (a mark for the tests: `sort-folded`) */
  const [folded, setFolded] = useState<string | null>(null);
  // before the folded list is painted (a phone measures at once): the held row is put back under the finger in the same frame
  useLayoutEffect(() => {
    const land = pendingLand.current;
    if (land) {
      pendingLand.current = null;
      // two frames: the unfolded list is drawn and laid out
      requestAnimationFrame(() => requestAnimationFrame(() => nodes.current.get(land.key)?.measureInWindow((_x: number, y: number, _w: number, h: number) => {
        const dy = y + land.at * h - land.y;
        if (Math.abs(dy) > 1) latest.current.scroll?.scrollBy(dy);
      })));
    }
    const k = pendingFold.current;
    if (!k || activeKey.current !== k) return;
    pendingFold.current = null;
    measureAll(false, () => afterFold(k));
  }, [rows, measureAll, afterFold]);
  const abortRef = useRef(abort);
  abortRef.current = abort;
  useEffect(() => () => abortRef.current(), []);

  const ctl = useMemo<Ctl>(
    () => ({
      keys,
      active: state.active,
      to: state.to,
      from: state.from,
      h: state.h,
      lift,
      held,
      activeSV,
      dragY,
      scrolled,
      snap,
      flash,
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
        activeKey.current = key;
        activeSV.value = key;
        // where the page REALLY is (a scroll the browser made a moment ago may not have told the app yet: a stale start put the row
        // 388 px off the finger, #1307 «б»)
        startOffset.current = sc?.offsetNow?.() ?? sc?.offset() ?? 0;
        // the finger's place is known from the first moment (before, the page ran up from a 0 and the row with it)
        absY.current = y;
        visible.current = null;
        sc?.measureVisible((v) => (visible.current = v));
        lastT.current = 0;
        dragY.value = 0;
        scrolled.value = 0;
        foldShift.current = 0;
        foldGap.current = 0;
        edgeScrolled.current = 0;
        settled.current = null;
        pendingFold.current = null;
        setFolded(null);
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
        // the page follows the held row near the edges of what can be seen (below the header, above the bottom bar)
        timer.current = setInterval(() => {
          const s = latest.current.scroll;
          if (!s) return;
          const v = visible.current ?? { top: insets.top, bottom: winH - insets.bottom };
          // the HELD ROW near the edges, not the finger: where the list's end kept the row off the finger (`foldGap`), the finger
          // may be near an edge while the row is not — the page must not run then
          const at = absY.current === null ? null : absY.current - foldGap.current;
          const step = edgeStep(at, v.top, v.bottom, gesture.autoScrollEdge, gesture.autoScrollMax);
          if (!step) return;
          const was = s.offsetNow?.() ?? s.offset();
          s.scrollBy(step);
          edgeScrolled.current += (s.offsetNow?.() ?? s.offset()) - was;
          refresh(key, true);
        }, 16);
        // where every row stands now (the held one too), THEN the list folds: the held row's top before the fold is known exactly.
        // Everything above is set up FIRST: on a phone (Fabric) the measure answers at once, inside this call (code review of «б»).
        liftTop.current = me.y;
        measureAll(true, () => {
          if (activeKey.current !== key) return;
          const was = layouts.current.get(key) ?? me;
          liftTop.current = was.y;
          liftH.current = was.h;
          liftAt.current = was.h > 0 ? Math.max(0, Math.min(1, (y - box.current.y - was.y) / was.h)) : 0.5;
          // the open row closes first (a wrong one stays — the drag does not start), then the list folds; a section folds itself too
          if (before && !before(row)) return void abortRef.current();
          pendingFold.current = key;
          if (row.type === "section") hold?.(row.section.id);
          latest.current.onLift?.(key);
          // nothing folds (a list without `onLift`, a line): the rows stand as they are — measured already
          if (!latest.current.onLift && row.type !== "section") {
            pendingFold.current = null;
            afterFold(key);
            return;
          }
          // the same row taken again at once: the screen's «lifted» went key → null → key in one batch and the rows did not change —
          // no new rows will come; two frames on, measure anyway (else the place was never looked for)
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (pendingFold.current !== key || activeKey.current !== key) return;
            pendingFold.current = null;
            measureAll(false, () => afterFold(key));
          }));
        });
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
        activeSV.value = "";
        lastT.current = endTy;
        stop();
        lock(false);
        const { rows: rs, onDrop: drop, onHold: hold } = latest.current;
        const ty = lastT.current + ((latest.current.scroll?.offset() ?? 0) - startOffset.current) + foldShift.current;
        const r = place(key, ty);
        const total = box.current.h;
        const me = layouts.current.get(key);
        const centre = me ? me.y + me.h / 2 + ty : 0;
        const inside = centre > -gesture.autoScrollEdge && centre < total + gesture.autoScrollEdge;
        // let go where it was taken: nothing moved — no «medium», no move, no toast
        // (let go before the folded list was measured: its place is not known — nothing moves)
        const d = !canceled && settled.current === key && r && inside && r.p !== fromSlot.current ? resolveDrop(rs, key, r.p) : null;
        // where the finger let the row go: the row stays under it when the list unfolds (DS §14.6 «Приземление»)
        const landAt = absY.current;
        settled.current = null;
        pendingFold.current = null;
        setFolded(null);
        setState({ active: null, to: 0, from: 0, h: 0 });
        hold?.(null);
        latest.current.onLift?.(null);
        foldShift.current = 0;
        held.value = 0;
        absY.current = null;
        // what the drop CAME TO decides the feel, and it is known before the buzz: moved — «medium»; ended where it was — nothing;
        // refused — «warning» (never «medium» for a move that did not happen)
        const res: DropResult = d ? drop(d) : "same";
        if (res === "moved" && landAt !== null) pendingLand.current = { key, y: landAt - foldGap.current, at: liftAt.current };
        foldGap.current = 0;
        const feel = feelOf(res);
        if (feel) haptics[feel]();
        // moved: the row's offset stays until the new order is drawn (zeroing it first showed the row at its old place for a frame)
        if (res === "moved") {
          setSnap((n) => n + 1);
          // the row landed: it flashes where it stands now, under the finger (a frame that fades — no movement, so also under
          // reduced motion, as the frame of the held row stays there, DS §14.6)
          setFlash(key);
          if (flashTimer.current) clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setFlash((f) => (f === key ? null : f)), motion.durSlow);
        } else dragY.value = reduce ? 0 : withSpring(0, motion.spring);
        lift.value = reduce ? 0 : withSpring(0, motion.spring);
      },
    }),
    [keys, state, snap, flash, lift, held, activeSV, dragY, scrolled, lock, reduce, refresh, place, stop, measureAll, afterFold, insets.top, insets.bottom, winH],
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
        {state.active && folded === state.active ? <View pointerEvents="none" testID="sort-folded" style={{ position: "absolute", width: 0, height: 0 }} /> : null}
        {state.active && state.to !== state.from ? <View pointerEvents="none" testID="sort-bar" style={{ position: "absolute", left: 0, right: 0, top: barY - component.selectedBorder / 2, height: component.selectedBorder, backgroundColor: c.ink, zIndex: z.lift }} /> : null}
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
  const { dragY, scrolled, held, lift, activeSV } = ctl;
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
      const w = dragWrite(activeSV.value, k, e.translationY, scrolled.value);
      if (w === null) return;
      dragY.value = w;
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
      const w = dragWrite(activeSV.value, k, e.translationY, scrolled.value);
      if (w === null) return;
      dragY.value = w;
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
      shadowOpacity: on ? component.liftShadow * lift.value : 0,
      shadowRadius: c.shadow.radius,
      shadowOffset: { width: 0, height: component.dragHandle },
      shadowColor: c.shadow.color,
      borderRadius: radius.inner,
      borderWidth: component.selectedBorder,
      borderColor: on && held.value > 0.5 ? c.acc : "transparent",
      backgroundColor: on && held.value > 0.5 ? c.bg : "transparent",
    };
  });

  // the landed row flashes: a frame `acc` that fades out over `durSlow`
  const fl = useSharedValue(0);
  const flashing = ctl.flash === k;
  useEffect(() => {
    if (!flashing) return;
    fl.value = 1;
    // a fade is not a movement: it plays under «уменьшить движение» too (DS §14.6) — the system setting must not skip it
    fl.value = withTiming(0, { duration: motion.durSlow, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never });
  }, [flashing, fl]);
  const flashStyle = useAnimatedStyle(() => ({ opacity: fl.value }));

  const canDrag = dragKind !== null && ctl.canDrag(k);
  // an open LINE draws its handle in its own header; any other row has it in a column on the right
  const inHeader = open && k.startsWith("l:");
  const handleEl = canDrag ? (
    <GestureDetector gesture={handle}>
      <View
        testID={`sort-handle-${k}`}
        accessibilityRole="button"
        accessibilityLabel={t("est.sec.drag")}
        // in the open line's header: over its right end, centred on its buttons (the row's top padding `space[3]`, `dockBtn` high)
        style={inHeader ? { position: "absolute", right: 0, top: space[3] + (component.dockBtn - size.hitMin) / 2, width: size.hitMin, height: size.hitMin, alignItems: "center", justifyContent: "center" } : { width: size.hitMin, minHeight: size.hitMin, alignItems: "center", justifyContent: "center", alignSelf: "stretch" }}
      >
        <Icon name="menu" s={size.iconMd} color={c.mut} />
      </View>
    </GestureDetector>
  ) : null;
  const body = (
    <View style={{ flex: 1 }} testID={`sort-row-${k}`}>
      <HandleCtx.Provider value={inHeader && canDrag}>{children}</HandleCtx.Provider>
    </View>
  );
  return (
    <Animated.View ref={(n: unknown) => ctl.node(k, n as ComponentRef<typeof View> | null)} collapsable={false} onLayout={(e) => ctl.layout(k, e.nativeEvent.layout.y, e.nativeEvent.layout.height)} style={a}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {canDrag && !open ? <GestureDetector gesture={hold}>{body}</GestureDetector> : body}
        {handleEl}
      </View>
      {flashing ? <Animated.View pointerEvents="none" testID={`sort-flash-${k}`} style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: radius.inner, borderWidth: component.selectedBorder, borderColor: c.acc }, flashStyle]} /> : null}
    </Animated.View>
  );
}
