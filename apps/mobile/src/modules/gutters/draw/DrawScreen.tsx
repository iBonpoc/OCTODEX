/**
 * «Замер» — the measuring canvas (docs/specs/33-gutters-module.md §7; docs/specs/33-gutters-canvas.md П20.4 M4b).
 * The whole screen is the drawing. One finger draws a run along the roof edge (it sticks to other runs' ends and to
 * 45° steps — from an end it continues the gutter), puts a downspout on a run, or («Выбрать») picks and drags an end;
 * two fingers move and zoom. The toolbar (36 visible,
 * 44 to touch — rule 3) sits at the bottom, under the right hand or under the left; the $ is always at the bottom —
 * a preview from the engine: the company's price list where it has the part (M7d), else TEST rates (rule 9); the estimate is M8. Storeys by colour + «эт N» (founder О3).
 * Saved 1 s after a gesture ends through the core's queue (module.op, spec 33 П21 M5a; tables П19), offline too;
 * `?m=<id>` opens a measurement, none — a new one; a module that is off or past its
 * trial draws but saves nothing, and says so before the work starts (§6, founder О2). Delete → «Отменить» 5 s (rule 5).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { useWindowDimensions, View } from "react-native";
import { router, Stack, useLocalSearchParams, type Href } from "expo-router";
import * as Crypto from "expo-crypto";
import Svg, { Line } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "react-native-reanimated";
import { GestureDetector, usePanGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import { computeGutterParts } from "@octo/estimating-engine";
import { breakpoint, component, drawing as dt, motion, radius, size as sizes, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { moduleHref, moduleState } from "@/modules/registry";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { Button, ChoiceChips, IconButton, StatusChip, Toggle } from "@/ui/controls";
import { Icon, Press, T, type IconKey } from "@/ui/primitives";
import { Menu, Sheet, useToast } from "@/ui/overlays";
import { ListRow, RowView } from "@/ui/surfaces";
import { useHideTabBar } from "@/nav/tabBarHide";
import { CanvasView, useCanvasGestures, useLive } from "../canvas/CanvasView";
import { autoDownspouts, autoManaged, commitAuto } from "../canvas/autoDs";
import { type Lift, liftTarget, addDownspout, cornerTick, drawSnap, drawTick, pullTick, withoutDs, alongAxis, endAt, finishStroke, flipFace, moveDs, cornerMovable, grabbedCorner, grabbedEnd, HELD_ORIGINAL, moveCorner, sameDirection, swingEnd, splitCorner, setCornerAngle, setCornerSplash, hitTest, onCornerPoint, lineRefused, moveEnd, pushHistory, redo, removeElement, restoreRemoved, setCornerMethod, setDsAttrs, setLength, setRunAttrs, setStory, startAt, undo, type History, type Stroke } from "../canvas/edit";
import { holdBegin, holdCancel, holdFire, holdMove, holdIsTap, type Hold } from "../canvas/holdLift";
import { dsKindOf, PROFILE_ICON, type DsAttrs, type RunAttrs } from "../canvas/attrs";
import type { GutterProfile } from "@octo/estimating-engine";
import { CornerSketch, CornerTriangle } from "./CornerSketch";
import { ghostChipAt } from "./ghostChip";
import { haptics } from "@/ui/haptics";
import { SAVE_ICON, saveMark } from "./saveMark";
import { InputWindow } from "./InputWindow";
import { AttrBody, DsAttrsView, QuickLength, RunAttrsView, type RunCorner } from "./AttrPanel";
import { MeasurePhotos } from "./Photos";
import { fmtLen } from "../canvas/format";
import { dropHaptic, forgetOldDraft, loadToolbarPlace, placeAt, saveToolbarPlace, TOOLBAR_PLACES, type ToolbarPlace } from "../canvas/localStore";
import { makeModuleStore } from "../canvas/moduleStore";
import { gutterData, measurementOf, photosOf, relink, removeMeasurement } from "../data";
import { makeSaver } from "../canvas/draftStore";
import { onAppLeave } from "@/data/appActive";
import { LinkSheet } from "./LinkSheet";
import { summaryOf } from "./summary";
import { fromElements, toElements, type MeasurementRow } from "../canvas/model";
import { choicesFor, newDsAttrs, newRunAttrs, readRules, toRulesOverride } from "../settings";
import { buildScene, fitView, storyOf, toPlan, toScreen, zoomLimits, type Scene, type Story, type View as PlanView } from "../canvas/scene";
import { DS_MARK_R, LABEL_FONT, SvgPainter } from "../canvas/SvgPainter";
import { listPreview, partName } from "../prices";
import { clientLangOf, estimateAction, estimateOfMeasurement, makeEstimate, signedOn } from "../estimateLink";
import { tFor } from "@/i18n/translate";
import { cornerChoiceOf, cornerCut, findCorners, splashOff, runEnds, runLengthIn, toMeasurement, withoutDuplicates, type CornerChoice, type Drawing, type FoundCorner, type P } from "../geometry";
import { localUndo, type GuardedUndo } from "@/data/undo";

type Tool = "line" | "ds";
/** a finger's reach on the glass, whatever the zoom: half the 44 pt touch target */
const FINGER = sizes.hitMin / 2;
/** the width of a magnet's window across a ray, in the finger's pixels (a quarter of a hit target; plan inches = px ÷ scale, #818) */
const SNAP_PX = sizes.hitMin / 4;
/** a tap this soon after a two-finger gesture began or ended is not a tap */
const MULTI_TAP_MS = motion.durSlow * 2;
const SAVE_AFTER_MS = 1000;
const EMPTY: Drawing = { runs: [], downspouts: [] };

/** one cell of the canvas toolbar (spec 33 П20.8; #1274, founder 12.11: «без длинных надписей, значки»): a 36 circle (44 to touch, rule 3), ONLY the picture —
 *  its word is read aloud (`accessibilityLabel`), shown on the web by `title`, and written over it on a long press (`ToolHint`, a bubble for a moment).
 *  `body` replaces the icon (the storey: «Эт N» in its colour) */
function ToolCell({ icon, body, label, a11y, active, onPress, ring, grow, disabled, below }: { icon?: IconKey; body?: string; label: string; a11y?: string; active?: boolean; onPress: () => void; ring?: string; grow?: boolean; /** nothing to act on (the bin without a pick): dimmed, no press */ disabled?: boolean; /** the toolbar is at the top: the caption goes under it */ below?: boolean }) {
  const { c } = useTheme();
  const s = component.dockBtn;
  const [tip, setTip] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const showTip = () => {
    setTip(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTip(false), motion.longPressMs * 3);
  };
  return (
    <Press
      onPress={onPress}
      onLongPress={showTip}
      delayLongPress={motion.longPressMs}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      disabled={disabled}
      {...({ title: label } as object)}
      containerStyle={grow ? { flex: 1 } : undefined}
      style={{ alignItems: "center", minWidth: sizes.hitMin, opacity: disabled ? component.dimOpacity : 1 }}
    >
      <View style={{ minWidth: s, height: s, paddingHorizontal: body ? space[2] : 0, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: active ? c.acc : c.surf2, borderWidth: ring ? dt.runW / 2 : active ? 0 : 1, borderColor: ring ?? c.bd }}>
        {body ? <T v="caption" center w="semibold">{body}</T> : icon ? <Icon name={icon} s={sizes.iconMd} color={active ? c.onAcc : c.ink} /> : null}
      </View>
      {tip ? (
        <View pointerEvents="none" style={{ position: "absolute", [below ? "top" : "bottom"]: s + space[1], alignSelf: "center", paddingVertical: space[1], paddingHorizontal: space[2], borderRadius: radius.chip, backgroundColor: c.ov, borderWidth: component.hairline, borderColor: c.bd }}>
          <T v="caption" w="semibold">{label}</T>
        </View>
      ) : null}
    </Press>
  );
}

/** a downspout size for the bar: «3×4», a round one «3″» */
const dsSizeText = (s: string) => (s.includes("x") ? s.replace("x", "×") : `${s}″`);

const NO_VIEW: PlanView = { k: 1, ox: 0, oy: 0 };

/** the chip with the angle beside a swung end: the same look and place as the live length of a new gutter */
function SwingChip({ swing, view, box, gap }: { swing: { a: P; b: P; deg: number }; view: PlanView; box: { w: number; h: number; top: number }; gap: number }) {
  const [chip, setChip] = useState({ w: 0, h: 0 });
  const a = toScreen(view, swing.a), b = toScreen(view, swing.b);
  return (
    <View
      pointerEvents="none"
      testID="draw-swing-chip"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== chip.w || height !== chip.h) setChip({ w: width, h: height });
      }}
      style={{ position: "absolute", opacity: chip.w ? 1 : 0, ...ghostChipAt(a, b, chip, box, gap) }}
    >
      <StatusChip status="neutral" label={`${swing.deg}°`} />
    </View>
  );
}

export default function DrawScreen() {
  const { t, money } = useI18n();
  const { c } = useTheme();
  const { wide: wideScreen } = useDevice();
  // a phone on its side (founder 08.11): a clean sheet — no app menu, no side panel, only «назад» and «вписать»;
  // the attributes come in a sheet as on the phone held upright
  const win = useWindowDimensions();
  const flat = win.width > win.height && Math.min(win.width, win.height) < breakpoint.tablet;
  const wide = wideScreen && !flat;
  useHideTabBar(flat);
  const toast = useToast();
  const store = useStore();
  const params = useLocalSearchParams<{ m?: string; lead?: string; property?: string; estimate?: string }>();
  const ins = useSafeAreaInsets();
  const access = moduleState(store.db.company?.modules?.gutters).access;
  const canSave = access === "trial" || access === "paid";
  // what the company installs, its palette and defaults (settings M7b): new elements and the attribute panel
  const settings = store.db.company?.modules?.gutters?.settings;
  const ch = useMemo(() => choicesFor(settings), [settings]);
  // the company's rules and use (M7c) and its corner method: the $ under the drawing counts by them
  const rules = useMemo(() => ({ over: toRulesOverride(settings), corner: readRules(settings).corner }), [settings]);
  /** the downspouts it puts by itself (#1246): the company's setting — one per `runPerDsFt` of chain, `dsEdgeIn` from the end */
  const autoDs = useMemo(() => { const r = readRules(settings); return r.dsAuto ? { spacingIn: r.runPerDsFt * 12, edgeIn: r.dsEdgeIn } : null; }, [settings]);

  const [drawing, setDrawing] = useState<Drawing>(EMPTY);
  const [hist, setHist] = useState<History>({ past: [], future: [] });
  const [m, setM] = useState<MeasurementRow | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);
  const [tool, setTool] = useState<Tool>("line");
  const [story, setStoryN] = useState<Story>(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [place, setPlace] = useState<ToolbarPlace>("bottom");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<PlanView | null>(null);
  const [ghost, setGhost] = useState<{ a: P; b: P } | null>(null);
  const [ghostChip, setGhostChip] = useState({ w: 0, h: 0 });
  // a free end being swung (#818): the standing end, the end under the finger and the angle between — the chip beside it
  const [swing, setSwing] = useState<{ a: P; b: P; deg: number } | null>(null);
  /** 390: the attribute sheet is open (820/1280 show the panel whenever something is picked) */
  const [sheet, setSheet] = useState(false);
  /** 390: the sheet of the measurement's photos */
  const [photoSheet, setPhotoSheet] = useState(false);
  /** «Ещё»: «Вернуть» and where the toolbar sits — rare, off the main row (П20.8) */
  // «⋯» → «Точность замера» or «Где панель инструментов» (founder 10.11, #739: «что такое „как мерили“?»)
  const [moreSheet, setMoreSheet] = useState<"acc" | "place" | "layers" | null>(null);
  // the layers of the view (#930): on this screen only, not saved with the measurement; all on to begin with
  const [layers, setLayers] = useState({ grid: true, labels: true, ds: true });
  /** the gutter just drawn: its length by hand at once (просьба основателя 08.11) */
  const [quickRun, setQuickRun] = useState<string | null>(null);
  /** a length label tapped (founder 09.11): the length of that gutter, without its properties */
  const [lenEdit, setLenEdit] = useState<string | null>(null);
  /** the length sheet is open for a gutter that grew straight on from its end (not a new one): «Отменить» undoes the growth */
  const quickGrew = useRef(false);
  const sceneRef = useRef<Scene | null>(null);
  /** the corner tapped: inside / outside (founder 08.11) */
  const [cornerSheet, setCornerSheet] = useState<string | null>(null);
  /** a downspout just put blinks three times (founder 08.11: you see what appeared); `dim` — its off beat */
  const [fresh, setFresh] = useState<string | null>(null);
  const [dim, setDim] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!fresh || reduce) return setFresh(null);
    let n = 0;
    setDim(true);
    const iv = setInterval(() => {
      n += 1;
      if (n >= 6) {
        clearInterval(iv);
        setDim(false);
        setFresh(null);
      } else setDim((x) => !x);
    }, motion.durBase);
    return () => clearInterval(iv);
  }, [fresh, reduce]);
  /** the hint of the tool just picked; gone after the first thing done with it (П20.8) */
  const [hint, setHint] = useState<Tool | "select" | "move" | null>(null);
  const live = useLive();
  const viewNow = view ?? NO_VIEW;
  // pan with two fingers and pinch: they run together with the one-finger draw and tap below (a second finger
  // cancels the stroke — founder 09.11: the pinch never came once the first finger had moved)
  // the limits of the scale (#1281): the whole drawing in a quarter of the screen at the farthest, 1″ as big as a finger's target at the nearest
  const zoomLim = useMemo(() => zoomLimits(drawing.runs.flatMap((r) => [r.a, r.b]), size.w > 0 ? size : { w: 390, h: 844 }, space[8], sizes.hitMin), [drawing.runs, size]);
  const canvas = useCanvasGestures(viewNow, setView, live, 2, { lim: zoomLim, viewport: size.w > 0 ? size : { w: 390, h: 844 }, onEdge: () => haptics.selection() });

  // the latest values for gesture callbacks and the delayed save
  const cur = useRef({ drawing, view, tool, story, selected, m, canSave, ch, layers, autoDs });
  cur.current = { drawing, view, tool, story, selected, m, canSave, ch, layers, autoDs };
  // the store of this render for the save that runs later (module.op through the core's queue)
  const storeRef = useRef(store);
  storeRef.current = store;
  const mid = useRef(typeof params.m === "string" && params.m ? params.m : Crypto.randomUUID()).current;
  const mstore = useRef(makeModuleStore(() => storeRef.current, mid)).current;
  const saver = useRef(makeSaver(mstore)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** the address names the measurement after its first save, once, and only while this screen is shown (review M5a №5) */
  const named = useRef(!!params.m);
  const shown = useRef(true);

  useEffect(() => {
    let on = true;
    // the draft M4b kept on the phone (device-wide, no owner): not moved into a company — it would go to whoever is
    // signed in (review M5a №6); M4b never reached the phones' channel
    void forgetOldDraft();
    void mstore.load().then((v) => {
      if (!on) return;
      if (v) {
        const d = fromElements(v.elements);
        // «saved» is what the screen would write for this drawing: only a real change is sent — opening the canvas
        // never turns a ready measurement into a draft (review M8b №7, e2e 154)
        saver.seed(toElements(d, mid), v.m);
        // an old drawing may have a gutter lying on another (#1256): cleaned once, here, keeping the one with the smallest id; the write
        // below is a real change, so an estimate made of this drawing says «Чертёж изменён» (#1314 review); «Отменить» puts it back
        const clean = withoutDuplicates(d);
        setDrawing(clean);
        // read-only (or the module off): nothing is written, so nothing is said — the toast would come at every opening (director, 13.11)
        if (clean !== d && cur.current.canSave) {
          later.current();
          toast.show(t("mod.gutters.draw.dupCleaned"), localUndo(() => commit(d, cur.current.drawing)));
        }
      }
      // a new one from a lead or a property is linked to it (S4g); from home — a draft without either (S1b)
      const one = (x: string | string[] | undefined) => (typeof x === "string" && x ? x : null);
      setM(v?.m ?? { id: mid, label: null, status: "draft", accuracy: "rough", propertyId: one(params.property), leadId: one(params.lead) });
    });
    void loadToolbarPlace().then((p) => on && setPlace(p));
    return () => {
      on = false;
    };
  }, []);

  const fit = useCallback((d: Drawing, s: { w: number; h: number }) => fitView(d.runs.flatMap((r) => [r.a, r.b]), s, space[8]), []);
  useEffect(() => {
    if (!view && m && size.w > 0 && size.h > 0) setView(fit(drawing, size));
  }, [view, m, size, drawing, fit]);

  const later = useRef<() => void>(() => {});
  /** the address gets the measurement's id at its first edit (a reload opens it again) — only while this screen is shown */
  const nameIt = () => {
    const mm = cur.current.m;
    if (named.current || !mm || !cur.current.canSave || !shown.current) return;
    named.current = true;
    router.setParams({ m: mm.id });
  };
  const flush = useCallback(() => {
    const { drawing: d, m: mm, canSave: ok } = cur.current;
    if (!mm || !ok) return;
    void saver.flush(mm, toElements(d, mm.id)).then((r) => {
      if (r === "saved") {
        if (!shown.current) return;
        setSavedOnce(true);
        // a reload (web) or «back» and in again opens this measurement, not a new one
        if (!named.current) {
          named.current = true;
          router.setParams({ m: mm.id });
        }
      }
      // the write failed: its change is still unsent — try again a bit later
      else if (r === "failed") later.current();
    });
  }, [saver]);
  // a gesture ended: write 1 s later (the queue gets one write per gesture, not per movement — П14.2 №5)
  later.current = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_AFTER_MS);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    flush();
    shown.current = false;
  }, [flush]);
  // the app leaves (sent to the background, the tab hidden, the page left): what is unsent is written right then
  useEffect(() => onAppLeave(flush), [flush]);

  /** one finished edit: history, the drawing, the save */
  const commit = useCallback(
    (made: Drawing, prev = cur.current.drawing, placed = false) => {
      // every chain a change touched has its downspout(s) by itself (spec 33-gutters-ds-auto, #1246): one step of «Назад» with the change
      const next = commitAuto(made, prev, placed, cur.current.canSave && cur.current.autoDs ? { ...cur.current.autoDs, attrs: newDsAttrs(cur.current.ch), ch: cur.current.ch, newId: () => Crypto.randomUUID() } : null);
      if (next === prev) return;
      // the program took automatic downspouts off because the chain wants fewer now (shorter, joined, split): say so, with «Отменить» (#1246)
      if (next !== made && next.downspouts.filter((x) => x.auto).length < made.downspouts.filter((x) => x.auto).length) {
        announceDs.current(next.downspouts.length, localUndo(() => commit(made, next, true)));
      }
      // a downspout put by the program must not stand unseen: the layer of downspouts is switched on (#1246 review)
      if (next.downspouts.length > prev.downspouts.length && !cur.current.layers.ds) setLayers((x) => ({ ...x, ds: true }));
      setHint(null);
      setHist((h) => pushHistory(h, prev));
      setDrawing(next);
      // written at once, not a second later (founder 09.11: «отвлёкся, смахнул, обновилось — чертёж пропал»; e2e 213):
      // the drawing goes into the phone's copy of the data on every finished edit, and the address names the
      // measurement now — a reload, an update or a killed app opens this one, not a new empty one
      cur.current = { ...cur.current, drawing: next };
      nameIt();
      flush();
    },
    [],
  );

  const tolIn = () => FINGER / (cur.current.view?.k ?? 1);
  /** the width of a magnet's window in plan inches (pixels, not degrees: the same on a 3 ft and a 30 ft gutter) */
  const snapIn = () => SNAP_PX / (cur.current.view?.k ?? 1);
  const plan = (x: number, y: number): P => (cur.current.view ? toPlan(cur.current.view, [x, y]) : [0, 0]);

  // one finger: draw a run, or drag an end of the picked run
  const dragRef = useRef<Stroke | null>(null);
  /** a stroke just ended and no finger has touched down since: on the web the lift of a drag is also a tap on the spot — not a tap on an end cap (it turned the new line's face, #854) */
  const liftTap = useRef(false);
  /** what the line being drawn is held by (`drawSnap`): a tick on entering a snap, none while it stays */
  const lineSnap = useRef<string | null>(null);
  // where the finger touched down: the pan activates only after it has moved a little
  const downAt = useRef<[number, number]>([0, 0]);
  // when it touched down: held still before moving = a long press (founder 08.11: from an end cap — a new line)
  const downTime = useRef(0);
  /** the «joint of three ends» toast was shown in this drag (#1282) */
  const threeShown = useRef(false);
  /** the hold that picks something up (canvas/holdLift.ts, #1272): the state of this touch, its timer, and what is lifted (the point is drawn bigger) */
  const hold = useRef<Hold>("idle");
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lifted, setLifted] = useState<Lift | null>(null);
  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  useEffect(() => clearHold, []); // the screen is left with a touch down: no timer left running
  /** the touch took something (at its first move): `light` once, unless the hold did it already; the point is lifted */
  const takeTick = (target: Lift | null, atOnce = true) => {
    const r = holdMove(hold.current, atOnce);
    hold.current = r.hold;
    if (r.light) haptics.light();
    if (target) setLifted(target);
  };
  /** the hold ran out with the finger still: if it is on something that can be taken, `light` and the lifted look — before any move */
  const liftAtHold = () => {
    holdTimer.current = null;
    const target = dragRef.current || !cur.current.canSave ? null : liftTarget(withoutDs(cur.current.drawing, !cur.current.layers.ds), plan(downAt.current[0], downAt.current[1]), tolIn());
    const r = holdFire(hold.current, !!target);
    hold.current = r.hold;
    if (!r.light || !target) return;
    haptics.light();
    setSelected(target.id);
    setLifted(target);
  };
  const pan = usePanGesture({
    runOnJS: true,
    maxPointers: 1,
    simultaneousWith: [canvas.pinch, canvas.pan],
    onBegin: (e) => {
      downAt.current = [e.x, e.y];
      downTime.current = Date.now();
      threeShown.current = false;
      // held on an end, a corner or a downspout for longPressMs without moving: picked up AT ONCE, before the finger goes (#1272, founder
      // 12.11: «не чувствую момента, когда можно тянуть»); the drag after it has no second «взял»
      hold.current = holdBegin().hold;
      setLifted(null);
      clearHold();
      holdTimer.current = setTimeout(liftAtHold, motion.longPressMs);
    },
    onFinalize: () => {
      clearHold(); // let go without moving, or a second finger: nothing changes, no «medium» (the drawing is untouched)
      hold.current = holdCancel(hold.current).hold;
      setLifted(null);
    },
    onActivate: () => {
      clearHold(); // moved: before the hold it is drawing as ever; after it the pick-up was made already
      lineSnap.current = null;
      const { drawing: d, tool: tl } = cur.current;
      const p0 = plan(downAt.current[0], downAt.current[1]);
      const h = hitTest(withoutDs(d, !cur.current.layers.ds), p0, tolIn());
      const held = Date.now() - downTime.current >= motion.longPressMs;
      // An end or a corner taken (#818, П35; founder 12.11: «долгое нажатие работает в любом режиме»). Taken: by a long press on any end
      // with ANY tool, and by a drag from an end with the downspout tool (it has no other use for it; the picked gutter's ring too).
      // Not taken: «Желоб» without a hold — it goes on from the end, as drawing always did: a new line (a corner, or the same gutter
      // grown straight on); from the picked gutter's ring along the gutter it is a pull, across it a new line (#504).
      const endHere = h?.kind === "end" && cur.current.canSave ? h : null;
      if (endHere) {
        const corner = findCorners(d).find((c) => c.runs.some((x) => x.id === endHere.id && x.end === endHere.end));
        const sel = cur.current.selected;
        const ring = endHere.id === sel || (!!corner && corner.runs.some((x) => x.id === sel));
        if (held || (ring && tl !== "line") || tl === "ds") {
          // a joint of three ends is not moved (spec П35): say why, once, instead of doing nothing
          if (corner && !cornerMovable(d, corner.id)) {
            haptics.warning();
            toast.show(t("mod.gutters.draw.hint.threeEnds"));
            return;
          }
          if (corner && cornerMovable(d, corner.id)) {
            dragRef.current = { kind: "corner", cornerId: corner.id, before: d, from: p0, held: [true, true], tol: snapIn(), onEnd: null };
            setSelected(endHere.id);
            takeTick({ kind: "corner", id: endHere.id, cornerId: corner.id }); // picked up (already, if the hold ran out first: #1272)
            return;
          }
          if (!corner && runEnds(d, findCorners(d))[endHere.id]?.[endHere.end]?.kind === "cap") {
            dragRef.current = { kind: "pull", id: endHere.id, end: endHere.end, before: d, from: p0, held: HELD_ORIGINAL, tol: snapIn(), onEnd: null };
            setSelected(endHere.id);
            takeTick({ kind: "end", id: endHere.id, end: endHere.end }); // picked up (already, if the hold ran out first: #1272)
            return;
          }
        }
      }
      // a downspout under the finger slides along its run (founder 08.11), whatever the tool
      if (h?.kind === "ds" && cur.current.canSave) {
        dragRef.current = { kind: "ds", id: h.id, before: d };
        takeTick({ kind: "ds", id: h.id });
        setSelected(h.id);
        return;
      }
      // «Желоб» from an end continues the gutter (a corner, or the same gutter grown straight on); so does a long press
      // on an end with «Водосток». «Выбрать» (a quick drag that moved an end) is gone (#687): the length is changed by
      // its label or «Свойства»; handles on the ends of the picked gutter come with #682
      if (tl === "line") {
        const a = startAt(d, p0, tolIn());
        // on the picked gutter's ring (a free end): along the gutter it is a pull, across it a new gutter (decided on the first move)
        const cap = h?.kind === "end" && h.id === cur.current.selected && cur.current.canSave && runEnds(d, findCorners(d))[h.id]?.[h.end]?.kind === "cap";
        dragRef.current = { kind: "line", a, ...(cap && h?.kind === "end" ? { pullable: { id: h.id, end: h.end, before: d } } : {}) };
        setGhost({ a, b: a });
      }
    },
    onUpdate: (e) => {
      const g = dragRef.current;
      if (!g) return;
      const p = plan(e.x, e.y);
      const d = cur.current.drawing;
      if (g.kind === "line" && g.pullable) {
        const run = g.pullable.before.runs.find((x) => x.id === g.pullable!.id);
        const far = Math.hypot(p[0] - g.a[0], p[1] - g.a[1]) > tolIn();
        if (run && far && alongAxis(run, g.a, p, tolIn())) {
          // along its own line: the end is taken and follows the finger (it may then leave the line: it swings, #818)
          dragRef.current = { kind: "pull", ...g.pullable, fromLine: true, from: g.a, held: HELD_ORIGINAL, tol: snapIn(), onEnd: null };
          takeTick({ kind: "end", id: g.pullable.id, end: g.pullable.end }); // picked up (the «Желоб» stroke turned into a pull)
          setGhost(null);
          setSelected(g.pullable.id);
          const sw = swingEnd(g.pullable.before, g.pullable.id, g.pullable.end, grabbedEnd(g.pullable.before, g.pullable.id, g.pullable.end, g.a, p), HELD_ORIGINAL, snapIn());
          if (sw) setDrawing(sw.drawing);
          return;
        }
        if (far) dragRef.current = { kind: "line", a: g.a }; // across: a new gutter, as before
      }
      if (g.kind === "line") {
        setGhost({ a: g.a, b: endAt(d, g.a, p, tolIn()) });
        // a tick on every snap on entering it: another gutter's end, a step of 45° (DS §15.6)
        const key = drawSnap(d, g.a, p, tolIn(), undefined, lineSnap.current);
        if (drawTick(key, lineSnap.current)) haptics.selection();
        lineSnap.current = key;
      }
      else if (g.kind === "ds") setDrawing(moveDs(g.before, g.id, p));
      else if (g.kind === "corner") {
        const mv = moveCorner(g.before, g.cornerId, grabbedCorner(g.before, g.cornerId, g.from, p), g.held, g.tol, g.onEnd ?? null);
        // none: the joint would land on another gutter's end, or a side would be too short — the last frame stays
        if (mv) {
          setDrawing(mv.drawing);
          const f = findCorners(mv.drawing).find((c) => c.id === g.cornerId);
          const fixed = f ? f.runs.map((x) => mv.drawing.runs.find((r) => r.id === x.id)!).map((r, i) => (f.runs[i]!.end === 0 ? r.b : r.a)) : null;
          if (f && fixed) setSwing({ a: fixed[0]!, b: f.at, deg: mv.deg });
          // a tick on EVERY snap on entering it: a side onto a step / its own direction, the joint onto another gutter's end (DS §15.6, table «место → вибрация» in spec 33)
          if (cornerTick(mv, g)) haptics.selection();
          g.held = mv.held;
          g.onEnd = mv.end ?? null;
        }
      }
      else if (g.kind === "pull") {
        // the end follows the finger (by its move from the touch): along its own line it stays straight and only grows or shrinks,
        // across it swings round the other end, held at 45° steps (#818, П30) — no corridor, no tool to switch to
        const sw = swingEnd(g.before, g.id, g.end, grabbedEnd(g.before, g.id, g.end, g.from, p), g.held ?? null, g.tol, g.onEnd ?? null);
        // none: the end would land on another gutter's end — the last frame stays (and is what the lift keeps)
        if (sw) {
          setDrawing(sw.drawing);
          const mv = sw.drawing.runs.find((x) => x.id === g.id);
          if (mv && sw.step !== HELD_ORIGINAL) setSwing({ a: g.end === 0 ? mv.b : mv.a, b: g.end === 0 ? mv.a : mv.b, deg: sw.deg });
          else setSwing(null);
          // a tick on EVERY snap on entering it (a step of 45°, the gutter's own direction, another gutter's end), not on every move at its edge
          if (pullTick(sw, g)) haptics.selection();
          g.held = sw.step;
          g.onEnd = sw.end ?? null;
        } else {
          // #1282: the end would join a corner → a joint of three ends (П35): say so, once per drag, the last frame stays
          const r0 = g.before.runs.find((x) => x.id === g.id);
          if (r0 && !threeShown.current && onCornerPoint(g.before, r0, new Set([g.id]), grabbedEnd(g.before, g.id, g.end, g.from, p), tolIn())) {
            threeShown.current = true;
            haptics.warning();
            toast.show(t("mod.gutters.draw.hint.threeJoin"));
          }
        }
      }
      else setDrawing(moveEnd(g.before, g.id, g.end, p, tolIn()));
    },
    onDeactivate: (e) => {
      const g = dragRef.current;
      dragRef.current = null;
      setGhost(null);
      setSwing(null);
      if (!g) return;
      // the final point is the lift itself; a cancelled stroke (a second finger came) keeps nothing
      const d = cur.current.drawing;
      const id = Crypto.randomUUID();
      const next = finishStroke(g, d, plan(e.x, e.y), tolIn(), e.canceled, { id, attrs: newRunAttrs(cur.current.ch, cur.current.story) });
      if (g.kind === "end" || g.kind === "ds" || g.kind === "pull" || g.kind === "corner") {
        if (e.canceled) setDrawing(g.before);
        else {
          commit(next, g.before);
          if (next !== g.before) haptics.medium(); // set down (DS §15.6) — only when something moved
          // «Желоб»: drawn on / pulled out straight from the end → its length window, as growing a gutter always did (founder 09.11)
          if (g.kind === "pull" && g.fromLine && next !== g.before && sameDirection(g.before, next, g.id)) {
            setQuickRun(g.id);
            quickGrew.current = true;
          }
        }
        liftTap.current = true;
        return;
      }
      // a line drawn over a gutter from one end to the other makes no second gutter on it (#1256): say so
      if (next === d && g.kind === "line") {
        const b = endAt(d, g.a, plan(e.x, e.y), tolIn());
        const why = e.canceled ? null : lineRefused(d, g.a, b, Number(cur.current.story) || 1, tolIn());
        if (why) {
          haptics.warning();
          toast.show(t(why === "dup" ? "mod.gutters.draw.dupRun" : "mod.gutters.draw.overlapRun"));
        }
      }
      if (next !== d) {
        commit(next, d);
        // a new gutter, or one that grew straight on from its free end (founder 09.11): its length sheet
        const grown = next.runs.length === d.runs.length ? next.runs.find((r, i) => r !== d.runs[i])?.id : undefined;
        const got = next.runs.some((r) => r.id === id) ? id : grown;
        setSelected(got ?? id);
        if (got) setQuickRun(got);
        quickGrew.current = !!grown && got === grown;
      }
    },
  });
  // a tap: the downspout tool puts one on the nearest run; otherwise pick what is under the finger
  const tap = useTapGesture({
    runOnJS: true,
    simultaneousWith: [canvas.pinch, canvas.pan],
    onBegin: () => {
      liftTap.current = false;
    },
    onActivate: (e) => {
      if (Date.now() - canvas.multiAt.current < MULTI_TAP_MS) return; // the fingers of a pinch / two-finger pan lifting are not a tap (a pinch that ended over a length label opened its sheet)
      if (!holdIsTap(hold.current)) return; // a touch that picked something up (a hold) is not a tap: the release does not flip a cap or open a menu (#1272)
      const { drawing: d, tool: tl } = cur.current;
      const p = plan(e.x, e.y);
      // a tap on a label opens what it says (founder 09.11): a length → its length, a corner → the corner, the
      // fittings word over a downspout → its menu
      const lab = cur.current.canSave ? sceneRef.current?.labels.find((l) => Math.abs(e.x - l.x) <= l.w / 2 && Math.abs(e.y - l.y) <= l.h / 2) : undefined;
      if (lab?.id.startsWith("len:")) {
        setSelected(lab.id.slice(4));
        setLenEdit(lab.id.slice(4));
        return;
      }
      // (the lift of a drag of an end or a corner is a tap on the spot on the web: not a tap on its label, #818 review)
      if (lab?.id.startsWith("corner:") && liftTap.current) return;
      if (lab?.id.startsWith("corner:")) {
        setCornerSheet(lab.id.slice(7));
        return;
      }
      if (lab?.id.startsWith("ds:")) {
        setSelected(lab.id.slice(3));
        setSheet(true);
        return;
      }
      // a tap on a downspout that is there picks it — never a second one on top (a drag of it with this tool also ends
      // in a tap on the web)
      const onDs = hitTest(withoutDs(d, !cur.current.layers.ds), p, tolIn());
      if (tl === "ds" && onDs?.kind === "ds") {
        setSelected(onDs.id);
        setSheet(true); // its menu (founder 09.11)
        return;
      }
      // …nor a tap that puts a downspout (the downspout tool drags ends and corners now)
      if (tl === "ds" && liftTap.current) return;
      if (tl === "ds") {
        const id = Crypto.randomUUID();
        const next = addDownspout(d, id, p, tolIn() * 1.5, newDsAttrs(cur.current.ch), cur.current.ch);
        if (next !== d) {
          commit(next);
          haptics.medium(); // set down on the gutter (DS §15.6)
          setSelected(id);
          setFresh(id);
          // its menu at once (founder 09.11): fittings, size, colour — on the phone a sheet, wider the side panel is open
          setSheet(true);
        }
        return;
      }
      const h = hitTest(withoutDs(d, !cur.current.layers.ds), p, tolIn());
      if (h) setHint(null);
      // an end (founder 08.11): an end cap swaps left ↔ right (the whole line's face); a corner asks inside / outside
      if (h?.kind === "end" && cur.current.canSave && !liftTap.current) {
        const found = findCorners(d);
        const corner = found.find((f) => f.runs.some((x) => x.id === h.id && x.end === h.end));
        if (corner) {
          setSelected(h.id);
          setCornerSheet(corner.id);
          return;
        }
        if (runEnds(d, found)[h.id]?.[h.end]?.kind === "cap") {
          commit(flipFace(d, h.id));
          setSelected(h.id);
          return;
        }
      }
      setSelected(h ? h.id : null);
    },
  });
  const fingers = useSimultaneousGestures(pan, tap);

  const scene = useMemo(
    () =>
      view && size.w > 0
        ? buildScene(drawing, {
            fmt: ch.lenFormat,
            view,
            viewport: size,
            fontSize: LABEL_FONT,
            padX: space[1],
            gap: dt.labelGap,
            selected,
            lift: lifted,
            // О3: the colour is never the only sign — every run's label says its storey
            lenWithStory: true,
            dsPad: DS_MARK_R,
            dsText: (n) => t("mod.gutters.ds", { n }),
            storyText: (n) => t("mod.gutters.story", { n }),
            cornerText: (kind, splash, angleDeg) => {
              // the word and the angle between the walls (#933): «внутр. 90°», a skew one «наруж. 106°»
              const k = `${t(kind === "in" ? "mod.gutters.draw.cornerIn" : kind === "out" ? "mod.gutters.draw.cornerOut" : "mod.gutters.draw.cornerBay")} ${angleDeg}°`;
              return splash ? t("mod.gutters.draw.cornerSplash", { k }) : k;
            },
            faceOff: dt.runW * 2,
            dimDs: dim ? fresh : null,
            gridMinPx: space[6],
            layers,
          })
        : null,
    [drawing, view, size, selected, t, dim, fresh, ch.lenFormat, layers, lifted],
  );
  sceneRef.current = scene;


  const sel = selected ? drawing.runs.find((r) => r.id === selected) ?? drawing.downspouts.find((s) => s.id === selected) : undefined;
  const selText = !sel
    ? null
    : "a" in sel
      ? t("mod.gutters.draw.selRun", { len: fmtLen(runLengthIn(sel), ch.lenFormat), n: storyOf(sel.attrs.story) })
      : t("mod.gutters.draw.selDsKind", { kind: t(`mod.gutters.attr.kind.${dsKindOf(sel.shape, sel.dsStyle).key}`).replace("\n", " "), size: dsSizeText(sel.size), n: storyOf(drawing.runs.find((r) => r.id === sel.runId)?.attrs.story) });
  /** the picked downspout's kind icon on the bottom bar (#929): the kind seen at a glance, no colour */
  const selDsIcon = sel && !("a" in sel) ? dsKindOf(sel.shape, sel.dsStyle).icon : null;

  // the attribute panel (П21.8): one choice = one edit of the drawing, taken back by «Назад»
  const onRunAttrs = (p: Partial<RunAttrs>) => {
    const id = cur.current.selected;
    if (!id) return;
    if (p.story !== undefined) setStoryN(storyOf(p.story));
    commit(setRunAttrs(cur.current.drawing, id, p, cur.current.ch));
  };
  const onDsAttrs = (p: Partial<DsAttrs>) => {
    const id = cur.current.selected;
    if (id) commit(setDsAttrs(cur.current.drawing, id, p, cur.current.ch));
  };
  // the corners of the picked run (M7c): stored on its runs, else the company's method
  const runCorners: RunCorner[] =
    sel && "a" in sel
      ? findCorners(drawing)
          .filter((f) => f.runs.some((x) => x.id === sel.id))
          .map((f) => {
            const own = cornerChoiceOf(drawing, f);
            return { found: f, method: own?.method ?? rules.corner, own: !!own, def: rules.corner };
          })
      : [];
  const onCorner = (f: FoundCorner, method: CornerChoice["method"] | null) => commit(setCornerMethod(cur.current.drawing, f, method));
  const onLength = (lengthIn: number | null) => {
    const id = cur.current.selected;
    if (id) commit(setLength(cur.current.drawing, id, lengthIn));
  };
  const quick = quickRun ? drawing.runs.find((r) => r.id === quickRun) : undefined;
  const editRun = lenEdit ? drawing.runs.find((r) => r.id === lenEdit) : undefined;
  /** «Отменить» or a tap outside the length sheet (founder 09.11): the gutter just drawn goes — no step left to undo */
  const cancelQuick = () => {
    const id = quickRun;
    setQuickRun(null);
    if (!id || !cur.current.drawing.runs.some((r) => r.id === id)) return;
    const u = undo(hist, cur.current.drawing);
    // a new gutter goes; one that grew from its end goes back to its length before (not away — #479 with part 1)
    if (u && (!u.d.runs.some((r) => r.id === id) || quickGrew.current)) {
      setHist({ past: u.h.past, future: hist.future });
      setDrawing(u.d);
    } else setDrawing(removeElement(cur.current.drawing, id));
    setSelected(null);
    later.current();
  };
  const tape = m?.accuracy === "tape";
  const setAccuracy = (a: "rough" | "tape") => {
    setM((x) => (x ? { ...x, accuracy: a } : x));
    later.current();
  };
  const corner = cornerSheet ? findCorners(drawing).find((f) => f.id === cornerSheet) : undefined;
  const cut = corner ? cornerCut(drawing, corner) : null;
  const [sketchW, setSketchW] = useState(0);
  const cornerKind = (kind: "in" | "out") => {
    // the sheet stays open (founder 09.11: a tap closed it) — the kind switches, the cut below follows
    if (corner && corner.kind !== kind && corner.kind !== "bay") commit(flipFace(cur.current.drawing, corner.runs[0].id));
  };
  // photos (П21.10): only of what the server has (a files row points at the measurement and its element — FK). The
  // module does not save (off, past the trial — founder О2): the photos it has are shown, nothing is added (M5e)
  const stored = gutterData(store.db);
  const mStored = !!m && stored.measurements.some((x) => x.id === m.id);
  const has = (elementId?: string) => !!m && photosOf(store.db, m.id, elementId).length > 0;
  const elPhotos =
    sel && m && stored.elements.some((e) => e.id === sel.id) && (canSave || has(sel.id)) ? (
      <MeasurePhotos measurementId={m.id} elementId={sel.id} testID="attr-photos" onRemoved={() => setSheet(false)} readOnly={!canSave} />
    ) : null;
  const photoN = m ? photosOf(store.db, m.id).length : 0;
  const mPhotos = m && mStored && (canSave || has()) ? <MeasurePhotos measurementId={m.id} testID="draw-photos" onRemoved={() => setPhotoSheet(false)} readOnly={!canSave} /> : null;
  const attrs = !sel ? null : (
    <>
      {"a" in sel ? <RunAttrsView run={sel} onAttrs={onRunAttrs} onLength={onLength} ch={ch} corners={runCorners} onCorner={onCorner} compact={!wide} /> : <DsAttrsView ds={sel} onAttrs={onDsAttrs} ch={ch} compact={!wide} run={drawing.runs.find((r) => r.id === sel.runId)?.attrs} />}
      {elPhotos}
    </>
  );
  /** 820/1280: the panel is a column on the right, always there; the canvas and its bars stay left of it */
  const panelSide = wide ? ins.right + component.panelW + space[3] : 0;

  const doUndo = () => {
    const u = undo(hist, drawing);
    if (!u) return;
    setHint(null);
    setHist(u.h);
    setDrawing(u.d);
    setSelected(null);
    later.current();
  };
  const doRedo = () => {
    const r = redo(hist, drawing);
    if (!r) return;
    setHint(null);
    setHist(r.h);
    setDrawing(r.d);
    later.current();
  };
  const doDelete = () => {
    if (!selected) return;
    const before = drawing;
    commit(removeElement(drawing, selected));
    setSelected(null);
    const gone = selected;
    // «Отменить» puts back what was deleted and keeps what was drawn since
    toast.show(t("mod.gutters.draw.deleted"), localUndo(() => commit(restoreRemoved(cur.current.drawing, before, gone), cur.current.drawing, true))); // put back as it was: no recount (#1264)
  };
  const nextStory = () => {
    const n = ((story % 4) + 1) as Story;
    setStoryN(n);
    if (selected && drawing.runs.some((r) => r.id === selected)) commit(setStory(drawing, selected, n));
  };
  /** how far the toolbar is dragged by its grip, px */
  const [gripAt, setGripAt] = useState<[number, number]>([0, 0]);
  /** the toolbar is being dragged by its grip: it stands out and says where to let go (founder 09.11) */
  const [gripping, setGripping] = useState(false);
  /** where it would stick if let go now — that edge is outlined while dragging (founder 09.11) */
  const [dropAt, setDropAt] = useState<ToolbarPlace | null>(null);
  const gripPan = usePanGesture({
    runOnJS: true,
    onActivate: () => {
      setGripping(true);
      haptics.light(); // picked up (DS §15.6, #1159)
    },
    onUpdate: (e) => {
      setGripAt([e.translationX, e.translationY]);
      setDropAt(placeAt(e.absoluteX, e.absoluteY, win.width, win.height));
    },
    onFinalize: () => {
      setGripping(false);
      setDropAt(null);
    },
    onDeactivate: (e) => {
      setGripAt([0, 0]);
      setGripping(false);
      if (e.canceled) return;
      const p = placeAt(e.absoluteX, e.absoluteY, win.width, win.height);
      const dh = dropHaptic(place, p); // set down on another edge — only when it moved (DS §15.6)
      if (dh) haptics[dh]();
      setPlace(p);
      void saveToolbarPlace(p);
    },
  });
  const pickPlace = (p: ToolbarPlace) => {
    setPlace(p);
    setMoreSheet(null);
    void saveToolbarPlace(p);
  };
  /** a layer on or off (#930): off with the downspouts — no downspout stays picked, and the downspout tool gives way to «Желоб» */
  const toggleLayer = (l: "grid" | "labels" | "ds", on: boolean) => {
    setLayers((x) => ({ ...x, [l]: on }));
    if (l === "ds" && !on) {
      if (cur.current.drawing.downspouts.some((x) => x.id === cur.current.selected)) setSelected(null);
      if (cur.current.tool === "ds") setTool("line");
      setSheet(false);
    }
  };
  /** the toast «Водостоков стало N» (kept fresh each render: `commit` is made once) */
  const announceDs = useRef<(n: number, undo: GuardedUndo) => void>(() => {});
  announceDs.current = (n, undo) => toast.show(t("mod.gutters.draw.dsAutoCount", { n }), undo);
  /** «Расставить водостоки»: every chain of an old measurement gets its downspouts — one step of «Назад» (#1246) */
  const placeAutoDs = () => {
    const o = cur.current.autoDs;
    if (!o) return;
    const next = autoDownspouts(cur.current.drawing, { ...o, attrs: newDsAttrs(cur.current.ch), ch: cur.current.ch, newId: () => Crypto.randomUUID() }, undefined, true);
    if (!layers.ds) setLayers((x) => ({ ...x, ds: true }));
    commit(next, cur.current.drawing, true);
  };
  const pick = (tl: Tool) => {
    // «Водосток» needs the downspouts seen: the layer comes back on (a downspout is never put in the dark, #930 review)
    if (tl === "ds" && !layers.ds) setLayers((x) => ({ ...x, ds: true }));
    setTool(tl);
    setHint(tl);
  };
  // the measurement as the store has it now (a lead linked by «Сделать заявкой» or by the office shows at once)
  const inStore = m ? gutterData(store.db).measurements.find((x) => x.id === m.id) : undefined;
  const leadId = inStore?.leadId ?? m?.leadId ?? null;
  const lead = leadId ? store.db.leads.find((l) => l.id === leadId) : undefined;
  const placeId = inStore?.propertyId ?? m?.propertyId ?? null;
  const addr = placeId ? store.db.properties.find((p) => p.id === placeId) : undefined;
  /** S1b: a saved draft without a lead → the core's new-lead form; the new lead takes the draft (ModuleDef.leadCreated) */
  // «Сделать заявкой» → a new lead, an open lead or a client's address (founder 09.11, LinkSheet)
  const [linkSheet, setLinkSheet] = useState(false);
  // «⋯» (founder 09.11, #692 #690; spec 33 П24 Б5, Б6): link to another, unlink back to the drafts, delete the measurement
  const whoRef = useRef<React.ComponentRef<typeof View>>(null);
  const [whoAt, setWhoAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  type WhoKey = "acc" | "place" | "layers" | "autods" | "relink" | "unlink" | "delete";
  const linked = !!leadId || !!placeId;
  const whoItems: { key: WhoKey; label: string; destructive?: boolean }[] = [
    // how exact the lengths are, and where the toolbar sits — two items, each says what it is (#739; was one
    // «Как мерили, панель» the founder did not understand)
    ...(canSave && m ? [{ key: "acc" as const, label: t("mod.gutters.draw.accItem") }] : []),
    { key: "place", label: t("mod.gutters.draw.placeItem") },
    { key: "layers", label: t("mod.gutters.draw.layersItem") },
    // a measurement from before the automatic downspouts gets them only when asked (#1246): not silently, the estimate would change
    ...(canSave && autoDs && drawing.runs.length > 0 && !autoManaged(drawing) ? [{ key: "autods" as const, label: t("mod.gutters.draw.autoDsItem") }] : []),
    ...(linked ? [{ key: "relink" as const, label: t("mod.gutters.link.relink") }, { key: "unlink" as const, label: t("mod.gutters.link.unlink") }] : []),
    ...(inStore ? [{ key: "delete" as const, label: t("mod.gutters.draw.mDelete"), destructive: true }] : []),
  ];
  const onWho = (k: WhoKey) => {
    if (k === "acc" || k === "place" || k === "layers") return setMoreSheet(k);
    if (k === "autods") return placeAutoDs();
    if (!m) return;
    flush();
    if (k === "relink") setLinkSheet(true);
    else if (k === "unlink") toast.show(t("mod.gutters.link.unlinked"), relink(store, m.id, null) ?? undefined);
    else if (signedOn(store.db, m.id)) toast.show(t("mod.gutters.draw.deleteSigned"));
    else {
      const undo = removeMeasurement(store, m.id);
      back();
      toast.show(t("mod.gutters.draw.mDeleted"), undo ?? undefined);
    }
  };
  const back = () => {
    flush();
    if (router.canGoBack()) router.back();
    else router.replace("/company/modules");
  };

  // the save mark (#507): saved at all, and whether something still waits to go out
  const mark = saveMark({ saved: savedOnce, online: store.online, pending: store.queue.length });

  // «Готово» (founder 09.11, #698; spec 33 П20.25): the drawing saved, then «Просмотр замера» — the total, the estimate
  // and the list live there now, not under the drawing (#700)
  const done = async () => {
    const mm = cur.current.m;
    if (!mm) return;
    if (timer.current) clearTimeout(timer.current);
    if (cur.current.canSave) await saver.flush(mm, toElements(cur.current.drawing, mm.id));
    router.push(`${moduleHref("gutters", "view")}?m=${encodeURIComponent(mm.id)}&from=draw` as Href);
  };
  // an old link «Смета из замера» (estimate=1) to the canvas: the review does the estimate now
  const toView = useRef(params.estimate === "1");
  useEffect(() => {
    if (!toView.current || !inStore) return;
    toView.current = false;
    router.replace(`${moduleHref("gutters", "view")}?m=${encodeURIComponent(inStore.id)}&estimate=1` as Href);
  });

  // on its side (founder 08.11): one strip at the bottom — the card and the toolbar as a row beside it (a column would
  // not fit the height); the grip puts the toolbar left or right of the card
  const at = place;
  const side = !flat && (at === "left" || at === "right");
  // the grip (founder 08.11): drag the toolbar, let go — it sticks to the nearest edge
  const grip = (
    <GestureDetector gesture={gripPan}>
      <View testID="draw-grip" accessibilityRole="adjustable" accessibilityLabel={t("mod.gutters.draw.grip")} style={{ minWidth: side ? sizes.hitMin : sizes.iconMd, minHeight: side ? sizes.iconMd : sizes.hitMin, alignItems: "center", justifyContent: "center" }}>
        <Icon name="grip" s={sizes.iconMd} color={c.ink} />
      </View>
    </GestureDetector>
  );
  /** 390 at the bottom: the row takes the width, six cells share it */
  const grow = !side && !wide && !flat;
  // the tools show what is chosen (#1274): the gutter's profile, the downspout's kind
  const lineIcon = PROFILE_ICON[(newRunAttrs(ch, story).profile as GutterProfile)] ?? "channel";
  const dsIcon = (() => { const a = newDsAttrs(ch); return dsKindOf(a.shape, a.dsStyle).icon; })();
  const tools = (
    <View testID="draw-toolbar" style={{ flexDirection: side ? "column" : "row", alignSelf: grow ? "stretch" : undefined, gap: space[1], alignItems: "center", padding: space[2], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: gripping ? dt.runW / 2 : 1, borderColor: gripping ? c.ink : c.bd, flexShrink: 0, transform: [{ translateX: gripAt[0] }, { translateY: gripAt[1] }] }}>
      {grip}
      <View testID="draw-tool-line" style={grow ? { flex: 1 } : { flexShrink: 0 }}><ToolCell icon={lineIcon} label={t("mod.gutters.draw.line")} active={tool === "line"} onPress={() => pick("line")} grow={grow} below={at === "top"} /></View>
      <View testID="draw-tool-ds" style={grow ? { flex: 1 } : { flexShrink: 0 }}><ToolCell icon={dsIcon} label={t("mod.gutters.draw.downspout")} active={tool === "ds"} onPress={() => pick("ds")} grow={grow} below={at === "top"} /></View>
      {/* «Выбрать» is gone (founder 09.11, #687): a tap picks with any tool; in its place «Свойства» of what is picked —
          on the phone (820/1280 show them in the side panel) */}
      {!wide ? (
        <View testID="draw-props" style={[grow ? { flex: 1 } : { flexShrink: 0 }, sel ? null : { opacity: component.dimOpacity }]}><ToolCell icon="sliders" label={t("mod.gutters.attr.props")} onPress={() => (sel ? setSheet(true) : setHint("select"))} grow={grow} /></View>
      ) : null}
      <View testID="draw-story" style={grow ? { flex: 1 } : { flexShrink: 0 }}><ToolCell body={t("mod.gutters.draw.storyShort", { n: story })} ring={c.drawing.story[story - 1]} label={t("mod.gutters.draw.storyCell")} a11y={t("mod.gutters.draw.story", { n: story })} onPress={nextStory} grow={grow} /></View>
      <View testID="draw-undo" style={grow ? { flex: 1 } : { flexShrink: 0 }}><ToolCell icon="undo" label={t("mod.gutters.draw.undo")} onPress={doUndo} grow={grow} /></View>
      {/* «Вперёд» beside «Назад» (founder 09.11): «Ещё» is gone — how it was measured and the toolbar's place open from
          the accuracy mark at the top */}
      <View testID="draw-redo" style={grow ? { flex: 1 } : { flexShrink: 0 }}><ToolCell icon="redo" label={t("mod.gutters.draw.redoShort")} onPress={doRedo} grow={grow} below={at === "top"} /></View>
      {/* the bin (#1274, founder 12.11: «🗑 в панели, виден всегда, активен только при выборе»): «Отменить» for 5 s after (rule 5) */}
      <View testID="draw-delete" style={grow ? { flex: 1 } : { flexShrink: 0 }}><ToolCell icon="trash" label={t("mod.gutters.draw.delete")} onPress={doDelete} grow={grow} disabled={!sel} below={at === "top"} /></View>
    </View>
  );
  // the summary chip: the parts are the engine's (rule 8) from the drawing as it is when the finger rests — not on every frame of a drag
  const calmDrawing = useDeferredValue(drawing);
  const parts = useMemo(() => (calmDrawing.runs.length ? computeGutterParts(toMeasurement(calmDrawing, { method: rules.corner }), rules.over).parts : []), [calmDrawing, rules]);
  const summary0 = summaryOf(drawing, parts, selText ? { text: selText, dsIcon: selDsIcon } : null, tool === "ds" || !!ghost);
  // a module that is off still says what is picked (as the old row did); the hint and the totals are for a drawing that is saved
  const summary = canSave || summary0?.kind === "selected" ? summary0 : null;
  const summaryA11y = !summary ? "" : summary.kind === "selected" ? summary.text : summary.kind === "nextDs" ? t("mod.gutters.draw.nextDs") : t("mod.gutters.draw.summaryA11y", { g: summary.gutterFt, d: summary.dsCount, p: summary.pipeFt });
  // #818 (founder 12.11: «не понимаю, как тянуть край»): once per opening of the canvas, when a gutter is first picked, the hint bubble says how
  // an end and a corner are taken, with any tool (the bubble the tools' hints use: it never replaces a toast with «Отменить», rule 5)
  const movedHint = useRef(false);
  useEffect(() => {
    if (movedHint.current || !canSave || !selected || !drawing.runs.some((r) => r.id === selected)) return;
    movedHint.current = true;
    setHint("move");
  }, [selected, canSave, drawing.runs]);
  const hintText = hint && !(hint === "line" && !drawing.runs.length) ? t(`mod.gutters.draw.hint.${hint}`) : null;

  const ghostLen = ghost ? Math.round(Math.hypot(ghost.b[0] - ghost.a[0], ghost.b[1] - ghost.a[1])) : 0;
  const gA = ghost && view ? toScreen(view, ghost.a) : null;
  const gB = ghost && view ? toScreen(view, ghost.b) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID="draw-screen">
      {/* no edge swipe back on the canvas (founder 09.11): drawing from the left edge left the screen */}
      <Stack.Screen options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
      {/* the drawing under everything */}
      <View style={{ position: "absolute", left: 0, right: panelSide, top: 0, bottom: 0 }}>
        <CanvasView view={viewNow} onView={setView} live={live} size={size} onSize={setSize} gestures={canvas} testID="draw-canvas">
          <GestureDetector gesture={fingers}>
            <View style={{ width: size.w, height: size.h }} testID="draw-surface">
              {scene ? <SvgPainter scene={scene} w={size.w} h={size.h} testID="draw-svg" /> : null}
              {gA && gB ? (
                <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0 }}>
                  <Svg width={size.w} height={size.h}>
                    <Line x1={gA[0]} y1={gA[1]} x2={gB[0]} y2={gB[1]} stroke={c.drawing.story[story - 1]} strokeWidth={dt.runWSel} strokeLinecap="round" strokeDasharray={`${dt.runWSel * 2} ${dt.runWSel}`} />
                  </Svg>
                </View>
              ) : null}
            </View>
          </GestureDetector>
        </CanvasView>
      </View>

      {/* top, ONE row (#1274, founder 12.11: «шапка — в одну строку»): back · the name (a lead, an address, «Привязать»; «Замер» before it is saved)
          · a small mark when the drawing is only on the phone (no cloud when all is saved) · fit · photos · «⋯» · «Готово»; a module that is off or
          past the trial says it under the row before the work starts */}
      <View pointerEvents="box-none" style={{ paddingTop: ins.top + space[2], paddingLeft: ins.left + space[3], paddingRight: ins.right + space[3] + panelSide, gap: space[2] }}>
        <RowView style={{ alignItems: "center", gap: space[1] }}>
          <View testID="draw-back"><IconButton icon="chevronLeft" label={t("mod.title")} onPress={back} /></View>
          <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space[1] }}>
            {flat || !canSave ? (
              <T v="heading" w="semibold">{t("mod.gutters.draw.title")}</T>
            ) : lead ? (
              <View testID="draw-lead" style={{ flexShrink: 1 }}>
                <Button label={lead.name} icon="user" size="sm" variant="ghost" onPress={() => router.push(`/lead/${lead.id}`)} />
              </View>
            ) : addr ? (
              // linked to a client's address (LinkSheet): that address, it opens the property
              <View testID="draw-place" style={{ flexShrink: 1 }}>
                <Button label={addr.address} icon="pin" size="sm" variant="ghost" onPress={() => router.push(`/property/${addr.id}`)} />
              </View>
            ) : inStore && !leadId && !inStore.propertyId ? (
              <View testID="draw-to-lead" style={{ flexShrink: 1 }}>
                <Button label={t("mod.gutters.draw.toLead")} icon="plus" size="sm" variant="secondary" onPress={() => setLinkSheet(true)} />
              </View>
            ) : (
              <T v="heading" w="semibold">{t("mod.gutters.draw.title")}</T>
            )}
            {/* no cloud when all is saved and sent: only «on the phone» (not sent yet / no connection), a tap says it in words (#507 → #1274) */}
            {canSave && !flat && (mark === "sending" || mark === "phone") ? (
              <View testID="draw-local">
                <IconButton icon={SAVE_ICON[mark]} label={t(`mod.gutters.draw.save.${mark}`)} onPress={() => toast.show(t(`mod.gutters.draw.save.${mark}`))} />
              </View>
            ) : null}
          </View>
          <View testID="draw-fit"><IconButton icon="expand" label={t("mod.gutters.draw.fit")} onPress={() => size.w && setView(fit(drawing, size))} /></View>
          {mPhotos && !wide && !flat ? (
            <View testID="draw-photos-open">
              <Press onPress={() => setPhotoSheet(true)} accessibilityRole="button" accessibilityLabel={t("mod.gutters.photo.open")} visibleHeight={sizes.hitMin} style={{ flexDirection: "row", alignItems: "center", gap: space[1], minHeight: sizes.hitMin, paddingHorizontal: space[1] }}>
                <Icon name="camera" s={sizes.iconMd} color={c.ink} />
                {photoN ? <T v="caption" w="semibold">{photoN}</T> : null}
              </Press>
            </View>
          ) : null}
          {canSave && !flat ? (
            <View ref={whoRef} collapsable={false} testID="draw-who">
              <IconButton icon="more" label={t("mod.gutters.draw.whoMenu")} onPress={() => whoRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setWhoAt({ x, y, w, h }))} />
            </View>
          ) : null}
          {inStore ? (
            <View testID="draw-done"><Button label={t("mod.gutters.view.done")} size="sm" onPress={() => void done()} /></View>
          ) : null}
        </RowView>
        {canSave ? null : (
          <View testID="draw-not-saved" style={{ gap: space[2], padding: space[3], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: component.hairline, borderColor: c.bd }}>
            <StatusChip status="warn" label={t("mod.gutters.draw.notSaved")} />
            <T v="caption">{t(access === "expired" ? "mod.gutters.draw.expired" : "mod.gutters.draw.off")}</T>
            <RowView style={{ flexWrap: "wrap", gap: space[2] }}>
              <Button label={t("mod.gutters.draw.connect")} variant="secondary" onPress={() => router.push("/company/modules")} />
              {/* past the trial a draft opens for reading — its photos too (founder О2) */}
              {mPhotos && !wide ? (
                <View testID="draw-photos-open">
                  <Button label={t("mod.gutters.photo.open")} icon="camera" size="sm" variant="ghost" onPress={() => setPhotoSheet(true)} />
                </View>
              ) : null}
            </RowView>
          </View>
        )}
        {/* the toolbar stuck to the top (founder 09.11): under the header */}
        {at === "top" && !flat ? <View pointerEvents="box-none" style={{ alignItems: grow ? "stretch" : "center" }}>{tools}</View> : null}
      </View>

      {!drawing.runs.length && !ghost ? (
        <View pointerEvents="none" style={{ position: "absolute", left: space[6], right: space[6] + panelSide, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }} testID="draw-empty">
          <T tone="mut" center>{t("mod.gutters.draw.empty")}</T>
          {/* the tools carry pictures only (#1274): where their words are, said while the drawing is still empty (the first opening) */}
          <T v="caption" tone="mut" center>{t("mod.gutters.draw.emptyTools")}</T>
        </View>
      ) : null}
      {/* the live length beside the line being drawn (founder 09.11, #689), not at the top of the screen */}
      {gA && gB ? (
        <View
          pointerEvents="none"
          testID="draw-ghost-len"
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width !== ghostChip.w || height !== ghostChip.h) setGhostChip({ w: width, h: height });
          }}
          style={{ position: "absolute", opacity: ghostChip.w ? 1 : 0, ...ghostChipAt(gA, gB, ghostChip, { w: size.w, h: size.h, top: ins.top + space[8] + space[6] }, dt.labelGap + dt.runWSel) }}
        >
          <StatusChip status="neutral" label={fmtLen(ghostLen, ch.lenFormat)} />
        </View>
      ) : null}

      {/* the angle beside a free end being swung (#818): «90°» when it is held at a step */}
      {swing && view ? <SwingChip swing={swing} view={view} box={{ w: size.w, h: size.h, top: ins.top + space[8] + space[6] }} gap={dt.labelGap + dt.runWSel} /> : null}

      {/* bottom: the toolbar (bottom / right hand / left hand) and the $ — always at the bottom */}
      {/* where the toolbar sticks if let go now (founder 09.11): that edge outlined */}
      {gripping && dropAt ? (
        <View
          pointerEvents="none"
          testID={`draw-drop-${dropAt}`}
          style={{
            position: "absolute",
            borderWidth: dt.runW / 2,
            borderStyle: "dashed",
            borderColor: c.ink,
            borderRadius: radius.card,
            ...(dropAt === "bottom" ? { left: ins.left + space[2], right: ins.right + space[2] + panelSide, bottom: ins.bottom + space[2], height: space[8] * 3 } : {}),
            ...(dropAt === "top" ? { left: ins.left + space[2], right: ins.right + space[2] + panelSide, top: ins.top + space[2], height: space[8] * 3 } : {}),
            ...(dropAt === "left" ? { left: ins.left + space[2], top: ins.top + space[2], bottom: ins.bottom + space[2], width: space[8] * 3 } : {}),
            ...(dropAt === "right" ? { right: ins.right + space[2] + panelSide, top: ins.top + space[2], bottom: ins.bottom + space[2], width: space[8] * 3 } : {}),
          }}
        />
      ) : null}
      <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingLeft: ins.left + space[3], paddingRight: ins.right + space[3] + panelSide, paddingBottom: ins.bottom + space[3], gap: space[2] }}>
        {gripping ? (
          <View pointerEvents="none" testID="draw-grip-hint" style={{ alignSelf: "center", paddingVertical: space[2], paddingHorizontal: space[3], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: component.hairline, borderColor: c.bd }}>
            <T v="caption" w="semibold" center>{t("mod.gutters.draw.gripHint")}</T>
          </View>
        ) : null}
        {hintText && !gripping ? (
          <View pointerEvents="none" testID="draw-hint" style={{ alignSelf: "center", paddingVertical: space[2], paddingHorizontal: space[3], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: component.hairline, borderColor: c.bd }}>
            <T v="caption" w="semibold" center>{hintText}</T>
          </View>
        ) : null}
        {flat || at === "top" ? null : <View pointerEvents="box-none" style={{ alignItems: at === "bottom" ? (grow ? "stretch" : "center") : at === "right" ? "flex-end" : "flex-start" }}>{tools}</View>}
        <View pointerEvents="box-none" style={flat ? { flexDirection: at === "left" ? "row-reverse" : "row", alignItems: "flex-end", gap: space[2] } : undefined}>
        {/* the summary chip (#1274, founder 12.11: «строки выбора нет — маленькая полупрозрачная плашка-сводка в нижнем углу», over the drawing, no row of its own):
            what is picked, else «Дальше: водостоки», else the totals; a tap opens the measurement's «Просмотр» (the materials and the sum) */}
        {summary && !gripping && !flat ? (
          <View pointerEvents="box-none" style={{ alignItems: "flex-start" }}>
            <Press
              testID="draw-summary"
              // «Дальше: водостоки» is a hint with its action (the downspout tool); the rest opens the measurement's «Просмотр»
              onPress={() => { if (summary.kind === "nextDs") pick("ds"); else if (inStore) router.push(`${moduleHref("gutters", "view")}?m=${encodeURIComponent(inStore.id)}`); }}
              disabled={!canSave || (summary.kind !== "nextDs" && !inStore)}
              visibleHeight={sizes.hitMin}
              accessibilityRole="button"
              accessibilityLabel={summaryA11y}
              style={{ minHeight: sizes.hitMin, flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[3], borderRadius: radius.pill, backgroundColor: c.ov, borderWidth: component.hairline, borderColor: c.bd }}
            >
              {summary.kind === "selected" ? (
                <View testID="draw-selected" style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                  {summary.dsIcon ? <View testID="draw-selected-kind"><Icon name={summary.dsIcon} s={sizes.iconSm} color={c.ink} /></View> : null}
                  <T v="caption" w="semibold" numberOfLines={1}>{summary.text}</T>
                </View>
              ) : summary.kind === "nextDs" ? (
                <View testID="draw-next" style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                  <Icon name={lineIcon} s={sizes.iconSm} color={c.ink} />
                  <T v="caption" w="semibold">{`${summary.gutterFt}′`}</T>
                  <T v="caption" tone="mut">{t("mod.gutters.draw.nextDsShort")}</T>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                  <Icon name={lineIcon} s={sizes.iconSm} color={c.ink} />
                  <T v="caption" w="semibold">{`${summary.gutterFt}′`}</T>
                  <T v="caption" tone="mut">·</T>
                  <Icon name={dsIcon} s={sizes.iconSm} color={c.ink} />
                  <T v="caption" w="semibold">{`${summary.dsCount} · ${summary.pipeFt}′`}</T>
                </View>
              )}
            </Press>
          </View>
        ) : null}
        {flat ? tools : null}
        </View>
      </View>

      {/* 820/1280: the panel on the right (what is picked, or how to pick); 390: the sheet from «Свойства» */}
      {wide ? (
        <View testID="draw-panel" style={{ position: "absolute", right: ins.right + space[3], top: ins.top + space[2], bottom: ins.bottom + space[3], width: component.panelW, padding: space[3], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: component.hairline, borderColor: c.bd, gap: space[2] }}>
          {attrs ? (
            <>
              <RowView style={{ justifyContent: "flex-end" }}>
                <View testID="draw-panel-close"><IconButton icon="close" label={t("mod.gutters.attr.close")} onPress={() => setSelected(null)} /></View>
              </RowView>
              <AttrBody>{attrs}</AttrBody>
            </>
          ) : (
            <View style={{ flex: 1, gap: space[4] }}>
              {mPhotos}
              <View testID="draw-panel-empty" style={{ flex: 1, justifyContent: "center" }}>
                <T tone="mut" center>{t("mod.gutters.attr.none")}</T>
              </View>
            </View>
          )}
        </View>
      ) : null}
      <Sheet visible={!wide && sheet && !!attrs} onClose={() => setSheet(false)}>
        <AttrBody inSheet>{attrs}</AttrBody>
      </Sheet>
      {m ? <LinkSheet visible={linkSheet} onClose={() => setLinkSheet(false)} measurementId={m.id} /> : null}
      <Menu visible={!!whoAt} anchor={whoAt} items={whoItems} onSelect={onWho} onClose={() => setWhoAt(null)} />
      <InputWindow visible={canSave && !!editRun} onClose={() => setLenEdit(null)}>
        {editRun ? <QuickLength key={editRun.id} fmt={ch.lenFormat} run={editRun} start={runLengthIn(editRun)} onLength={(n) => commit(setLength(cur.current.drawing, editRun.id, n))} onDone={() => setLenEdit(null)} onCancel={() => setLenEdit(null)} /> : null}
      </InputWindow>
      <InputWindow visible={canSave && !!quick} onClose={cancelQuick}>
        {quick ? <QuickLength fmt={ch.lenFormat} run={quick} onLength={(n) => commit(setLength(cur.current.drawing, quick.id, n))} onDone={() => setQuickRun(null)} onCancel={cancelQuick} /> : null}
      </InputWindow>
      <Sheet visible={canSave && !!corner} onClose={() => setCornerSheet(null)}>
        {corner ? (
          <View testID="corner-sheet" style={{ gap: space[3] }}>
            <T v="heading" w="semibold">{t("mod.gutters.draw.cornerTitle")}</T>
            {corner.kind === "bay" ? <T tone="mut">{t("mod.gutters.draw.cornerBay")}</T> : null}
            <View testID="corner-kind">
              <ChoiceChips
                items={(["out", "in"] as const).map((k) => ({ key: k, label: t(k === "in" ? "mod.gutters.attr.ck.in" : "mod.gutters.attr.ck.out") }))}
                value={corner.kind === "in" ? "in" : "out"}
                onChange={(k) => cornerKind(k)}
              />
            </View>
            {corner.kind === "in" ? (
              <RowView style={{ gap: space[3], justifyContent: "space-between" }}>
                <T v="body" style={{ flex: 1 }}>{t("mod.gutters.draw.splash")}</T>
                <View testID="corner-splash"><Toggle on={!splashOff(drawing, corner)} onChange={(on) => commit(setCornerSplash(cur.current.drawing, corner, on))} label={t("mod.gutters.draw.splash")} /></View>
              </RowView>
            ) : null}
            <T v="caption" tone="mut">{t("mod.gutters.draw.cornerNote")}</T>
            {/* the cut (founder 08.11): each run along the wall and along the face, to 1/16″ */}
            {cut ? (
              <View testID="corner-cut" style={{ gap: space[2] }}>
                <RowView style={{ justifyContent: "space-between" }}>
                  <T v="body" w="semibold">{t("mod.gutters.draw.cutTitle")}</T>
                  <View testID="corner-cut-angle"><T v="caption" tone="mut">{t("mod.gutters.draw.cutAngle", { deg: cut.angleDeg })}</T></View>
                </RowView>
                {cut.runs.map((r) => (
                  <View key={r.id} testID={`corner-cut-${r.id}`} style={{ gap: space[1], padding: space[3], borderRadius: radius.card, borderWidth: component.hairline, borderColor: c.bd }}>
                    <T v="caption" w="semibold">{t("mod.gutters.draw.cutRun", { n: drawing.runs.findIndex((x) => x.id === r.id) + 1 })}</T>
                    <RowView style={{ justifyContent: "space-between" }}>
                      <T v="caption" tone="mut">{t("mod.gutters.draw.cutBack")}</T>
                      <View testID="cut-back"><T v="body" tabular>{fmtLen(r.backIn, ch.lenFormat)}</T></View>
                    </RowView>
                    <RowView style={{ justifyContent: "space-between" }}>
                      <T v="caption" tone="mut">{t("mod.gutters.draw.cutFront")}</T>
                      <View testID="cut-front"><T v="body" w="semibold" tabular>{fmtLen(r.frontIn, ch.lenFormat)}</T></View>
                    </RowView>
                  </View>
                ))}
                {!tape ? <View testID="corner-cut-rough"><StatusChip status="warn" label={t("mod.gutters.draw.accRoughCut")} soft /></View> : null}
                <View onLayout={(e) => setSketchW(e.nativeEvent.layout.width)}>
                  {sketchW > 0 ? <CornerSketch d={drawing} f={corner} cut={cut.runs} w={sketchW} fmt={ch.lenFormat} /> : null}
                </View>
                <T v="caption" tone="mut">{t("mod.gutters.draw.cutNote", { off: cut.runs[0]!.offsetIn })}</T>
              </View>
            ) : null}
            {/* «Разъединить угол» (#933): two gutters with their own end caps; «Назад» and the toast bring it back */}
            <View testID="corner-split">
              <Button
                label={t("mod.gutters.draw.cornerSplit")}
                variant="secondary"
                size="sm"
                onPress={() => {
                  const before = cur.current.drawing;
                  const next = splitCorner(before, corner, tolIn());
                  setCornerSheet(null);
                  if (next === before) return;
                  commit(next, before);
                  toast.show(t("mod.gutters.draw.cornerSplit.done"), localUndo(() => commit(before, cur.current.drawing, true))); // put back as it was: no recount (#1264)
                }}
              />
            </View>
            {<CornerTriangle key={corner.id} d={drawing} f={corner} onAngle={(deg) => commit(setCornerAngle(cur.current.drawing, corner, deg))} />}
          </View>
        ) : null}
      </Sheet>
      <Sheet visible={moreSheet !== null} onClose={() => setMoreSheet(null)}>
        <View testID="draw-more-sheet" style={{ gap: space[2] }}>
          {/* how it was measured — one choice for the whole drawing (founder 08.11, П20.16) */}
          {moreSheet === "acc" && canSave && m ? (
            <View testID="draw-accuracy-pick" style={{ gap: space[1] }}>
              <T v="caption" tone="mut">{t("mod.gutters.draw.accTitle")}</T>
              <ChoiceChips
                items={(["rough", "tape"] as const).map((a) => ({ key: a, label: t(a === "tape" ? "mod.gutters.draw.accTape" : "mod.gutters.draw.accRough") }))}
                value={tape ? "tape" : "rough"}
                onChange={(a) => setAccuracy(a)}
              />
              <View testID="draw-accuracy-hint"><T v="caption" tone="mut">{t("mod.gutters.draw.accHint")}</T></View>
            </View>
          ) : null}
          {moreSheet === "layers" ? (
            <View testID="draw-layers" style={{ gap: space[2] }}>
              <T v="heading">{t("mod.gutters.draw.layersTitle")}</T>
              {(["grid", "labels", "ds"] as const).map((l) => (
                <RowView key={l} style={{ gap: space[3], justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <T v="body">{t(`mod.gutters.draw.layer.${l}`)}</T>
                    {l === "ds" ? <T v="caption" tone="mut">{t("mod.gutters.draw.layer.dsHint")}</T> : null}
                  </View>
                  <View testID={`draw-layer-${l}`}><Toggle on={layers[l]} onChange={(on) => toggleLayer(l, on)} label={t(`mod.gutters.draw.layer.${l}`)} /></View>
                </RowView>
              ))}
              <View testID="draw-layers-hint"><T v="caption" tone="mut">{t("mod.gutters.draw.layersHint")}</T></View>
            </View>
          ) : null}
          {moreSheet === "place" ? (
            <>
              <T v="caption" tone="mut">{t("mod.gutters.draw.placeTitle")}</T>
              {TOOLBAR_PLACES.map((p) => (
                <View key={p} testID={`draw-place-${p}`}>
                  <ListRow title={t(`mod.gutters.draw.place.${p}`)} left={<Icon name={p === place ? "check" : "sliders"} s={sizes.iconMd} color={p === place ? c.ink : c.mut} />} onPress={() => pickPlace(p)} />
                </View>
              ))}
            </>
          ) : null}
        </View>
      </Sheet>
      <Sheet visible={!wide && photoSheet && !!mPhotos} onClose={() => setPhotoSheet(false)}>
        {mPhotos}
      </Sheet>
    </View>
  );
}
