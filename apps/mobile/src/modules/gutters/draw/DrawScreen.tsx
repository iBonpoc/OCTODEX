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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { addDownspout, alongAxis, endAt, finishStroke, flipFace, moveDs, moveEndAlong, splitCorner, setCornerAngle, setCornerSplash, setRunUnit, hitTest, moveEnd, pushHistory, redo, removeElement, restoreRemoved, setCornerMethod, setDsAttrs, setLength, setRunAttrs, setStory, startAt, undo, type History, type Stroke } from "../canvas/edit";
import { dsKindOf, type DsAttrs, type RunAttrs } from "../canvas/attrs";
import { CornerSketch, CornerTriangle } from "./CornerSketch";
import { ghostChipAt } from "./ghostChip";
import { SAVE_ICON, saveMark } from "./saveMark";
import { InputWindow } from "./InputWindow";
import { AttrBody, DsAttrsView, QuickLength, RunAttrsView, type RunCorner } from "./AttrPanel";
import { MeasurePhotos } from "./Photos";
import { fmtLen, ftIn } from "../canvas/format";
import { forgetOldDraft, loadToolbarPlace, placeAt, saveToolbarPlace, TOOLBAR_PLACES, type ToolbarPlace } from "../canvas/localStore";
import { makeModuleStore } from "../canvas/moduleStore";
import { gutterData, measurementOf, photosOf, relink, removeMeasurement } from "../data";
import { makeSaver } from "../canvas/draftStore";
import { onAppLeave } from "@/data/appActive";
import { LinkSheet } from "./LinkSheet";
import { fromElements, toElements, type MeasurementRow } from "../canvas/model";
import { choicesFor, newDsAttrs, newRunAttrs, readRules, toRulesOverride } from "../settings";
import { buildScene, fitView, storyOf, toPlan, toScreen, type Scene, type Story, type View as PlanView } from "../canvas/scene";
import { DS_MARK_R, LABEL_FONT, SvgPainter } from "../canvas/SvgPainter";
import { listPreview, partName } from "../prices";
import { clientLangOf, estimateAction, estimateOfMeasurement, makeEstimate, signedOn } from "../estimateLink";
import { tFor } from "@/i18n/translate";
import { cornerChoiceOf, cornerCut, findCorners, splashOff, runEnds, runLengthIn, toMeasurement, type CornerChoice, type Drawing, type FoundCorner, type P } from "../geometry";

type Tool = "line" | "ds";
/** a finger's reach on the glass, whatever the zoom: half the 44 pt touch target */
const FINGER = sizes.hitMin / 2;
const SAVE_AFTER_MS = 1000;
const EMPTY: Drawing = { runs: [], downspouts: [] };

/** one cell of the canvas toolbar (spec 33 П20.8): a 36 circle (44 to touch, rule 3) and its word under it — a picture
 *  alone was read wrong (founder's walk-through 08.11). `body` replaces the icon (the storey: «Эт N» in its colour) */
function ToolCell({ icon, body, label, a11y, active, onPress, ring, grow }: { icon?: IconKey; body?: string; label: string; a11y?: string; active?: boolean; onPress: () => void; ring?: string; grow?: boolean }) {
  const { c } = useTheme();
  const s = component.dockBtn;
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{ selected: !!active }} containerStyle={grow ? { flex: 1 } : undefined} style={{ alignItems: "center", gap: space[1], minWidth: sizes.hitMin }}>
      <View style={{ minWidth: s, height: s, paddingHorizontal: body ? space[2] : 0, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: active ? c.acc : c.surf2, borderWidth: ring ? dt.runW / 2 : active ? 0 : 1, borderColor: ring ?? c.bd }}>
        {body ? <T v="caption" w="semibold">{body}</T> : icon ? <Icon name={icon} s={sizes.iconMd} color={active ? c.onAcc : c.ink} /> : null}
      </View>
      <T v="micro" w={active ? "semibold" : undefined} tone={active ? "ink" : "mut"} numberOfLines={grow ? 1 : undefined}>{label}</T>
    </Press>
  );
}

/** a downspout size for the bar: «3×4», a round one «3″» */
const dsSizeText = (s: string) => (s.includes("x") ? s.replace("x", "×") : `${s}″`);

const NO_VIEW: PlanView = { k: 1, ox: 0, oy: 0 };

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
  /** 390: the attribute sheet is open (820/1280 show the panel whenever something is picked) */
  const [sheet, setSheet] = useState(false);
  /** 390: the sheet of the measurement's photos */
  const [photoSheet, setPhotoSheet] = useState(false);
  /** «Ещё»: «Вернуть» and where the toolbar sits — rare, off the main row (П20.8) */
  // «⋯» → «Точность замера» or «Где панель инструментов» (founder 10.11, #739: «что такое „как мерили“?»)
  const [moreSheet, setMoreSheet] = useState<"acc" | "place" | null>(null);
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
  const [hint, setHint] = useState<Tool | "select" | null>(null);
  const live = useLive();
  const viewNow = view ?? NO_VIEW;
  // pan with two fingers and pinch: they run together with the one-finger draw and tap below (a second finger
  // cancels the stroke — founder 09.11: the pinch never came once the first finger had moved)
  const canvas = useCanvasGestures(viewNow, setView, live, 2);

  // the latest values for gesture callbacks and the delayed save
  const cur = useRef({ drawing, view, tool, story, selected, m, canSave, ch });
  cur.current = { drawing, view, tool, story, selected, m, canSave, ch };
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
        setDrawing(d);
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
    (next: Drawing, prev = cur.current.drawing) => {
      if (next === prev) return;
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
  const plan = (x: number, y: number): P => (cur.current.view ? toPlan(cur.current.view, [x, y]) : [0, 0]);

  // one finger: draw a run, or drag an end of the picked run
  const dragRef = useRef<Stroke | null>(null);
  /** a stroke just ended and no finger has touched down since: on the web the lift of a drag is also a tap on the spot — not a tap on an end cap (it turned the new line's face, #854) */
  const liftTap = useRef(false);
  // where the finger touched down: the pan activates only after it has moved a little
  const downAt = useRef<[number, number]>([0, 0]);
  // when it touched down: held still before moving = a long press (founder 08.11: from an end cap — a new line)
  const downTime = useRef(0);
  const pan = usePanGesture({
    runOnJS: true,
    maxPointers: 1,
    simultaneousWith: [canvas.pinch, canvas.pan],
    onBegin: (e) => {
      downAt.current = [e.x, e.y];
      downTime.current = Date.now();
    },
    onActivate: () => {
      const { drawing: d, tool: tl } = cur.current;
      const p0 = plan(downAt.current[0], downAt.current[1]);
      const h = hitTest(d, p0, tolIn());
      const held = Date.now() - downTime.current >= motion.durSlow;
      // a free end cap taken (#504, founder 11.11: «долгое нажатие на эндкапу — тяни за край»): held, with any tool but «Желоб», or at
      // once on the picked gutter's handle — the end follows the finger along its gutter, longer or
      // shorter. A corner's end is not taken (it would break the corner). «Желоб» without a hold goes on from the end, as before
      if (h?.kind === "end" && cur.current.canSave && tl !== "line" && (held || h.id === cur.current.selected) && runEnds(d, findCorners(d))[h.id]?.[h.end]?.kind === "cap") {
        dragRef.current = { kind: "pull", id: h.id, end: h.end, before: d };
        setSelected(h.id);
        return;
      }
      // a downspout under the finger slides along its run (founder 08.11), whatever the tool
      if (h?.kind === "ds" && cur.current.canSave) {
        dragRef.current = { kind: "ds", id: h.id, before: d };
        setSelected(h.id);
        return;
      }
      // «Желоб» from an end continues the gutter (a corner, or the same gutter grown straight on); so does a long press
      // on an end with «Водосток». «Выбрать» (a quick drag that moved an end) is gone (#687): the length is changed by
      // its label or «Свойства»; handles on the ends of the picked gutter come with #682
      if (tl === "line" || (held && h?.kind === "end")) {
        const a = startAt(d, p0, tolIn());
        // «Желоб» held on a free cap, or at once on the picked gutter's handle: along the gutter it is a pull, across it a new gutter (decided on the first move)
        const cap = tl === "line" && (held || h?.kind === "end" && h.id === cur.current.selected) && h?.kind === "end" && cur.current.canSave && runEnds(d, findCorners(d))[h.id]?.[h.end]?.kind === "cap";
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
          dragRef.current = { kind: "pull", ...g.pullable, fromLine: true };
          setGhost(null);
          setSelected(g.pullable.id);
          setDrawing(moveEndAlong(g.pullable.before, g.pullable.id, g.pullable.end, p));
          return;
        }
        if (far) dragRef.current = { kind: "line", a: g.a }; // across: a new gutter, as before
      }
      if (g.kind === "line") setGhost({ a: g.a, b: endAt(d, g.a, p, tolIn()) });
      else if (g.kind === "ds") setDrawing(moveDs(g.before, g.id, p));
      else if (g.kind === "pull") setDrawing(moveEndAlong(g.before, g.id, g.end, p));
      else setDrawing(moveEnd(g.before, g.id, g.end, p, tolIn()));
    },
    onDeactivate: (e) => {
      const g = dragRef.current;
      dragRef.current = null;
      setGhost(null);
      if (!g) return;
      // the final point is the lift itself; a cancelled stroke (a second finger came) keeps nothing
      const d = cur.current.drawing;
      const id = Crypto.randomUUID();
      const next = finishStroke(g, d, plan(e.x, e.y), tolIn(), e.canceled, { id, attrs: newRunAttrs(cur.current.ch, cur.current.story) });
      if (g.kind === "end" || g.kind === "ds" || g.kind === "pull") {
        if (e.canceled) setDrawing(g.before);
        else {
          commit(next, g.before);
          // «Желоб»: drawn on / pulled out straight from the end → its length window, as growing a gutter always did (founder 09.11)
          if (g.kind === "pull" && g.fromLine && next !== g.before) {
            setQuickRun(g.id);
            quickGrew.current = true;
          }
        }
        liftTap.current = true;
        return;
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
      const onDs = hitTest(d, p, tolIn());
      if (tl === "ds" && onDs?.kind === "ds") {
        setSelected(onDs.id);
        setSheet(true); // its menu (founder 09.11)
        return;
      }
      if (tl === "ds") {
        const id = Crypto.randomUUID();
        const next = addDownspout(d, id, p, tolIn() * 1.5, newDsAttrs(cur.current.ch), cur.current.ch);
        if (next !== d) {
          commit(next);
          setSelected(id);
          setFresh(id);
          // its menu at once (founder 09.11): fittings, size, colour — on the phone a sheet, wider the side panel is open
          setSheet(true);
        }
        return;
      }
      const h = hitTest(d, p, tolIn());
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
            view,
            viewport: size,
            fontSize: LABEL_FONT,
            padX: space[1],
            gap: dt.labelGap,
            selected,
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
          })
        : null,
    [drawing, view, size, selected, t, dim, fresh],
  );
  sceneRef.current = scene;


  const sel = selected ? drawing.runs.find((r) => r.id === selected) ?? drawing.downspouts.find((s) => s.id === selected) : undefined;
  const selText = !sel
    ? null
    : "a" in sel
      ? t("mod.gutters.draw.selRun", { len: fmtLen(runLengthIn(sel), sel.unit), n: storyOf(sel.attrs.story) })
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
  const mPhotos = m && mStored && (canSave || has()) ? <MeasurePhotos measurementId={m.id} testID="draw-photos" onRemoved={() => setPhotoSheet(false)} readOnly={!canSave} /> : null;
  const attrs = !sel ? null : (
    <>
      {"a" in sel ? <RunAttrsView run={sel} onAttrs={onRunAttrs} onLength={onLength} ch={ch} corners={runCorners} onCorner={onCorner} compact={!wide} onUnit={(u) => commit(setRunUnit(cur.current.drawing, sel.id, u))} /> : <DsAttrsView ds={sel} onAttrs={onDsAttrs} ch={ch} compact={!wide} run={drawing.runs.find((r) => r.id === sel.runId)?.attrs} />}
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
    toast.show(t("mod.gutters.draw.deleted"), () => commit(restoreRemoved(cur.current.drawing, before, gone), cur.current.drawing));
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
    onActivate: () => setGripping(true),
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
      setPlace(p);
      void saveToolbarPlace(p);
    },
  });
  const pickPlace = (p: ToolbarPlace) => {
    setPlace(p);
    setMoreSheet(null);
    void saveToolbarPlace(p);
  };
  const pick = (tl: Tool) => {
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
  type WhoKey = "acc" | "place" | "relink" | "unlink" | "delete";
  const linked = !!leadId || !!placeId;
  const whoItems: { key: WhoKey; label: string; destructive?: boolean }[] = [
    // how exact the lengths are, and where the toolbar sits — two items, each says what it is (#739; was one
    // «Как мерили, панель» the founder did not understand)
    ...(canSave && m ? [{ key: "acc" as const, label: t("mod.gutters.draw.accItem") }] : []),
    { key: "place", label: t("mod.gutters.draw.placeItem") },
    ...(linked ? [{ key: "relink" as const, label: t("mod.gutters.link.relink") }, { key: "unlink" as const, label: t("mod.gutters.link.unlink") }] : []),
    ...(inStore ? [{ key: "delete" as const, label: t("mod.gutters.draw.mDelete"), destructive: true }] : []),
  ];
  const onWho = (k: WhoKey) => {
    if (k === "acc" || k === "place") return setMoreSheet(k);
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
  const tools = (
    <View testID="draw-toolbar" style={{ flexDirection: side ? "column" : "row", alignSelf: grow ? "stretch" : undefined, gap: space[1], alignItems: "center", padding: space[2], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: gripping ? dt.runW / 2 : 1, borderColor: gripping ? c.ink : c.bd, flexShrink: 0, transform: [{ translateX: gripAt[0] }, { translateY: gripAt[1] }] }}>
      {grip}
      <View testID="draw-tool-line" style={grow ? { flex: 1 } : { flexShrink: 0 }}><ToolCell icon="channel" label={t("mod.gutters.draw.line")} active={tool === "line"} onPress={() => pick("line")} grow={grow} /></View>
      <View testID="draw-tool-ds" style={grow ? { flex: 1 } : { flexShrink: 0 }}><ToolCell icon="downspout" label={t("mod.gutters.draw.downspout")} active={tool === "ds"} onPress={() => pick("ds")} grow={grow} /></View>
      {/* «Выбрать» is gone (founder 09.11, #687): a tap picks with any tool; in its place «Свойства» of what is picked —
          on the phone (820/1280 show them in the side panel) */}
      {!wide ? (
        <View testID="draw-props" style={[grow ? { flex: 1 } : { flexShrink: 0 }, sel ? null : { opacity: component.dimOpacity }]}><ToolCell icon="sliders" label={t("mod.gutters.attr.props")} onPress={() => (sel ? setSheet(true) : setHint("select"))} grow={grow} /></View>
      ) : null}
      <View testID="draw-story" style={grow ? { flex: 1 } : { flexShrink: 0 }}><ToolCell body={t("mod.gutters.draw.storyShort", { n: story })} ring={c.drawing.story[story - 1]} label={t("mod.gutters.draw.storyCell")} a11y={t("mod.gutters.draw.story", { n: story })} onPress={nextStory} grow={grow} /></View>
      <View testID="draw-undo" style={grow ? { flex: 1 } : { flexShrink: 0 }}><ToolCell icon="undo" label={t("mod.gutters.draw.undo")} onPress={doUndo} grow={grow} /></View>
      {/* «Вперёд» beside «Назад» (founder 09.11): «Ещё» is gone — how it was measured and the toolbar's place open from
          the accuracy mark at the top */}
      <View testID="draw-redo" style={grow ? { flex: 1 } : { flexShrink: 0 }}><ToolCell icon="redo" label={t("mod.gutters.draw.redoShort")} onPress={doRedo} grow={grow} /></View>
    </View>
  );
  const nextDs = canSave && drawing.runs.length > 0 && drawing.downspouts.length === 0 && tool !== "ds" && !ghost;
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

      {/* top: back, title, the save state; a module that is off or past the trial says it before the work starts */}
      <View pointerEvents="box-none" style={{ paddingTop: ins.top + space[2], paddingLeft: ins.left + space[3], paddingRight: ins.right + space[3] + panelSide, gap: space[2] }}>
        <RowView>
          <View testID="draw-back"><IconButton icon="chevronLeft" label={t("mod.title")} onPress={back} /></View>
          <T v="heading" w="semibold">{t("mod.gutters.draw.title")}</T>
          <View style={{ flex: 1 }} />
          <View testID="draw-fit"><IconButton icon="expand" label={t("mod.gutters.draw.fit")} onPress={() => size.w && setView(fit(drawing, size))} /></View>
          {inStore ? (
            <View testID="draw-done"><Button label={t("mod.gutters.view.done")} size="sm" onPress={() => void done()} /></View>
          ) : null}
        </RowView>
        {flat && canSave ? null : canSave ? (
          <RowView style={{ flexWrap: "wrap", gap: space[2] }}>
            {/* the save mark (#507): an icon of three states, a tap says it in words; how it was measured is in «⋯» (#681) */}
            {mark !== "none" ? (
              <View testID="draw-saved">
                <IconButton icon={SAVE_ICON[mark]} label={t(`mod.gutters.draw.save.${mark}`)} onPress={() => toast.show(t(`mod.gutters.draw.save.${mark}`))} />
              </View>
            ) : null}
            {lead ? (
              <View testID="draw-lead">
                <Button label={lead.name} icon="user" size="sm" variant="ghost" onPress={() => router.push(`/lead/${lead.id}`)} />
              </View>
            ) : addr ? (
              // linked to a client's address (LinkSheet): that address, it opens the property
              <View testID="draw-place">
                <Button label={addr.address} icon="pin" size="sm" variant="ghost" onPress={() => router.push(`/property/${addr.id}`)} />
              </View>
            ) : inStore && !leadId && !inStore.propertyId ? (
              <View testID="draw-to-lead">
                <Button label={t("mod.gutters.draw.toLead")} icon="plus" size="sm" variant="secondary" onPress={() => setLinkSheet(true)} />
              </View>
            ) : null}
            {mPhotos && !wide ? (
              <View testID="draw-photos-open">
                <Button label={t("mod.gutters.photo.open")} icon="camera" size="sm" variant="ghost" onPress={() => setPhotoSheet(true)} />
              </View>
            ) : null}
            {canSave ? (
              <View ref={whoRef} collapsable={false} testID="draw-who">
                <IconButton icon="more" label={t("mod.gutters.draw.whoMenu")} onPress={() => whoRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setWhoAt({ x, y, w, h }))} />
              </View>
            ) : null}
          </RowView>
        ) : (
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
          <StatusChip status="neutral" label={ftIn(ghostLen)} />
        </View>
      ) : null}

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
        {/* what next (П20.9): gutters drawn, no downspout yet → put them — a bubble, not a row of the total (09.11) */}
        {nextDs && !hintText && !gripping && !flat ? (
          <View testID="draw-next" style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: space[2], paddingVertical: space[1], paddingLeft: space[3], paddingRight: space[1], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: component.hairline, borderColor: c.bd }}>
            <T v="caption" tone="mut">{t("mod.gutters.draw.nextDs")}</T>
            <Button label={t("mod.gutters.draw.downspout")} icon="downspout" size="sm" variant="secondary" onPress={() => pick("ds")} />
          </View>
        ) : null}
        {hintText && !gripping ? (
          <View pointerEvents="none" testID="draw-hint" style={{ alignSelf: "center", paddingVertical: space[2], paddingHorizontal: space[3], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: component.hairline, borderColor: c.bd }}>
            <T v="caption" w="semibold" center>{hintText}</T>
          </View>
        ) : null}
        {flat || at === "top" ? null : <View pointerEvents="box-none" style={{ alignItems: at === "bottom" ? (grow ? "stretch" : "center") : at === "right" ? "flex-end" : "flex-start" }}>{tools}</View>}
        <View pointerEvents="box-none" style={flat ? { flexDirection: at === "left" ? "row-reverse" : "row", alignItems: "flex-end", gap: space[2] } : undefined}>
        {selText ? (
        <View testID="draw-sel-bar" style={{ padding: space[3], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: component.hairline, borderColor: c.bd, gap: space[1], ...(flat ? { flex: 1 } : {}) }}>
          {/* one row (founder 09.11: the block took too much room): what is picked and «Свойства»; the total and the
              estimate are on «Просмотр замера» now (#700) */}
            <RowView style={{ justifyContent: "space-between", gap: space[2] }}>
              <View testID="draw-selected" style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space[2] }}>
                {selDsIcon ? <View testID="draw-selected-kind"><Icon name={selDsIcon} s={sizes.iconSm} color={c.ink} /></View> : null}
                <T v="caption" w="semibold" numberOfLines={2} style={{ flex: 1 }}>{selText}</T>
              </View>
              {/* «Удалить» where «Свойства» was (founder 09.11, #687); «Свойства» is on the toolbar */}
              <View testID="draw-delete">
                <Button label={t("mod.gutters.draw.delete")} icon="trash" size="sm" variant="secondary" onPress={doDelete} />
              </View>
            </RowView>
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
        {editRun ? <QuickLength key={editRun.id} run={editRun} start={runLengthIn(editRun)} onLength={(n) => commit(setLength(cur.current.drawing, editRun.id, n))} onDone={() => setLenEdit(null)} onCancel={() => setLenEdit(null)} /> : null}
      </InputWindow>
      <InputWindow visible={canSave && !!quick} onClose={cancelQuick}>
        {quick ? <QuickLength run={quick} onLength={(n) => commit(setLength(cur.current.drawing, quick.id, n))} onDone={() => setQuickRun(null)} onCancel={cancelQuick} /> : null}
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
            {/* the cut (founder 08.11): each run along the wall and along the face, to 1/8″ */}
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
                      <View testID="cut-back"><T v="body" tabular>{ftIn(r.backIn)}</T></View>
                    </RowView>
                    <RowView style={{ justifyContent: "space-between" }}>
                      <T v="caption" tone="mut">{t("mod.gutters.draw.cutFront")}</T>
                      <View testID="cut-front"><T v="body" w="semibold" tabular>{ftIn(r.frontIn)}</T></View>
                    </RowView>
                  </View>
                ))}
                {!tape ? <View testID="corner-cut-rough"><StatusChip status="warn" label={t("mod.gutters.draw.accRoughCut")} soft /></View> : null}
                <View onLayout={(e) => setSketchW(e.nativeEvent.layout.width)}>
                  {sketchW > 0 ? <CornerSketch d={drawing} f={corner} cut={cut.runs} w={sketchW} /> : null}
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
                  const next = splitCorner(before, corner);
                  setCornerSheet(null);
                  if (next === before) return;
                  commit(next, before);
                  toast.show(t("mod.gutters.draw.cornerSplit.done"), () => commit(before, cur.current.drawing));
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
