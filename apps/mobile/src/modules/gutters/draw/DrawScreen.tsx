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
import { canvasUnsaved, unsentAfter } from "./unsent";
import { registerDirtySheet } from "@/ui/dirtySheets";
import { sizeText } from "../sizeText";
import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { Redirect, router, Stack, useLocalSearchParams, type Href } from "expo-router";
import * as Crypto from "expo-crypto";
import Svg, { Line } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "react-native-reanimated";
import { GestureDetector, usePanGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import { computeGutterParts } from "@octo/estimating-engine";
import { breakpoint, component, drawing as dt, motion, radius, size as sizes, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { moduleHref, moduleState, moduleUsable } from "@/modules/registry";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { Button, ChoiceChips, IconButton, StatusChip, Toggle } from "@/ui/controls";
import { Icon, Press, T, type IconKey } from "@/ui/primitives";
import { HelpButton, Menu, Sheet, useToast } from "@/ui/overlays";
import { EmptyHelp, helpText } from "./EmptyHelp";
import { Banner } from "@/ui/banner";
import { ListRow, RowView } from "@/ui/surfaces";
import { useHideTabBar } from "@/nav/tabBarHide";
import { goTo } from "@/nav/go";
import { setFooterInset, setToastRight } from "@/ui/footerInset";
import { fillStyle } from "@/ui/fill";
import { CanvasView, useCanvasGestures, useLive } from "../canvas/CanvasView";
import { isDoubleTap, tapRule, type LastTap } from "../canvas/doubleTap";
import { blinkPlan, dimAt } from "../canvas/dsBlink";
import { deleteTarget, hasCap, type PickedEnd } from "../canvas/endPick";
import { adopt, dsFor, likeElement, newDirty, patchDs, patchRun, pruneStored, readDefaults, resetKind, runFor, storeDefaults, type NewDefaults } from "../canvas/toolDefaults";
import { ToggleRow } from "@/ui/toggleRow";
import { CornerSheet } from "./CornerSheet";
import { EndSheet } from "./EndSheet";
import { autoDownspouts, autoManaged, commitAuto, refillChain, shortChains } from "../canvas/autoDs";
import { type Lift, liftTarget, addDownspout, cornerTick, drawSnap, drawTick, pullTick, withoutDs, alongAxis, endAt, finishStroke, flipFace, moveDs, cornerMovable, grabbedCorner, grabbedEnd, HELD_ORIGINAL, moveCorner, sameDirection, swingEnd, splitCorner, setCapOff, setCornerAngle, setCornerSplash, hitTest, onCornerPoint, lineRefused, moveEnd, pushHistory, redo, removeElement, restoreRemoved, setCornerMethod, setDsAttrs, setLength, setRunAttrs, startAt, undo, type History, type Stroke } from "../canvas/edit";
import { holdBegin, holdCancel, holdFire, holdMove, holdIsTap, type Hold } from "../canvas/holdLift";
import { dsKindOf, PROFILE_ICON, type DsAttrs, type RunAttrs } from "../canvas/attrs";
import type { GutterProfile } from "@octo/estimating-engine";
import { CornerSketch, CornerTriangle } from "./CornerSketch";
import { ghostChipAt } from "./ghostChip";
import { haptics } from "@/ui/haptics";
import { SAVE_ICON, saveMark } from "./saveMark";
import { InputWindow } from "./InputWindow";
import { AttrBody, DsAttrsView, QuickLength, RunAttrsView, WinButtons, type RunCorner } from "./AttrPanel";
import { winDirty, winDiscard, winSave, winStartOn, type WinStart } from "./winDraft";
import { useConfirm } from "@/ui/confirmDialog";
import { MeasurePhotos } from "./Photos";
import { fmtLen } from "../canvas/format";
import { dropHaptic, forgetOldDraft, loadToolbarPlace, placeAt, saveToolbarPlace, type ToolbarPlace } from "../canvas/localStore";
import { makeModuleStore } from "../canvas/moduleStore";
import { gutterData, measurementOf, photosOf, relink } from "../data";
import { makeSaver } from "../canvas/draftStore";
import { onAppLeave } from "@/data/appActive";
import { LinkSheet } from "./LinkSheet";
import { summaryOf } from "./summary";
import { fromElements, toElements, type MeasurementRow } from "../canvas/model";
import { choicesFor, readRules, toRulesOverride } from "../settings";
import { autoFitView, buildScene, fitView, manyStories, nextStoryOf, storyOf, toPlan, toScreen, zoomLimits, type Insets, type Scene, type Story, type View as PlanView } from "../canvas/scene";
import { DS_MARK_R, LABEL_FONT, SvgPainter } from "../canvas/SvgPainter";
import { GridLayer } from "../canvas/GridLayer";
import { useJsGestureConfig } from "../canvas/jsGestureConfig";
import { listPreview, partName } from "../prices";
import { clientLangOf, deleteBlock, estimateAction, estimateOfMeasurement, estimatesOn, makeEstimate, removeMeasurementDetached } from "../estimateLink";
import { DeleteMeasurementSheet, NO_ESTIMATES } from "../view/DeleteMeasurementSheet";
import type { ModuleEstimateStore } from "@/modules/registry";
import { tFor } from "@/i18n/translate";
import { cornerChoiceOf, cornerCut, findCorners, capSide, houseSides, splashOff, runEnds, runLengthIn, toMeasurement, withoutDuplicates, type CornerChoice, type Drawing, type FoundCorner, type P } from "../geometry";
import { localUndo, type GuardedUndo } from "@/data/undo";

type Tool = "line" | "ds";
/** a finger's reach on the glass, whatever the zoom: half the 44 pt touch target */
const FINGER = sizes.hitMin / 2;

/** a window opened BY a tap waits `durFast`: the `click` the browser sends after the touch — late on a busy page — must not land in it (see the tap handler) */
const afterTap = (f: () => void) => setTimeout(f, motion.durFast);
/** the width of a magnet's window across a ray, in the finger's pixels (a quarter of a hit target; plan inches = px ÷ scale, #818) */
const SNAP_PX = sizes.hitMin / 4;
/** a tap this soon after a two-finger gesture began or ended is not a tap */
const MULTI_TAP_MS = motion.durSlow * 2;
const SAVE_AFTER_MS = 1000;
const EMPTY: Drawing = { runs: [], downspouts: [] };

/** the name in the header (#1274): a button that SHRINKS — a long name is cut (not linked yet — «Привязать», DS §19а, #1665: whole at 390) with «…» in its own width, never under the icons beside it */
function NameButton({ icon, label, onPress, filled }: { icon?: IconKey; label: string; onPress: () => void; filled?: boolean }) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label} visibleHeight={component.button.phone} containerStyle={{ flexShrink: 1, minWidth: 0 }}
      style={{ height: component.button.phone, flexShrink: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space[1], paddingHorizontal: space[3], borderRadius: radius.pill, backgroundColor: filled ? c.surf2 : "transparent", borderWidth: filled ? 1 : 0, borderColor: c.bd }}>
      {icon ? <Icon name={icon} s={sizes.iconSm} color={c.ink} /> : null}
      <T v="button" w="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>{label}</T>
    </Press>
  );
}

/** one cell of the canvas toolbar (spec 33 П20.8; #1274, founder 12.11: «без длинных надписей, значки»): a 36 circle (44 to touch, rule 3), ONLY the picture —
 *  its word is read aloud (`accessibilityLabel`), shown on the web by `title`, and written over it on a long press (`ToolHint`, a bubble for a moment).
 *  `body` replaces the icon (the storey: «Эт N» in its colour) */
function ToolCell({ icon, body, label, a11y, active, onPress, ring, grow, disabled, dim, below }: { icon?: IconKey; body?: string; label: string; a11y?: string; active?: boolean; onPress: () => void; ring?: string; grow?: boolean; /** nothing to act on (the bin without a pick): muted, no action — but the long press still says its name */ disabled?: boolean; /** looks off, still answers a tap (it says why): the muted look of `disabled` without the lock */ dim?: boolean; /** the toolbar is at the top: the caption goes under it */ below?: boolean }) {
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
      onPress={disabled ? () => {} : onPress}
      onLongPress={showTip}
      delayLongPress={motion.longPressMs}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      // a tool is a toggle: the web says «pressed» (accessibilityState.selected is not rendered on a button there)
      {...({ title: label, ...(active !== undefined ? { "aria-pressed": !!active } : {}) } as object)}
      containerStyle={grow ? { flex: 1 } : undefined}
      style={{ alignItems: "center", minWidth: sizes.hitMin }}
    >
      {/* DS §19а (#1426): the chosen tool is the ONLY filled circle of the bar — inverted (ink + shadow-sm, the icon in bg); the other tool —
          no fill, mut; the actions (↶ ↷ 🗑) — the icon alone in ink, as an iOS toolbar; the bin with nothing picked — dimOpacity; the
          storey — its colour ring, no fill. Never acc: yellow is the screen's main action */}
      <View
        style={[
          { minWidth: s, height: s, paddingHorizontal: body ? space[2] : 0, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
          // the chosen tool: inverted — an ink circle, the icon in the background's colour (DS §19а: the most visible thing of the bar,
          // in the sun too; surf2 was 1.07:1 to the bar in the light theme and the storey's ring looked chosen instead)
          active ? [fillStyle(c), { backgroundColor: c.ink }] : ring ? { borderWidth: dt.runW / 2, borderColor: ring } : null,
          disabled ? { opacity: component.dimOpacity } : null,
        ]}
      >
        {body ? <T v="caption" center w="semibold">{body}</T> : icon ? <Icon name={icon} s={sizes.iconMd} color={active ? c.bg : active === false || dim ? c.mut : c.ink} /> : null}
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
const dsSizeText = sizeText; // one format everywhere (#1916)

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

/** the look of the summary chip (not glass: the overlay colour and a hairline, DS «Экран-холст») */
const SUMMARY_CHIP = (c: { ov: string; bd: string }) => ({ height: component.button.phone, flexDirection: "row" as const, alignItems: "center" as const, gap: space[2], paddingHorizontal: space[3], borderRadius: radius.pill, backgroundColor: c.ov, borderWidth: component.hairline, borderColor: c.bd });

/** «86′ · Дальше: водостоки» — the hint with its action */
function NextDsLine({ gutterFt, icon, text }: { gutterFt: number; icon: IconKey; text: string }) {
  const { c } = useTheme();
  return (
    <View testID="draw-next" style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
      <Icon name={icon} s={sizes.iconSm} color={c.ink} />
      <T v="caption" w="semibold">{`${gutterFt}′`}</T>
      <T v="caption" tone="mut">{text}</T>
    </View>
  );
}

/**
 * #2273: an old link «Смета из замера» to the canvas (estimate=1 with a measurement) goes to the review at once — the canvas never
 * mounts (it used to draw a frame, then replace itself). The review finds the measurement or says it is not there.
 */
export default function DrawScreen() {
  const params = useLocalSearchParams<{ m?: string; estimate?: string }>();
  if (params.estimate === "1" && typeof params.m === "string" && params.m)
    return <Redirect href={`${moduleHref("gutters", "view")}?m=${encodeURIComponent(params.m)}&estimate=1` as Href} />;
  return <DrawCanvas />;
}

function DrawCanvas() {
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
  /** who deletes a measurement (#2013: a tech changes only the estimates he made) */
  const who = { role: store.role, me: store.db.me };
  const params = useLocalSearchParams<{ m?: string; lead?: string; property?: string; estimate?: string }>();
  const ins = useSafeAreaInsets();
  const access = moduleState(store.db.company?.modules?.gutters).access;
  const canSave = moduleUsable(access);
  // what the company installs, its palette and defaults (settings M7b): new elements and the attribute panel
  const settings = store.db.company?.modules?.gutters?.settings;
  const ch = useMemo(() => choicesFor(settings), [settings]);
  // the company's rules and use (M7c) and its corner method: the $ under the drawing counts by them
  const rules = useMemo(() => ({ over: toRulesOverride(settings), corner: readRules(settings).corner }), [settings]);
  /** the downspouts it puts by itself (#1246): the company's setting — one per `runPerDsFt` of chain, `dsEdgeIn` from the end */
  const autoDs = useMemo(() => { const r = readRules(settings); return r.dsAuto ? { spacingIn: r.runPerDsFt * 12, edgeIn: r.dsEdgeIn } : null; }, [settings]);

  const [drawing, setDrawing] = useState<Drawing>(EMPTY);
  const [hist, setHist] = useState<History>({ past: [], future: [] });
  const histRef = useRef(hist);
  histRef.current = hist;
  /** the properties window's draft (DS §7.3, winDraft.ts): the drawing and history before its first edit; null — no edit in it yet */
  const [winDraft, setWin] = useState<WinStart>(null);
  const winRef = useRef<WinStart>(null);
  /** a commit that comes from the window (its edits stay one draft); any other commit keeps the window's edits as they are */
  const inWin = useRef(false);
  const [m, setM] = useState<MeasurementRow | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);
  const [tool, setTool] = useState<Tool>("line");
  const [story, setStoryN] = useState<Story>(1);
  const [selected, setSelected] = useState<string | null>(null);
  /** a cap picked on its own (#1855): the gutter is `selected`, this end its picked cap; gone when another thing is picked */
  const [pickedEnd, setPickedEnd] = useState<PickedEnd>(null);
  useEffect(() => { if (pickedEnd && pickedEnd.id !== selected) setPickedEnd(null); }, [selected, pickedEnd]);
  /** a corner picked (#3066, spec 33-canvas-ui §3 «нажатие — выбрать угол»): the corner, not its gutter — nothing else is `selected` then */
  const [pickedCorner, setPickedCorner] = useState<string | null>(null);
  useEffect(() => { if (selected && pickedCorner) setPickedCorner(null); }, [selected, pickedCorner]);
  // the drawing changed (a gutter drawn, an end pulled, the length set): what is picked is the gutter, not its cap — the lift of a
  // stroke on the web is a tap on its end
  const drawnAt = useRef<{ d: unknown; at: number }>({ d: null, at: 0 });
  useEffect(() => {
    if (drawnAt.current.d === drawing) return;
    drawnAt.current = { d: drawing, at: Date.now() };
    setPickedEnd(null);
  }, [drawing]);
  const [place, setPlace] = useState<ToolbarPlace>("bottom");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<PlanView | null>(null);
  const [ghost, setGhost] = useState<{ a: P; b: P } | null>(null);
  const [ghostChip, setGhostChip] = useState({ w: 0, h: 0 });
  // a free end being swung (#818): the standing end, the end under the finger and the angle between — the chip beside it
  const [swing, setSwing] = useState<{ a: P; b: P; deg: number } | null>(null);
  /** 390: the attribute sheet is open (820/1280 show the panel whenever something is picked) */
  const [sheet, setSheet] = useState(false);
  /** the properties of NEW gutters / downspouts of this drawing (#1563 PR B): set by two taps on a tool; none — the company's defaults */
  const [newDef, setNewDef] = useState<NewDefaults>({});
  /** «Новые желоба» / «Новые водостоки» open (a sheet on the phone, the side column wider) */
  const [newSheet, setNewSheet] = useState<Tool | null>(null);
  /** the window «Новые …» edits a draft; «Сохранить» makes it the drawing's, «Закрыть» drops it (#2987: one window, one way to save) */
  const [newDraft, setNewDraft] = useState<NewDefaults | null>(null);
  /** «Новые — так же» in a gutter's / downspout's own window (#2987): on «Сохранить» the next ones are drawn like it */
  const [alsoNew, setAlsoNew] = useState(false);
  /** 390: the sheet of the measurement's photos */
  const [photoSheet, setPhotoSheet] = useState(false);
  /** «Ещё»: «Вернуть» and where the toolbar sits — rare, off the main row (П20.8) */
  // «⋯» → «Слои» (the place of the toolbar is by its grip since #2156; «Точность замера» gone, #1764)
  const [moreSheet, setMoreSheet] = useState<"acc" | "layers" | null>(null);
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
  // «Конец желоба» (a double tap on a free end, #1273): the run and its end
  const [endSheet, setEndSheet] = useState<{ id: string; end: 0 | 1 } | null>(null);
  // the last tap on the canvas: a second one on the same object inside `motion.doubleTapMs` is a double tap (spec 33 §3); a single tap never waits for it
  const lastTap = useRef<LastTap | null>(null);
  // the window a double tap is about to open (`afterTap`): gone with the screen and with the tool
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (openTimer.current) clearTimeout(openTimer.current); }, []);
  useEffect(() => { if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; } }, [tool]);
  /** a downspout just put blinks, then its sheet opens (#1763, DS §19а): `motion.blinkSteps` beats of `motion.blinkStepMs` (≈0.5 s), the
   *  order and time are `blinkPlan` (canvas/dsBlink.ts, unit-tested); `dim` — its off beat. Reduce motion: no blink, the sheet at once */
  const [fresh, setFresh] = useState<string | null>(null);
  const [dim, setDim] = useState(false);
  const reduce = useReducedMotion();
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;
  // the sheet of the downspout just put, waiting for its blink to end: any next tap, a tool change or leaving the screen cancels it
  const sheetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropSheetTimer = () => { if (sheetTimer.current) { clearTimeout(sheetTimer.current); sheetTimer.current = null; } };
  useEffect(() => dropSheetTimer, []);
  useEffect(dropSheetTimer, [tool]);
  useEffect(() => {
    const plan = blinkPlan(reduce);
    if (!fresh || !plan.steps) return setFresh(null);
    let n = 0;
    setDim(dimAt(0));
    const iv = setInterval(() => {
      n += 1;
      if (n >= plan.steps) {
        clearInterval(iv);
        setDim(false);
        setFresh(null);
      } else setDim(dimAt(n));
    }, plan.stepMs);
    return () => { clearInterval(iv); setDim(false); };
  }, [fresh, reduce]);
  /** the hint of the tool just picked; gone after the first thing done with it (П20.8) */
  const [hint, setHint] = useState<Tool | "select" | "move" | null>(null);
  const live = useLive();
  const viewNow = view ?? NO_VIEW;
  // pan with two fingers and pinch: they run together with the one-finger draw and tap below (a second finger
  // cancels the stroke — founder 09.11: the pinch never came once the first finger had moved)
  // the limits of the scale (#1281): the whole drawing in a quarter of the screen at the farthest, 1″ as big as a finger's target at the nearest
  const zoomLim = useMemo(() => zoomLimits(drawing.runs.flatMap((r) => [r.a, r.b]), size.w > 0 ? size : { w: 390, h: 844 }, space[8], sizes.hitMin), [drawing.runs, size]);
  /** a finger (or the mouse) touched the screen: from now the view is the person's, it never fits itself again (rule 27) */
  const touched = useRef(false);
  const onTouchView = useCallback((v: PlanView) => {
    touched.current = true;
    setView(v);
  }, []);
  // a pinch or a pan commits through `onTouchView`: the view is the person's even if the touch never reached the JS responder (#1667 review)
  const canvas = useCanvasGestures(viewNow, onTouchView, live, 2, { lim: zoomLim, viewport: size.w > 0 ? size : { w: 390, h: 844 }, onEdge: () => haptics.selection() });

  // the latest values for gesture callbacks and the delayed save
  const cur = useRef({ drawing, view, tool, story, selected, pickedCorner, m, canSave, ch, layers, autoDs, size, newDef });
  cur.current = { drawing, view, tool, story, selected, pickedCorner, m, canSave, ch, layers, autoDs, size, newDef };
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

  // «вписать» keeps the drawing clear of what lies over the canvas (#1667): the header on top, the toolbar and the summary
  // chips at the bottom, the toolbar at a side — measured below (`covers`), plus the old margin
  const coverRef = useRef<Insets>({ t: 0, r: 0, b: 0, l: 0 });
  const fit = useCallback((d: Drawing, s: { w: number; h: number }) => {
    const c = coverRef.current;
    // the old margin (room for the length labels beside a line) and one step more where something lies over the canvas, so a
    // label never touches the header, the toolbar or the chips (#1667 design review: it was 6–9 px off the toolbar)
    const g = space[8];
    const e = (x: number) => (x > 0 ? x + space[4] : 0);
    return fitView(d.runs.flatMap((r) => [r.a, r.b]), s, { t: e(c.t) + g, r: e(c.r) + g, b: e(c.b) + g, l: e(c.l) + g });
  }, []);

  const later = useRef<() => void>(() => {});
  // #1912: «Обновить» must not reload under a stroke or an unwritten change: while one lasts, this screen is a sheet with unsaved work
  const [touching, setTouching] = useState(false);
  const [unsent, setUnsent] = useState(false);
  const unsavedNow = canvasUnsaved({ touching, unsent });
  useEffect(() => {
    if (!unsavedNow) return;
    return registerDirtySheet({ ask: () => flushRef.current() });
  }, [unsavedNow]);
  const flushRef = useRef<() => void>(() => {});
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
    if (shown.current) setUnsent(true);
    void saver.flush(mm, toElements(d, mm.id)).then((r) => {
      if (shown.current) setUnsent(unsentAfter(r)); // #1912: a failed write stays «unsent» until it lands
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
  flushRef.current = flush;
  // a gesture ended: write 1 s later (the queue gets one write per gesture, not per movement — П14.2 №5)
  later.current = () => {
    if (timer.current) clearTimeout(timer.current);
    if (shown.current) setUnsent(true);
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
      const next = commitAuto(made, prev, placed, cur.current.canSave && cur.current.autoDs ? { ...cur.current.autoDs, attrs: dsFor(cur.current.ch, cur.current.newDef), ch: cur.current.ch, newId: () => Crypto.randomUUID() } : null);
      if (next === prev) return;
      // the program took automatic downspouts off because the chain wants fewer now (shorter, joined, split): say so, with «Отменить» (#1246)
      if (next !== made && next.downspouts.filter((x) => x.auto).length < made.downspouts.filter((x) => x.auto).length) {
        announceDs.current(next.downspouts.length, localUndo(() => commit(made, next, true)));
      }
      // a downspout put by the program must not stand unseen: the layer of downspouts is switched on (#1246 review)
      if (next.downspouts.length > prev.downspouts.length && !cur.current.layers.ds) setLayers((x) => ({ ...x, ds: true }));
      setHint(null);
      const w = inWin.current ? null : winRef.current;
      if (w) {
        // an edit beside the window (820/1280: the canvas under the open column): the window's edits are kept, as one step
        winRef.current = null;
        setWin(null);
        setHist(pushHistory(winSave(w, prev, histRef.current), prev));
      } else setHist((h) => pushHistory(h, prev));
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
  // made once (#1403): a new config on every render registered the gesture again, in the middle of a pinch too
  const pan = usePanGesture(useJsGestureConfig<NonNullable<Parameters<typeof usePanGesture>[0]>>({
    runOnJS: true,
    maxPointers: 1,
    simultaneousWith: [canvas.pinch, canvas.pan],
    onBegin: (e) => {
      setTouching(true);
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
      setTouching(false);
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
      const next = finishStroke(g, d, plan(e.x, e.y), tolIn(), e.canceled, { id, attrs: runFor(cur.current.ch, cur.current.story, cur.current.newDef) });
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
  }, [canvas.pinch, canvas.pan]));
  // a tap: the downspout tool puts one on the nearest run; otherwise pick what is under the finger
  const tap = useTapGesture(useJsGestureConfig<NonNullable<Parameters<typeof useTapGesture>[0]>>({
    runOnJS: true,
    simultaneousWith: [canvas.pinch, canvas.pan],
    onBegin: () => {
      liftTap.current = false;
    },
    onActivate: (e) => {
      dropSheetTimer(); // a tap after a downspout was put: its sheet does not open over what the tap does
      if (Date.now() - canvas.multiAt.current < MULTI_TAP_MS) { lastTap.current = null; return; } // the fingers of a pinch / two-finger pan lifting are not a tap (a pinch that ended over a length label opened its sheet)
      if (!holdIsTap(hold.current)) return; // a touch that picked something up (a hold) is not a tap: the release does not flip a cap or open a menu (#1272)
      const { drawing: d, tool: tl } = cur.current;
      const p = plan(e.x, e.y);
      // a tap on a label opens what it says (founder 09.11): a length → its length, a corner → the corner, the
      // fittings word over a downspout → its menu
      const lab = cur.current.canSave ? sceneRef.current?.labels.find((l) => Math.abs(e.x - l.x) <= l.w / 2 && Math.abs(e.y - l.y) <= l.h / 2) : undefined;
      // (the lift of a drag is a tap on the spot on the web: it opens no label it ended over — a downspout dragged under its own word, spec 170)
      if ((lab?.id.startsWith("len:") || lab?.id.startsWith("ds:")) && liftTap.current) return;
      if (lab?.id.startsWith("len:")) {
        setSelected(lab.id.slice(4));
        setLenEdit(lab.id.slice(4));
        return;
      }
      // (the lift of a drag of an end or a corner is a tap on the spot on the web: not a tap on its label, #818 review)
      if (lab?.id.startsWith("corner:") && liftTap.current) return;
      if (lab?.id.startsWith("corner:")) {
        setSelected(null);
        setPickedCorner(lab.id.slice(7));
        setCornerSheet(lab.id.slice(7));
        return;
      }
      if (lab?.id.startsWith("ds:")) {
        setSelected(lab.id.slice(3));
        setSheet(true);
        return;
      }
      // what is under the finger; a tap on a downspout that is there never puts a second one on top — with any tool it is the common rule
      // (#1563, founder 14.11: «если выбран даунспот — меню сразу, если жёлоб — надо два раза»): one tap picks, two open its properties
      const h = hitTest(withoutDs(d, !cur.current.layers.ds), p, tolIn());
      const found = h?.kind === "end" ? findCorners(d) : [];
      const corner = h?.kind === "end" ? found.find((f) => f.runs.some((x) => x.id === h.id && x.end === h.end)) : undefined;
      const key = !h ? "" : corner ? `corner:${corner.id}` : h.kind === "end" ? `end:${h.id}:${h.end}` : h.id;
      // the decision is `tapRule` (canvas/doubleTap.ts, unit-tested): one tap picks, two open — the same for every tool
      const tapped = tapRule({ tool: tl, onDs: h?.kind === "ds", lift: liftTap.current, key, id: h ? h.id : null, last: lastTap.current, now: Date.now(), windowMs: motion.doubleTapMs });
      lastTap.current = tapped.last;
      if (tapped.act.do === "ignore") return;
      if (tapped.act.do === "place") {
        const id = Crypto.randomUUID();
        const next = addDownspout(d, id, p, tolIn() * 1.5, dsFor(cur.current.ch, cur.current.newDef), cur.current.ch);
        if (next !== d) {
          commit(next);
          haptics.medium(); // set down on the gutter (DS §15.6)
          setSelected(id);
          setFresh(id);
          // its menu (founder 09.11): fittings, size, colour — on the phone a sheet, wider the side panel is open. Kept (founder 15.11,
          // README §12 п.20: «ставится одним нажатием на жёлоб, как сейчас — оставить»); after its blink, so the blink is seen (#1763)
          const at = blinkPlan(reduceRef.current).sheetAtMs;
          if (at > 0) sheetTimer.current = setTimeout(() => { sheetTimer.current = null; setSheet(true); }, at);
          else setSheet(true);
        }
        return;
      }
      if (h) setHint(null);
      // a tap picks AT ONCE and never waits for a second one (spec 33 §3, #1273); what used to happen on the spot — the corner's sheet on an end,
      // the flip of a cap — is the second tap's (a double tap on the same object inside `doubleTapMs`) or a row of its sheet
      // a free end: not a corner, not butted to another gutter — and one with «без заглушки» stays one (its sheet brings the cap back)
      const freeEnd = h?.kind === "end" && !corner && (!!d.runs.find((r) => r.id === h.id)?.noCap?.[h.end] || runEnds(d, found)[h.id]?.[h.end]?.kind !== "join");
      if (tapped.act.do === "pick") {
        // a tap on a corner picks the corner (#3066): a ring round its mark, the gutters stay as they are
        if (corner) {
          if (cur.current.pickedCorner !== corner.id) haptics.selection();
          setSelected(null);
          setPickedEnd(null);
          setPickedCorner(corner.id);
          return;
        }
        setPickedCorner(null);
        if ((h ? h.id : null) !== cur.current.selected) haptics.selection();
        setSelected(h ? h.id : null);
        // a tap on a free end with a cap picks the cap: 🗑 takes it off, not the gutter (#1855)
        // (not the lift of a drag: a gutter just drawn or an end just pulled is the gutter picked, its end under the finger is not a tap on the cap)
        setPickedEnd(h?.kind === "end" && freeEnd && !liftTap.current && Date.now() - drawnAt.current.at > motion.doubleTapMs && hasCap(d, h.id, h.end) ? { id: h.id, end: h.end } : null);
        return;
      }
      haptics.light();
      if (tapped.act.do === "fit") {
        if (cur.current.size.w) setView(fit(d, cur.current.size)); // two taps on the empty place: the whole drawing
        return;
      }
      if (tapped.act.do === "none" || !h) return;
      if (corner) {
        // the second tap on a corner: its sheet, the corner stays the picked one (#3066)
        setSelected(null);
        setPickedCorner(corner.id);
        if (openTimer.current) clearTimeout(openTimer.current);
        const cid = corner.id;
        openTimer.current = afterTap(() => {
          openTimer.current = null;
          if (cur.current.pickedCorner !== cid || cur.current.tool !== tl) return;
          setCornerSheet(cid);
        });
        return;
      }
      setSelected(h.id);
      if (!cur.current.canSave && h.kind === "end") return;
      // the window opens a moment later (`durFast`): the browser sends the tap's `click` after the touch ends, to whatever lies under the finger
      // then — a row of a window opened in the same beat would be pressed by the tap that opened it (the toast has the same guard,
      // `toastArmMs`; found by e2e 211)
      if (openTimer.current) clearTimeout(openTimer.current);
      const pickedId = h.id;
      openTimer.current = afterTap(() => {
        openTimer.current = null;
        // what was picked meanwhile or another tool: the tap that asked is no longer the person's wish
        if (cur.current.selected !== pickedId || cur.current.tool !== tl) return;
        if (freeEnd && h.kind === "end") setEndSheet({ id: h.id, end: h.end }); // (a corner opens above: #3066)
        else setSheet(true); // the run's (or a downspout's) properties: a sheet on the phone, wider the panel is already open
      });
    },
  }, [canvas.pinch, canvas.pan]));
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
            pickedCorner,
            lift: lifted,
            // О3: the colour is never the only sign — every run's label says its storey
            lenWithStory: true,
            dsPad: DS_MARK_R,
            dsText: (n) => t("mod.gutters.ds", { n }),
            storyText: (n) => t("mod.gutters.story", { n }),
            // only the angle between the walls, «135°» (founder 12.11, #1275): no «наруж./внутр./эркер» on the canvas; the kind and the guard are in the corner's sheet
            cornerText: (_kind, _splash, angleDeg) => `${angleDeg}°`,
            faceOff: dt.runW * 2,
            dimDs: dim ? fresh : null,
            layers,
          })
        : null,
    [drawing, view, size, selected, pickedCorner, t, dim, fresh, ch.lenFormat, layers, lifted],
  );
  sceneRef.current = scene;


  const sel = selected ? drawing.runs.find((r) => r.id === selected) ?? drawing.downspouts.find((s) => s.id === selected) : undefined;
  // «· эт N» only with more than one storey on the drawing (#1666, DS §19а — as the lengths on the canvas, #1275)
  const many = manyStories(drawing.runs);
  const capPicked = !!sel && "a" in sel && !!pickedEnd && pickedEnd.id === sel.id && hasCap(drawing, pickedEnd.id, pickedEnd.end);
  // a picked corner (#3066): «Corner · Outside · 90°» — the part's name and its kind as the supplier says them (#2979)
  const pickedC = pickedCorner ? scene?.corners.find((k) => k.id === pickedCorner) : undefined;
  const selText = pickedC
    ? t("mod.gutters.draw.selCorner", { kind: t(`mod.gutters.attr.ck.${pickedC.kind}`), deg: pickedC.angleDeg })
    : !sel
    ? null
    : capPicked
      ? t("mod.gutters.draw.selCap")
      : "a" in sel
      ? t(many ? "mod.gutters.draw.selRun" : "mod.gutters.draw.selRunOne", { len: fmtLen(runLengthIn(sel), ch.lenFormat), n: storyOf(sel.attrs.story) })
      : t(many ? "mod.gutters.draw.selDsKind" : "mod.gutters.draw.selDsKindOne", { kind: t(`mod.gutters.attr.kind.${dsKindOf(sel.shape, sel.dsStyle).key}`).replace("\n", " "), size: dsSizeText(sel.size), n: storyOf(drawing.runs.find((r) => r.id === sel.runId)?.attrs.story) });
  /** the picked downspout's kind icon on the bottom bar (#929): the kind seen at a glance, no colour */
  const selDsIcon = pickedC ? (pickedC.kind === "in" ? "cornerIn" : "cornerOut") : sel && !("a" in sel) ? dsKindOf(sel.shape, sel.dsStyle).icon : null;

  // the attribute panel (П21.8): every choice shows on the canvas at once; the window's choices are one draft (DS §7.3, winDraft.ts) —
  // «Сохранить» keeps them as one step of «Назад», «Закрыть» with edits asks «Сохранить изменения?»
  const winCommit = (made: Drawing) => {
    const start = winStartOn(winRef.current, cur.current.drawing, histRef.current);
    if (start !== winRef.current) {
      winRef.current = start;
      setWin(start);
    }
    inWin.current = true;
    try {
      commit(made);
    } finally {
      inWin.current = false;
    }
  };
  /** «Сохранить»: the window's edits stay, as one step */
  const saveWin = () => {
    const w = winRef.current;
    winRef.current = null;
    setWin(null);
    if (w) setHist(winSave(w, cur.current.drawing, histRef.current));
  };
  /** «Сохранить» of a gutter's / downspout's window: its edits kept, and with «Новые — так же» on the next ones drawn like it (#2987) */
  const saveObj = () => {
    const d = cur.current.drawing, id = cur.current.selected;
    const run = d.runs.find((r) => r.id === id), ds = d.downspouts.find((x) => x.id === id);
    if (alsoNew && run) setNewDef((x) => likeElement(cur.current.ch, x, { kind: "run", attrs: run.attrs }));
    else if (alsoNew && ds) {
      const { id: _i, runId: _r, atIn: _a, ...attrs } = ds;
      setNewDef((x) => likeElement(cur.current.ch, x, { kind: "ds", attrs }));
    }
    setAlsoNew(false);
    saveWin();
  };
  /** «Не сохранять» (or «Закрыть» with no edit left): the drawing and its history as before the window */
  const discardWin = () => {
    const back = winDiscard(winRef.current);
    winRef.current = null;
    setWin(null);
    if (!back) return;
    setHist(back.hist);
    setDrawing(back.drawing);
    cur.current = { ...cur.current, drawing: back.drawing };
    flush();
  };
  const winEdited = useMemo(() => winDirty(winDraft, drawing), [winDraft, drawing]);
  const onRunAttrs = (p: Partial<RunAttrs>) => {
    const id = cur.current.selected;
    if (!id) return;
    if (p.story !== undefined) setStoryN(storyOf(p.story));
    winCommit(setRunAttrs(cur.current.drawing, id, p, cur.current.ch));
  };
  const onDsAttrs = (p: Partial<DsAttrs>) => {
    const id = cur.current.selected;
    if (id) winCommit(setDsAttrs(cur.current.drawing, id, p, cur.current.ch));
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
  const onCorner = (f: FoundCorner, method: CornerChoice["method"] | null) => winCommit(setCornerMethod(cur.current.drawing, f, method));
  const onLength = (lengthIn: number | null) => {
    const id = cur.current.selected;
    if (id) winCommit(setLength(cur.current.drawing, id, lengthIn));
  };
  // the window closed or shows another element by other means (another one picked, the photo removed): its edits are kept
  const winKey = sel && !newSheet && (wide || sheet) ? sel.id : null;
  const winKeyRef = useRef(winKey);
  useEffect(() => {
    if (winKeyRef.current === winKey) return;
    winKeyRef.current = winKey;
    setAlsoNew(false);
    if (winRef.current) saveWin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winKey]);
  const [winAsk, askWin] = useConfirm();
  /** 820/1280: «Закрыть» of the column — with edits, the same question as the sheet's (DS Б1/Б3 words) */
  const closePanel = async () => {
    if (winDirty(winRef.current, cur.current.drawing)) {
      const a = await askWin({
        title: t("sheet.unsavedTitle"),
        text: t("sheet.unsavedText"),
        testID: "attr-win-ask",
        actions: [
          { key: "save", label: t("ue.save"), tone: "primary", testID: "attr-win-ask-save" },
          { key: "discard", label: t("sheet.discard"), tone: "danger", testID: "attr-win-ask-discard" },
          { key: "back", label: t("sheet.keepEditing"), tone: "cancel", testID: "attr-win-ask-back" },
        ],
      });
      if (a === "save") saveWin();
      else if (a === "discard") discardWin();
      else return;
    } else discardWin();
    setSelected(null);
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
  const endRun = endSheet ? drawing.runs.find((r) => r.id === endSheet.id) : undefined;
  const corner = cornerSheet ? findCorners(drawing).find((f) => f.id === cornerSheet) : undefined;
  const cut = corner ? cornerCut(drawing, corner) : null;
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
      {"a" in sel ? <RunAttrsView key={sel.id} no={drawing.runs.findIndex((r) => r.id === sel.id) + 1} run={sel} onAttrs={onRunAttrs} onLength={onLength} ch={ch} corners={runCorners} onCorner={onCorner} /> : <DsAttrsView key={sel.id} rulesOver={rules.over} no={drawing.downspouts.findIndex((d) => d.id === sel.id) + 1} ds={sel} onAttrs={onDsAttrs} ch={ch} run={drawing.runs.find((r) => r.id === sel.runId)?.attrs} />}
      {canSave ? (
        <ToggleRow
          testID="attr-also-new"
          label={t("mod.gutters.draw.alsoNew")}
          caption={t("a" in sel ? "mod.gutters.draw.alsoNewRun" : "mod.gutters.draw.alsoNewDs")}
          value={alsoNew}
          onChange={setAlsoNew}
        />
      ) : null}
      {elPhotos}
    </>
  );
  // «Новые желоба» / «Новые водостоки» (#1563 PR B): the rows of a gutter's / downspout's properties, for the new ones of this drawing
  const newTitle = newSheet === "line" ? t("mod.gutters.draw.newDefaults.runs") : t("mod.gutters.draw.newDefaults.ds");
  /** what the window shows: its draft (opened with what the drawing uses now) */
  const nd = newDraft ?? newDef;
  const newOwn = newSheet === "line" ? nd.run : nd.ds;
  const newEdited = newDirty(newDraft, newDef);
  /** a properties window is open (the sheet on 390, the column's window on 820/1280): its «Сохранить» is the screen's one accent */
  const winShown = !!newSheet || (!!attrs && (wide || sheet));
  const openNew = (tl: Tool) => {
    setSelected(null);
    setNewDraft(cur.current.newDef);
    setNewSheet(tl);
  };
  const closeNew = () => {
    setNewSheet(null);
    setNewDraft(null);
  };
  const saveNew = () => {
    if (newDraft) setNewDef(newDraft);
    closeNew();
  };
  /** 820/1280: «Закрыть» of the column with edits — the same question as a gutter's window (DS Б1/Б3) */
  const closeNewPanel = async () => {
    if (newEdited) {
      const a = await askWin({
        title: t("sheet.unsavedTitle"),
        text: t("sheet.unsavedText"),
        testID: "attr-win-ask",
        actions: [
          { key: "save", label: t("ue.save"), tone: "primary", testID: "attr-win-ask-save" },
          { key: "discard", label: t("sheet.discard"), tone: "danger", testID: "attr-win-ask-discard" },
          { key: "back", label: t("sheet.keepEditing"), tone: "cancel", testID: "attr-win-ask-back" },
        ],
      });
      if (a === "save") return saveNew();
      if (a !== "discard") return;
    }
    closeNew();
  };
  /** «Новые gutter» / «Новые downspout» (#2987, founder 27.11: «нужно продумать, какие должны открываться меню»): the same window as one
   *  gutter's / downspout's — its title, what it is for, its rows, «Как в настройках компании»; «Закрыть / Сохранить» at the bottom */
  const newBody = () => !newSheet ? null : (
    <View testID="draw-new-defaults" style={{ gap: space[4] }}>
      <View style={{ gap: space[1] }}>
        <T v="heading" w="semibold">{newTitle}</T>
        <T v="caption" tone="mut">{t("mod.gutters.draw.newDefaults.hint")}</T>
      </View>
      {newSheet === "line" ? (
        <RunAttrsView forNew run={{ id: "new-run", a: [0, 0], b: [0, 0], attrs: runFor(ch, story, nd) }} onAttrs={(p) => setNewDraft((x) => patchRun(ch, x ?? newDef, p))} onLength={() => {}} ch={ch} />
      ) : (
        <DsAttrsView forNew ds={{ ...dsFor(ch, nd), id: "new-ds", runId: "", atIn: 0 }} onAttrs={(p) => setNewDraft((x) => patchDs(ch, x ?? newDef, p))} ch={ch} run={runFor(ch, story, nd)} />
      )}
      {newOwn ? (
        <View testID="draw-new-defaults-reset" style={{ alignItems: "flex-start" }}>
          <Button label={t("mod.gutters.draw.newDefaults.reset")} icon="undo" variant="secondary" size="sm" onPress={() => setNewDraft((x) => resetKind(x ?? newDef, newSheet === "line" ? "run" : "ds"))} />
        </View>
      ) : null}
    </View>
  );
  /** 820/1280: the panel is a column on the right, always there; the canvas and its bars stay left of it */
  const panelSide = wide ? ins.right + component.panelW + space[3] : 0;

  /** «Назад» / «Вперёд» beside the open column (820/1280): the window's edits are kept first, as one step */
  const histNow = () => {
    const w = winRef.current;
    if (!w) return hist;
    winRef.current = null;
    setWin(null);
    return winSave(w, drawing, hist);
  };
  const doUndo = () => {
    const u = undo(histNow(), drawing);
    if (!u) return;
    setHint(null);
    setHist(u.h);
    setDrawing(u.d);
    setSelected(null);
    later.current();
  };
  const doRedo = () => {
    const r = redo(histNow(), drawing);
    if (!r) return;
    setHint(null);
    setHist(r.h);
    setDrawing(r.d);
    later.current();
  };
  const doDelete = () => {
    if (!selected) return;
    const target = deleteTarget(drawing, selected, pickedEnd);
    if (target?.kind === "cap") {
      // the cap only (#1855): the end stays a free end without one, the gutter stays picked; «Отменить» puts the cap back
      commit(setCapOff(drawing, target.id, target.end, true));
      setPickedEnd(null);
      toast.show(t("mod.gutters.draw.capRemoved"), localUndo(() => { const now = cur.current.drawing; commit(setCapOff(now, target.id, target.end, false), now, true); }));
      return;
    }
    const before = drawing;
    commit(removeElement(drawing, selected));
    setSelected(null);
    const gone = selected;
    // «Отменить» puts back what was deleted and keeps what was drawn since
    toast.show(t("mod.gutters.draw.deleted"), localUndo(() => commit(restoreRemoved(cur.current.drawing, before, gone), cur.current.drawing, true))); // put back as it was: no recount (#1264)
  };
  // «Эт» only switches the story the next gutter is drawn on; what is picked stays where it is (#1608, founder 15.11, README §12 п.19).
  // A gutter goes to another story by its own properties (the «Этаж» row), not by this button
  const nextStory = () => setStoryN(nextStoryOf(story));
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
    const next = autoDownspouts(cur.current.drawing, { ...o, attrs: dsFor(cur.current.ch, cur.current.newDef), ch: cur.current.ch, newId: () => Crypto.randomUUID() }, undefined, true);
    if (!layers.ds) setLayers((x) => ({ ...x, ds: true }));
    commit(next, cur.current.drawing, true);
  };
  // the properties of new objects of this drawing, kept on this phone per measurement (#1563 PR B, option Б; canvas/toolDefaults.ts): read
  // when the measurement is known — a choice made before (a new drawing, or during the read) wins and is written (`adopt`); every write
  // re-reads the stored map in one queue; the entries of measurements that are gone are pruned once the phone's data is loaded (not at the
  // delete, which has «Отменить»)
  const mId = m?.id ?? null;
  /** the measurement whose entry the screen holds now (read and adopted): writes go only after that */
  const adopted = useRef<string | null>(null);
  useEffect(() => {
    if (!mId || adopted.current === mId) return;
    let on = true;
    void readDefaults(mId).then((stored) => {
      if (!on) return;
      const r = adopt(cur.current.newDef, stored);
      adopted.current = mId;
      setNewDef(r.nd);
      if (r.write) void storeDefaults(mId, r.nd);
    });
    return () => {
      on = false;
    };
  }, [mId]);
  useEffect(() => {
    if (!mId || adopted.current !== mId) return;
    void storeDefaults(mId, newDef);
  }, [mId, newDef]);
  // the entries of measurements that are gone: once the phone's data is loaded (not before — the list would be short, review #1563 PR B)
  const pruned = useRef(false);
  useEffect(() => {
    if (pruned.current || store.loading || !mId) return;
    pruned.current = true;
    void pruneStored(new Set([mId, ...gutterData(store.db).measurements.map((x) => x.id)]));
  }, [store.loading, store.db, mId]);
  // a pick on the canvas shows its own properties: «новые» close (wider the column shows one thing at a time)
  useEffect(() => {
    if (!selected) return;
    setNewSheet(null);
    setNewDraft(null);
  }, [selected]);
  /** two taps on «Желоб» / «Водосток» in the toolbar: the properties of new ones (#1563 PR B); one tap picks the tool, as before */
  const toolTap = useRef<LastTap | null>(null);
  /** a tool was just picked: the layout under the toolbar waits for the window of a second tap (the toolbar does not move under it) */
  const [toolFresh, setToolFresh] = useState(false);
  const freshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (freshTimer.current) clearTimeout(freshTimer.current); }, []);
  const toolPress = (tl: Tool) => {
    const now = Date.now();
    if (isDoubleTap(toolTap.current, now, tl, motion.doubleTapMs)) {
      toolTap.current = null;
      openNew(tl);
      return;
    }
    toolTap.current = { at: now, id: tl };
    setToolFresh(true);
    if (freshTimer.current) clearTimeout(freshTimer.current);
    freshTimer.current = setTimeout(() => setToolFresh(false), motion.doubleTapMs + motion.durFast);
    pick(tl);
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
  type WhoKey = "fit" | "newdef" | "props" | "end0" | "end1" | "acc" | "layers" | "autods" | "relink" | "unlink" | "delete";
  const linked = !!leadId || !!placeId;
  // the free ends of the picked gutter (a corner and a butted end have no cap to talk about; «без заглушки» stays one)
  const endRun0 = canSave ? drawing.runs.find((r) => r.id === selected) : undefined;
  const endRows = (() => {
    if (!endRun0) return [] as { end: 0 | 1; side: string }[];
    const found = findCorners(drawing), kinds = runEnds(drawing, found)[endRun0.id], hs = houseSides(drawing)(endRun0);
    return ([0, 1] as const).filter((e) => !!endRun0.noCap?.[e] || kinds?.[e]?.kind === "cap").map((e) => ({ end: e, side: capSide(e, hs) }));
  })();
  const whoItems: { key: WhoKey; label: string; destructive?: boolean; testID?: string }[] = [
    // «вписать» left the header (#1273): the whole drawing is a double tap on the empty place, and a row here
    { key: "fit", label: t("mod.gutters.draw.fit") },
    // what a double tap opens, as rows too (a screen reader has no double tap, a phone on its side has no panel): the properties of the picked
    // gutter / downspout, and «Конец желоба» of each of its free ends (named by the letter the cap carries on the canvas)
    ...(canSave && sel && !wide ? [{ key: "props" as const, label: t("mod.gutters.attr.props") }] : []),
    ...endRows.map((r) => ({ key: `end${r.end}` as const, label: `${t("mod.gutters.end.title")} · ${r.side}` })),
    // «Как рисовать новые» (#2987): what two taps on «Желоб» / «Водосток» in the toolbar open, as a row — no need to know the double tap
    ...(canSave ? [{ key: "newdef" as const, label: t("mod.gutters.draw.newDefaults.item"), testID: "draw-who-newdef" }] : []),
    // no «Где панель» (founder 18.11, #2156: «Зачем она там?») — the toolbar moves by its grip; no «Точность замера» (#768, #1764)
    { key: "layers", label: t("mod.gutters.draw.layersItem") },
    // a measurement from before the automatic downspouts gets them only when asked (#1246): not silently, the estimate would change
    ...(canSave && autoDs && drawing.runs.length > 0 && !autoManaged(drawing) ? [{ key: "autods" as const, label: t("mod.gutters.draw.autoDsItem") }] : []),
    ...(linked ? [{ key: "relink" as const, label: t("mod.gutters.link.relink") }, { key: "unlink" as const, label: t("mod.gutters.link.unlink") }] : []),
    ...(inStore ? [{ key: "delete" as const, label: t("mod.gutters.draw.mDelete"), destructive: true }] : []),
  ];
  const onWho = (k: WhoKey) => {
    if (k === "fit") { if (size.w) setView(fit(drawing, size)); return; }
    if (k === "props") return setSheet(true);
    if (k === "newdef") return openNew(cur.current.tool);
    if (k === "end0" || k === "end1") return setEndSheet(endRun0 ? { id: endRun0.id, end: k === "end1" ? 1 : 0 } : null);
    if (k === "layers") return setMoreSheet(k);
    if (k === "autods") return placeAutoDs();
    if (!m) return;
    flush();
    if (k === "relink") setLinkSheet(true);
    else if (k === "unlink") toast.show(t("mod.gutters.link.unlinked"), relink(store, m.id, null) ?? undefined);
    else if (deleteBlock(store.db, m.id, who)) toast.show(t(deleteBlock(store.db, m.id, who) === "signed" ? "mod.gutters.draw.deleteSigned" : "mod.gutters.del.notYours"));
    // an open estimate stands on it: asked first (#2013), the question holds what it said while it goes out
    else if (estimatesOn(store.db, m.id).drafts.length || estimatesOn(store.db, m.id).sent.length) setAskDelete(estimatesOn(store.db, m.id));
    else deleteNow();
  };
  const [askDelete, setAskDelete] = useState<ReturnType<typeof estimatesOn> | null>(null);
  /** one deletion at a time (rule 5: a second press never puts an empty «Отменить» over the first one's) */
  const deleting = useRef(false);
  const deleteNow = () => {
    setAskDelete(null);
    const mm = cur.current.m;
    if (!mm || deleting.current) return;
    // asked again at the press: signed meanwhile or not this person's to change — never deleted
    const block = deleteBlock(store.db, mm.id, who);
    if (block) return toast.show(t(block === "signed" ? "mod.gutters.draw.deleteSigned" : "mod.gutters.del.notYours"));
    deleting.current = true;
    const undo = removeMeasurementDetached(store as unknown as ModuleEstimateStore, mm.id, who);
    if (!undo) {
      deleting.current = false;
      return toast.show(t("mod.gutters.est.off"));
    }
    flush();
    // to the list of measurements (founder 16.11, #1819: he stayed on an empty canvas «Замер»): the canvas of a deleted one is
    // never shown — the list below is popped to, else it takes this screen's place (goTo); «Отменить» brings it back there
    goTo(moduleHref("gutters", "list"));
    toast.show(t("mod.gutters.draw.mDeleted"), undo);
  };
  // the toast stands above what lies at the bottom of the canvas — the hints, the chips and the toolbar (#1819: «Замер удалён ·
  // Отменить» lay on the toolbar); the same lane the pinned action bar gives (ui/footerInset), gone with the screen
  const [barH, setBarH] = useState(0);
  useEffect(() => {
    setFooterInset(barH);
    return () => setFooterInset(0);
  }, [barH]);
  // from 820 the side panel of properties stands at the right over the whole height: the toast is centred in the canvas, not on it (#1895)
  useEffect(() => {
    setToastRight(panelSide);
    return () => setToastRight(0);
  }, [panelSide]);
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

  // on its side (founder 08.11): one strip at the bottom — the card and the toolbar as a row beside it (a column would
  // not fit the height); the grip puts the toolbar left or right of the card
  const at = place;
  const side = !flat && (at === "left" || at === "right");
  /** the toolbar beside the chip, not under it: on a side, or the phone on its side (#1630) */
  const row = side || flat;
  /** in that row the toolbar is at the left edge (the left side; lying, unless put on the right) */
  const toolsFirst = at === "left" || (flat && at !== "right");

  // what lies over the canvas, measured (#1667): the header's bottom; the bottom column's top, its toolbar (at the bottom
  // edge) and its summary chips; the toolbar's width at a side edge. The chips and the toolbar's place come after the
  // first frame — until a finger touches, the drawing fits itself again as they come (`autoFitView`), then never
  const lay = useRef({ header: 0, colY: -1, sumY: -1, tbW: 0 });
  const [layN, setLayN] = useState(0);
  const onLay = useCallback((k: "header" | "colY" | "sumY" | "tbW", f: (l: LayoutChangeEvent["nativeEvent"]["layout"]) => number) => (e: LayoutChangeEvent) => {
    const v = Math.round(f(e.nativeEvent.layout));
    if (lay.current[k] !== v) {
      lay.current[k] = v;
      setLayN((n) => n + 1);
    }
  }, []);
  // since #1630 the bottom column holds the hints, the chips and (at the bottom) the toolbar, pressed to the bottom: its top is
  // where the drawing ends. On a side the toolbar stands in one row with the chips: it covers its side (its width), the
  // chips only their own height at the bottom
  const covers = useMemo((): Insets => {
    const L = lay.current;
    const H = size.h;
    if (!H || L.colY < 0) return { t: L.header, r: 0, b: 0, l: 0 };
    if (side) {
      const w = L.tbW + space[3];
      return { t: L.header, b: Math.max(0, H - (L.colY + Math.max(L.sumY, 0))), l: at === "left" ? w + ins.left : 0, r: at === "right" ? w + ins.right : 0 };
    }
    return { t: L.header, b: Math.max(0, H - L.colY), l: 0, r: 0 };
  }, [layN, size.h, at, side, ins.left, ins.right]);
  coverRef.current = covers;
  useEffect(() => {
    if (!m || size.w <= 0 || size.h <= 0) return;
    const next = autoFitView(touched.current, view, fit(drawing, size));
    if (next !== view) setView(next);
  }, [view, m, size, drawing, fit, covers]);
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
  const lineIcon = PROFILE_ICON[(runFor(ch, story, newDef).profile as GutterProfile)] ?? "channel";
  const dsIcon = (() => { const a = dsFor(ch, newDef); return dsKindOf(a.shape, a.dsStyle).icon; })();
  const tools = (
    <View testID="draw-toolbar" onLayout={onLay("tbW", (l) => l.width)} style={{ flexDirection: side ? "column" : "row", alignSelf: grow ? "stretch" : undefined, gap: space[1], alignItems: "center", padding: space[2], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: gripping ? dt.runW / 2 : 1, borderColor: gripping ? c.ink : c.bd, flexShrink: 0, transform: [{ translateX: gripAt[0] }, { translateY: gripAt[1] }] }}>
      {grip}
      <View testID="draw-tool-line" style={grow ? { flex: 1 } : { flexShrink: 0 }}><ToolCell icon={lineIcon} label={t("mod.gutters.draw.line")} active={tool === "line"} onPress={() => toolPress("line")} grow={grow} below={at === "top"} /></View>
      <View testID="draw-tool-ds" style={grow ? { flex: 1 } : { flexShrink: 0 }}><ToolCell icon={dsIcon} label={t("mod.gutters.draw.downspout")} active={tool === "ds"} onPress={() => toolPress("ds")} grow={grow} below={at === "top"} /></View>
      <View testID="draw-story" style={grow ? { flex: 1 } : { flexShrink: 0 }}><ToolCell body={t("mod.gutters.draw.storyShort", { n: story })} ring={c.drawing.story[story - 1]} label={t("mod.gutters.draw.storyCell")} a11y={t("mod.gutters.draw.story", { n: story })} onPress={nextStory} grow={grow} below={at === "top"} /></View>
      <View testID="draw-undo" style={grow ? { flex: 1 } : { flexShrink: 0 }}><ToolCell icon="undo" label={t("mod.gutters.draw.undo")} onPress={doUndo} grow={grow} below={at === "top"} /></View>
      {/* «Вперёд» beside «Назад» (founder 09.11): «Ещё» is gone — how it was measured and the toolbar's place open from
          the accuracy mark at the top */}
      <View testID="draw-redo" style={grow ? { flex: 1 } : { flexShrink: 0 }}><ToolCell icon="redo" label={t("mod.gutters.draw.redoShort")} onPress={doRedo} grow={grow} below={at === "top"} /></View>
      {/* the bin (#1274, founder 12.11: «🗑 в панели, виден всегда, активен только при выборе»): «Отменить» for 5 s after (rule 5) */}
      {/* the bin without a pick: a `disabled` button is deaf to the long press that says its name, so the cell is not disabled — it answers nothing, and the state is said here */}
      <View testID="draw-delete" {...({ "aria-disabled": !sel || undefined } as object)} style={grow ? { flex: 1 } : { flexShrink: 0 }}><ToolCell icon="trash" label={t("mod.gutters.draw.delete")} onPress={doDelete} grow={grow} disabled={!sel} below={at === "top"} /></View>
    </View>
  );
  // the summary chip: the parts are the engine's (rule 8) from the drawing as it is when the finger rests — not on every frame of a drag
  const calmDrawing = useDeferredValue(drawing);
  const parts = useMemo(() => (calmDrawing.runs.length ? computeGutterParts(toMeasurement(calmDrawing, { method: rules.corner }), rules.over).parts : []), [calmDrawing, rules]);
  // «Дальше: водостоки» goes when «Водосток» is picked (the user is doing it) — but only once the window of a double tap is over (#1563 PR B):
  // the row going away at once moved the whole toolbar down by its height under the finger, and the second of two taps on the tool landed
  // on the canvas
  const summary0 = summaryOf(drawing, parts, selText ? { text: selText, dsIcon: selDsIcon } : null, (tool === "ds" && !toolFresh) || !!ghost);
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
  // a chain short of downspouts (#1570, founder 14.11: «удалил водосток — пусть пишет, что не хватает»): a warning while it lasts, with «Поставить водосток»
  const short = useMemo(() => (canSave && autoDs ? shortChains(drawing, autoDs.spacingIn) : []), [canSave, autoDs, drawing]);
  const shortRun = short[0] ? drawing.runs.filter((r) => short[0]!.runIds.includes(r.id)).sort((u, v) => runLengthIn(v) - runLengthIn(u))[0] : undefined;
  const refill = () => {
    const o = cur.current.autoDs;
    const s0 = short[0];
    if (!o || !s0) return;
    // put back as the rule wants: one step of «Назад», no second pass of the automatic downspouts (`placed`)
    // every short chain at once (code-reviewer #1576: with two short the button fixed only the first, the warning stayed)
    commit(refillChain(cur.current.drawing, short.flatMap((c) => c.runIds), { ...o, attrs: dsFor(cur.current.ch, cur.current.newDef), ch: cur.current.ch, newId: () => Crypto.randomUUID() }), cur.current.drawing, true);
  };

  const ghostLen = ghost ? Math.round(Math.hypot(ghost.b[0] - ghost.a[0], ghost.b[1] - ghost.a[1])) : 0;
  const gA = ghost && view ? toScreen(view, ghost.a) : null;
  const gB = ghost && view ? toScreen(view, ghost.b) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID="draw-screen" onStartShouldSetResponderCapture={() => { touched.current = true; return false; }}>
      {/* no edge swipe back on the canvas (founder 09.11): drawing from the left edge left the screen */}
      <Stack.Screen options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
      {/* the drawing under everything */}
      <View style={{ position: "absolute", left: 0, right: panelSide, top: 0, bottom: 0 }}>
        <CanvasView
          view={viewNow}
          onView={onTouchView}
          live={live}
          size={size}
          onSize={setSize}
          gestures={canvas}
          testID="draw-canvas"
          // the grid (#1434): a screen-sized layer under the drawing, following the live view on the UI thread — not clipped on an iPhone
          under={layers.grid && view && size.w > 0 ? <GridLayer live={live} size={size} minPx={space[6]} testID="draw-grid" /> : null}
        >
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
      <View pointerEvents="box-none" onLayout={onLay("header", (l) => l.y + l.height)} style={{ paddingTop: ins.top + space[2], paddingLeft: ins.left + space[3], paddingRight: ins.right + space[3] + panelSide, gap: space[2] }}>
        <RowView style={{ alignItems: "center", gap: space[1] }}>
          <View testID="draw-back"><IconButton icon="chevronLeft" label={t("mod.title")} onPress={back} /></View>
          <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space[1] }}>
            {flat || !canSave ? (
              <T v="heading" w="semibold">{t("mod.gutters.draw.title")}</T>
            ) : lead ? (
              <View testID="draw-lead" style={{ flexShrink: 1 }}>
                <NameButton icon="user" label={lead.name} onPress={() => router.push(`/lead/${lead.id}`)} />
              </View>
            ) : addr ? (
              // linked to a client's address (LinkSheet): that address, it opens the property
              <View testID="draw-place" style={{ flexShrink: 1 }}>
                <NameButton icon="pin" label={addr.address} onPress={() => router.push(`/property/${addr.id}`)} />
              </View>
            ) : inStore && !leadId && !inStore.propertyId ? (
              <View testID="draw-to-lead" style={{ flexShrink: 1 }}>
                {/* the filled pill is the button; no «＋» before the word: with the header's buttons at 40 (rule 3, #2350) «Привязать» is whole at 390 (e2e 412) */}
                <NameButton label={t("mod.gutters.draw.toLead")} filled onPress={() => setLinkSheet(true)} />
              </View>
            ) : (
              <T v="heading" w="semibold">{t("mod.gutters.draw.title")}</T>
            )}
            {/* «?» beside the name (DS §12.2): the same steps as on the empty canvas, any time (#2186) */}
            {/* a gap of a whole step from the name button: their touch zones (44) never overlap (rule 3; second design review) */}
            <View style={{ marginLeft: space[3] }}>
              <HelpButton title={t("mod.gutters.draw.help.q")} text={helpText(t)} testID="draw-help" />
            </View>
            {/* no cloud when all is saved and sent: only «on the phone» (not sent yet / no connection), a tap says it in words (#507 → #1274) */}
            {canSave && !flat && (mark === "sending" || mark === "phone") ? (
              <View testID="draw-local">
                <IconButton icon={SAVE_ICON[mark]} label={t(`mod.gutters.draw.save.${mark}`)} onPress={() => toast.show(t(`mod.gutters.draw.save.${mark}`))} />
              </View>
            ) : null}
          </View>
          {mPhotos && !wide && !flat && canSave ? (
            <View testID="draw-photos-open">
              {/* the same round plate as «⋯» (IconButton: dockBtn, surf2, a hairline border; founder 16.11, #1752: «фотоаппарат не в единой
                  системе»); with photos the count stands in it and the plate grows into a pill */}
              <Press onPress={() => setPhotoSheet(true)} accessibilityRole="button" accessibilityLabel={photoN ? `${t("mod.gutters.photo.open")} · ${photoN}` : t("mod.gutters.photo.open")} visibleHeight={component.dockBtn} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[1], height: component.dockBtn, minWidth: component.dockBtn, paddingHorizontal: photoN ? space[3] : 0, borderRadius: radius.pill, backgroundColor: c.surf2, borderWidth: component.hairline, borderColor: c.bd }}>
                <Icon name="camera" s={sizes.iconMd} color={c.ink} />
                {photoN ? <T v="caption" w="semibold">{photoN}</T> : null}
              </Press>
            </View>
          ) : null}
          {canSave ? (
            <View ref={whoRef} collapsable={false} testID="draw-who">
              <IconButton icon="more" label={t("mod.gutters.draw.whoMenu")} onPress={() => whoRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setWhoAt({ x, y, w, h }))} />
            </View>
          ) : null}
          {inStore ? (
            // the header's buttons are one height (DS §19а: «высота кнопки 36»; founder 16.11, #1752: «Готово другого размера»)
            // while a window is open its «Сохранить» is the one accent (rule 2, DS §7.3): «Готово» steps back to secondary (#3090 п.3). Not hidden:
            // on 820/1280 the column's window is open whenever something is picked, and «Готово» is the way to the view (hiding it, 97907f3, broke that)
            <View testID="draw-done"><Button label={t("mod.gutters.view.done")} variant={winShown ? "secondary" : "primary"} size="phone" onPress={() => void done()} /></View>
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
        {/* a chain short of downspouts (#1570): under the header, as a banner stands (DS) — not at the bottom, where the hand draws */}
        {short.length && shortRun && !gripping ? (
          <Banner
            tone="warn"
            testID="draw-ds-short"
            title={short.length > 1 ? t("mod.gutters.draw.dsShort.titleMany", { n: short.length }) : t("mod.gutters.draw.dsShort.title")}
            // «водостоков 0 из 1», not «стоит 0» (read as a price); the story only when there is more than one, in full (design-reviewer #1570)
            hint={t("mod.gutters.draw.dsShort.hint", {
              run: new Set(drawing.runs.map((r) => storyOf(r.attrs.story))).size > 1
                ? t("mod.gutters.draw.dsShort.runStory", { len: fmtLen(runLengthIn(shortRun), ch.lenFormat), n: storyOf(shortRun.attrs.story) })
                : t("mod.gutters.draw.dsShort.run", { len: fmtLen(runLengthIn(shortRun), ch.lenFormat) }),
              need: short[0]!.need,
              have: short[0]!.have,
            })}
            action={{ label: short.length > 1 ? t("mod.gutters.draw.dsShort.actionMany") : t("mod.gutters.draw.dsShort.action"), onPress: refill }}
          />
        ) : null}
        {/* the toolbar stuck to the top (founder 09.11): under the header */}
        {at === "top" && !flat ? <View pointerEvents="box-none" style={{ alignItems: grow ? "stretch" : "center" }}>{tools}</View> : null}
      </View>

      {!drawing.runs.length && !ghost ? (
        <View pointerEvents="none" style={{ position: "absolute", left: space[6], right: space[6] + panelSide, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }} testID="draw-empty">
          {/* «Как рисовать» (founder 18.11, #2186): the four steps while the canvas is empty; every touch goes through to the canvas */}
          <EmptyHelp lineIcon={lineIcon} dsIcon={dsIcon} />
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
      <View
        pointerEvents="box-none"
        // its top is where the drawing ends (#1667, «вписать»); its height is the toast's lane above it (#1819)
        onLayout={(e) => {
          onLay("colY", (l) => l.y)(e);
          setBarH(Math.round(e.nativeEvent.layout.height));
        }}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingLeft: ins.left + space[3], paddingRight: ins.right + space[3] + panelSide, paddingBottom: ins.bottom + space[3], gap: space[2] }}
      >
        {/* the toolbar keeps its place (#1630): below the chip and the hints when at the bottom; beside them, at its own edge, when on a side
            or when the phone lies on its side — the chip coming and going never moves it under the finger */}
        <View pointerEvents="box-none" style={row ? { flexDirection: "row", alignItems: "flex-end", gap: space[2] } : { gap: space[2] }}>
        {row && toolsFirst ? tools : null}
        <View pointerEvents="box-none" onLayout={onLay("sumY", (l) => l.y)} style={row ? { flex: 1, alignItems: toolsFirst ? "flex-end" : "flex-start", gap: space[2] } : { gap: space[2] }}>
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
        {/* the summary chip (#1274, founder 12.11: «строки выбора нет — маленькая полупрозрачная плашка-сводка в нижнем углу», over the drawing, no row of its own):
            what is picked, else «Дальше: водостоки», else the totals; a tap opens the measurement's «Просмотр» (the materials and the sum) */}
        {summary && !gripping && (!flat || summary.kind === "selected") ? (
          <View pointerEvents="box-none" style={{ alignItems: "flex-start", gap: space[2], flexShrink: 1 }}>
            <Press
              testID="draw-summary"
              // «Дальше: водостоки» is a hint with its action (the downspout tool); the rest opens the measurement's «Просмотр»
              onPress={() => { if (summary.kind === "nextDs") pick("ds"); else if (inStore) router.push(`${moduleHref("gutters", "view")}?m=${encodeURIComponent(inStore.id)}`); }}
              disabled={!canSave || (summary.kind !== "nextDs" && !inStore)}
              visibleHeight={component.button.phone}
              accessibilityRole="button"
              accessibilityLabel={summaryA11y}
              style={SUMMARY_CHIP(c)}
            >
              {summary.kind === "selected" ? (
                <View testID="draw-selected" style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                  {summary.dsIcon ? <View testID="draw-selected-kind"><Icon name={summary.dsIcon} s={sizes.iconSm} color={c.ink} /></View> : null}
                  <T v="caption" w="semibold" numberOfLines={1}>{summary.text}</T>
                </View>
              ) : summary.kind === "nextDs" ? (
                <NextDsLine gutterFt={summary.gutterFt} icon={lineIcon} text={t("mod.gutters.draw.nextDsShort")} />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                  <Icon name={lineIcon} s={sizes.iconSm} color={c.ink} />
                  <T v="caption" w="semibold">{`${summary.gutterFt}′`}</T>
                  <T v="caption" tone="mut">·</T>
                  <Icon name={dsIcon} s={sizes.iconSm} color={c.ink} />
                  <T v="caption" w="semibold">{`${summary.dsCount} · ${summary.pipeFt}′`}</T>
                  {/* it opens «Просмотр замера»: the chevron says it is pressable */}
                  <Icon name="chevronRight" s={sizes.iconSm} color={c.mut} />
                </View>
              )}
            </Press>
            {/* a picked one hides nothing: «Дальше: водостоки» stays under it until the first downspout is there (founder 12.11) */}
            {summary.kind === "selected" && summary.next !== null && !flat && canSave ? (
              <Press testID="draw-summary-next" onPress={() => pick("ds")} visibleHeight={component.button.phone} accessibilityRole="button" accessibilityLabel={t("mod.gutters.draw.nextDs")} style={SUMMARY_CHIP(c)}>
                <NextDsLine gutterFt={summary.next} icon={lineIcon} text={t("mod.gutters.draw.nextDsShort")} />
              </Press>
            ) : null}
          </View>
        ) : null}
        </View>
        {row && !toolsFirst ? tools : null}
        </View>
        {/* at the bottom the toolbar is the lowest, at the very edge (#1630): the chip and the hints above it come and go without moving
            it — a toolbar that jumps under the finger sends the next tap to the canvas (a downspout put by a double tap on «Водосток») */}
        {row || at === "top" ? null : <View pointerEvents="box-none" style={{ alignItems: grow ? "stretch" : "center" }}>{tools}</View>}
      </View>

      {/* 820/1280: the panel on the right (what is picked, or how to pick); 390: the sheet from «Свойства» */}
      {wide ? (
        <View testID="draw-panel" style={{ position: "absolute", right: ins.right + space[3], top: ins.top + space[2], bottom: ins.bottom + space[3], width: component.panelW, padding: space[3], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: component.hairline, borderColor: c.bd, gap: space[2] }}>
          {newSheet ? (
            <>
              <AttrBody>{newBody()}</AttrBody>
              <WinButtons onClose={() => void closeNewPanel()} onSave={saveNew} />
            </>
          ) : attrs ? (
            <>
              <AttrBody>{attrs}</AttrBody>
              <WinButtons onClose={() => void closePanel()} onSave={() => { saveObj(); setSelected(null); }} />
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
      <Sheet
        visible={!wide && sheet && !!attrs && !newSheet}
        onClose={() => { discardWin(); setSheet(false); }}
        dirty={winEdited}
        onSave={() => { saveObj(); setSheet(false); }}
        footer={<WinButtons onClose={() => { discardWin(); setSheet(false); }} onSave={() => { saveObj(); setSheet(false); }} />}
      >
        <AttrBody inSheet>{attrs}</AttrBody>
      </Sheet>
      <Sheet
        visible={!wide && !!newSheet}
        onClose={closeNew}
        dirty={newEdited}
        onSave={saveNew}
        footer={<WinButtons onClose={closeNew} onSave={saveNew} />}
      >
        <AttrBody inSheet>{newBody()}</AttrBody>
      </Sheet>
      {m ? <LinkSheet visible={linkSheet} onClose={() => setLinkSheet(false)} measurementId={m.id} /> : null}
      <DeleteMeasurementSheet visible={!!askDelete} on={askDelete ?? NO_ESTIMATES} onDelete={deleteNow} onClose={() => setAskDelete(null)} />
      <Menu visible={!!whoAt} anchor={whoAt} items={whoItems} onSelect={onWho} onClose={() => setWhoAt(null)} />
      <InputWindow visible={canSave && !!editRun} onClose={() => setLenEdit(null)} scroll={false}>
        {editRun ? <QuickLength key={editRun.id} fmt={ch.lenFormat} run={editRun} start={runLengthIn(editRun)} onLength={(n) => commit(setLength(cur.current.drawing, editRun.id, n))} onDone={() => setLenEdit(null)} onCancel={() => setLenEdit(null)} /> : null}
      </InputWindow>
      <InputWindow visible={canSave && !!quick} onClose={cancelQuick} scroll={false}>
        {quick ? <QuickLength fmt={ch.lenFormat} run={quick} onLength={(n) => commit(setLength(cur.current.drawing, quick.id, n))} onDone={() => setQuickRun(null)} onCancel={cancelQuick} /> : null}
      </InputWindow>
      {/* «Конец желоба» (a double tap on a free end, #1273): the cap is there / none, the line's face L ↔ R */}
      <Sheet visible={canSave && !!endRun} onClose={() => setEndSheet(null)}>
        {endRun && endSheet ? (
          <EndSheet
            capOff={!!endRun.noCap?.[endSheet.end]}
            side={houseSides(drawing)(endRun)}
            onCap={(off) => commit(setCapOff(cur.current.drawing, endSheet.id, endSheet.end, off))}
            onFlip={() => commit(flipFace(cur.current.drawing, endSheet.id))}
          />
        ) : null}
      </Sheet>
      <Sheet visible={canSave && !!corner} onClose={() => setCornerSheet(null)}>
        {corner ? (
          <CornerSheet
            d={drawing}
            f={corner}
            cut={cut}
            fmt={ch.lenFormat}
            tape={tape}
            splashOn={!splashOff(drawing, corner)}
            onKind={cornerKind}
            onSplash={(on) => commit(setCornerSplash(cur.current.drawing, corner, on))}
            onSplit={() => {
              const before = cur.current.drawing;
              const next = splitCorner(before, corner, tolIn());
              setCornerSheet(null);
              if (next === before) return;
              commit(next, before);
              toast.show(t("mod.gutters.draw.cornerSplit.done"), localUndo(() => commit(before, cur.current.drawing, true))); // put back as it was: no recount (#1264)
            }}
            onAngle={(deg) => commit(setCornerAngle(cur.current.drawing, corner, deg))}
          />
        ) : null}
      </Sheet>
      <Sheet visible={moreSheet !== null} onClose={() => setMoreSheet(null)}>
        <View testID="draw-more-sheet" style={{ gap: space[2] }}>
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
        </View>
      </Sheet>
      <Sheet visible={!wide && photoSheet && !!mPhotos} onClose={() => setPhotoSheet(false)}>
        {mPhotos}
      </Sheet>
      {winAsk}
    </View>
  );
}
