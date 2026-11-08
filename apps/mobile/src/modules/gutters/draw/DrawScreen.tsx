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
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import Svg, { Line } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "react-native-reanimated";
import { GestureDetector, usePanGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import { computeGutterParts } from "@octo/estimating-engine";
import { breakpoint, component, drawing as dt, motion, radius, size as sizes, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { moduleState } from "@/modules/registry";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { Button, ChoiceChips, IconButton, StatusChip } from "@/ui/controls";
import { Icon, Press, T, type IconKey } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { ListRow, RowView } from "@/ui/surfaces";
import { useHideTabBar } from "@/nav/tabBarHide";
import { CanvasView, useLive } from "../canvas/CanvasView";
import { addDownspout, endAt, finishStroke, flipFace, moveDs, hitTest, moveEnd, pushHistory, redo, removeElement, restoreRemoved, setCornerMethod, setDsAttrs, setLength, setRunAttrs, setStory, startAt, undo, type History, type Stroke } from "../canvas/edit";
import type { DsAttrs, RunAttrs } from "../canvas/attrs";
import { AttrBody, DsAttrsView, QuickLength, RunAttrsView, type RunCorner } from "./AttrPanel";
import { MeasurePhotos } from "./Photos";
import { ftIn } from "../canvas/format";
import { forgetOldDraft, loadToolbarPlace, placeAt, saveToolbarPlace, TOOLBAR_PLACES, type ToolbarPlace } from "../canvas/localStore";
import { makeModuleStore } from "../canvas/moduleStore";
import { gutterData, measurementOf, photosOf } from "../data";
import { makeSaver } from "../canvas/draftStore";
import { fromElements, toElements, type MeasurementRow } from "../canvas/model";
import { choicesFor, newDsAttrs, newRunAttrs, readRules, toRulesOverride } from "../settings";
import { buildScene, fitView, storyOf, toPlan, toScreen, type Story, type View as PlanView } from "../canvas/scene";
import { DS_MARK_R, LABEL_FONT, SvgPainter } from "../canvas/SvgPainter";
import { listPreview, partName } from "../prices";
import { clientLangOf, estimateAction, estimateOfMeasurement, makeEstimate } from "../estimateLink";
import { tFor } from "@/i18n/translate";
import { cornerChoiceOf, findCorners, runEnds, runLengthIn, toMeasurement, type CornerChoice, type Drawing, type FoundCorner, type P } from "../geometry";

type Tool = "line" | "ds" | "select";
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
      <T v="micro" w={active ? "semibold" : undefined} tone={active ? "ink" : "mut"} numberOfLines={1}>{label}</T>
    </Press>
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
  /** 390: the attribute sheet is open (820/1280 show the panel whenever something is picked) */
  const [sheet, setSheet] = useState(false);
  /** 390: the sheet of the measurement's photos */
  const [photoSheet, setPhotoSheet] = useState(false);
  /** «Ещё»: «Вернуть» and where the toolbar sits — rare, off the main row (П20.8) */
  const [moreSheet, setMoreSheet] = useState(false);
  /** the gutter just drawn: its length by hand at once (просьба основателя 08.11) */
  const [quickRun, setQuickRun] = useState<string | null>(null);
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
  const [hint, setHint] = useState<Tool | null>(null);
  const live = useLive();

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
        saver.seed(toElements(d, mid));
        setDrawing(d);
      }
      // a new one from a lead or a property is linked to it (S4g); from home — a draft without either (S1b)
      const one = (x: string | string[] | undefined) => (typeof x === "string" && x ? x : null);
      setM(v?.m ?? { id: mid, label: null, status: "draft", propertyId: one(params.property), leadId: one(params.lead) });
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

  /** one finished edit: history, the drawing, the save */
  const commit = useCallback(
    (next: Drawing, prev = cur.current.drawing) => {
      if (next === prev) return;
      setHint(null);
      setHist((h) => pushHistory(h, prev));
      setDrawing(next);
      later.current();
    },
    [],
  );

  const tolIn = () => FINGER / (cur.current.view?.k ?? 1);
  const plan = (x: number, y: number): P => (cur.current.view ? toPlan(cur.current.view, [x, y]) : [0, 0]);

  // one finger: draw a run, or drag an end of the picked run
  const dragRef = useRef<Stroke | null>(null);
  // where the finger touched down: the pan activates only after it has moved a little
  const downAt = useRef<[number, number]>([0, 0]);
  // when it touched down: held still before moving = a long press (founder 08.11: from an end cap — a new line)
  const downTime = useRef(0);
  const pan = usePanGesture({
    runOnJS: true,
    maxPointers: 1,
    onBegin: (e) => {
      downAt.current = [e.x, e.y];
      downTime.current = Date.now();
    },
    onActivate: () => {
      const { drawing: d, tool: tl } = cur.current;
      const p0 = plan(downAt.current[0], downAt.current[1]);
      const h = hitTest(d, p0, tolIn());
      const held = Date.now() - downTime.current >= motion.durSlow;
      // a downspout under the finger slides along its run (founder 08.11), whatever the tool
      if (h?.kind === "ds" && cur.current.canSave) {
        dragRef.current = { kind: "ds", id: h.id, before: d };
        setSelected(h.id);
        return;
      }
      // «Линия» from an end continues the gutter (a corner); so does a long press on an end with any tool;
      // a quick drag of an end with «Выбрать» moves it
      if (tl === "select" && h?.kind === "end" && !held) {
        dragRef.current = { kind: "end", id: h.id, end: h.end, before: d };
        setSelected(h.id);
        return;
      }
      if (tl === "line" || (held && h?.kind === "end")) {
        const a = startAt(d, p0, tolIn());
        dragRef.current = { kind: "line", a };
        setGhost({ a, b: a });
      }
    },
    onUpdate: (e) => {
      const g = dragRef.current;
      if (!g) return;
      const p = plan(e.x, e.y);
      const d = cur.current.drawing;
      if (g.kind === "line") setGhost({ a: g.a, b: endAt(d, g.a, p, tolIn()) });
      else if (g.kind === "ds") setDrawing(moveDs(g.before, g.id, p));
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
      if (g.kind === "end" || g.kind === "ds") {
        if (e.canceled) setDrawing(g.before);
        else commit(next, g.before);
        return;
      }
      if (next !== d) {
        commit(next, d);
        setSelected(id);
        if (next.runs.some((r) => r.id === id)) setQuickRun(id);
      }
    },
  });
  // a tap: the downspout tool puts one on the nearest run; otherwise pick what is under the finger
  const tap = useTapGesture({
    runOnJS: true,
    onActivate: (e) => {
      const { drawing: d, tool: tl } = cur.current;
      const p = plan(e.x, e.y);
      if (tl === "ds") {
        const id = Crypto.randomUUID();
        const next = addDownspout(d, id, p, tolIn() * 1.5, newDsAttrs(cur.current.ch));
        if (next !== d) {
          commit(next);
          setSelected(id);
          setFresh(id);
        }
        return;
      }
      const h = hitTest(d, p, tolIn());
      if (h) setHint(null);
      // an end (founder 08.11): an end cap swaps left ↔ right (the whole line's face); a corner asks inside / outside
      if (h?.kind === "end" && cur.current.canSave) {
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
            cornerText: (kind, splash) => {
              const k = t(kind === "in" ? "mod.gutters.draw.cornerIn" : kind === "out" ? "mod.gutters.draw.cornerOut" : "mod.gutters.draw.cornerBay");
              return splash ? t("mod.gutters.draw.cornerSplash", { k }) : k;
            },
            faceOff: dt.runW * 2,
            dimDs: dim ? fresh : null,
            gridMinPx: space[6],
          })
        : null,
    [drawing, view, size, selected, t, dim, fresh],
  );

  // M7d (spec 33 П22.10): a part with an item in the company's price list takes its price, the rest the test rate
  const catalog = store.db.catalog;
  const parts = useMemo(() => (drawing.runs.length ? computeGutterParts(toMeasurement(drawing, { method: rules.corner }), rules.over).parts : []), [drawing, rules]);
  const preview = useMemo(() => {
    if (!parts.length) return { totalCents: 0, unpriced: 0, gutterFt: "0", listed: 0, test: true };
    return listPreview(parts, catalog);
  }, [parts, catalog]);

  const sel = selected ? drawing.runs.find((r) => r.id === selected) ?? drawing.downspouts.find((s) => s.id === selected) : undefined;
  const selText = !sel
    ? null
    : "a" in sel
      ? t("mod.gutters.draw.selRun", { len: ftIn(runLengthIn(sel)), n: storyOf(sel.attrs.story) })
      : t("mod.gutters.draw.selDs", { n: storyOf(drawing.runs.find((r) => r.id === sel.runId)?.attrs.story) });

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
  const corner = cornerSheet ? findCorners(drawing).find((f) => f.id === cornerSheet) : undefined;
  const cornerKind = (kind: "in" | "out") => {
    if (corner && corner.kind !== kind && corner.kind !== "bay") commit(flipFace(cur.current.drawing, corner.runs[0].id));
    setCornerSheet(null);
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
      {"a" in sel ? <RunAttrsView run={sel} onAttrs={onRunAttrs} onLength={onLength} ch={ch} corners={runCorners} onCorner={onCorner} compact={!wide} /> : <DsAttrsView ds={sel} onAttrs={onDsAttrs} ch={ch} compact={!wide} />}
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
  const gripPan = usePanGesture({
    runOnJS: true,
    onUpdate: (e) => setGripAt([e.translationX, e.translationY]),
    onDeactivate: (e) => {
      setGripAt([0, 0]);
      if (e.canceled) return;
      const p = placeAt(e.absoluteX, e.absoluteY, win.width, win.height);
      setPlace(p);
      void saveToolbarPlace(p);
    },
  });
  const pickPlace = (p: ToolbarPlace) => {
    setPlace(p);
    setMoreSheet(false);
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
  /** S1b: a saved draft without a lead → the core's new-lead form; the new lead takes the draft (ModuleDef.leadCreated) */
  const toLead = () => {
    if (timer.current) clearTimeout(timer.current);
    flush();
    if (m) router.push(`/lead/new?module=gutters&ref=${encodeURIComponent(m.id)}`);
  };
  const back = () => {
    flush();
    if (router.canGoBack()) router.back();
    else router.replace("/company/modules");
  };

  // M8b (spec 33 П23.8, S5g): «Смета» / «Обновить смета» / «Открыть смету» — through the core's store
  const action = canSave && inStore ? estimateAction(store.db, inStore, drawing.runs.length > 0) : ({ kind: "none" } as const);
  /** one press at a time; after a made estimate the screen is left — the flag stays (a second press of an old render
   *  would make a second estimate, review M8b №2) */
  const busy = useRef(false);
  const doEstimate = async () => {
    const mm = cur.current.m;
    if (!mm || busy.current) return;
    busy.current = true;
    let left = false;
    try {
      // the drawing first: the revision and the lines are of what is on the screen, and a change made a second ago
      // turns «Открыть смету» into «Обновить смету» (review M8b №7)
      if (timer.current) clearTimeout(timer.current);
      const flushed = await saver.flush(mm, toElements(cur.current.drawing, mm.id));
      const db = storeRef.current.db;
      const est = estimateOfMeasurement(db, mm.id);
      const signed = !!est && (est.status === "approved" || est.status === "awaiting_countersign");
      // a signed one only opens; «Открыть смету» opens unless the drawing has just changed
      if (est && (signed || (action.kind === "open" && flushed !== "saved"))) {
        left = true;
        router.push(`/estimate/${est.id}`);
        return;
      }
      const now = gutterData(db).measurements.find((x) => x.id === mm.id) ?? mm;
      // lines go to the client: a part without an item is named in the CLIENT's language (rule 7)
      const tc = tFor(clientLangOf(db, now));
      const r = makeEstimate(storeRef.current, {
        m: now,
        elements: toElements(cur.current.drawing, mm.id),
        parts,
        catalog: db.catalog,
        name: (p) => partName(tc, p),
        fallbackTitle: tc("mod.gutters.title"),
      });
      if (!r.ok) {
        toast.show(t(r.reason === "noClient" ? "mod.gutters.est.noClient" : r.reason === "signed" ? "mod.gutters.est.signed" : "mod.gutters.est.off"));
        return;
      }
      left = true;
      toast.show(t(r.updated ? "mod.gutters.est.updated" : "mod.gutters.est.made"), r.undo);
      router.push(`/estimate/new?id=${encodeURIComponent(r.estimateId)}`);
    } finally {
      if (!left) busy.current = false;
    }
  };
  // «Смета из замера» in the lead (place lead): the canvas opens and does what the button does, once
  const autoEstimate = useRef(params.estimate === "1");
  useEffect(() => {
    if (!autoEstimate.current || !inStore || !drawing.runs.length) return;
    autoEstimate.current = false;
    if (action.kind === "make" || action.kind === "update" || action.kind === "open") void doEstimate();
  });
  const estimateButton =
    action.kind === "make" || action.kind === "update" || action.kind === "open" ? (
      <View testID={`draw-estimate-${action.kind === "open" && action.signed ? "signed" : action.kind}`}>
        <Button
          label={t(action.kind === "make" ? "mod.gutters.est.make" : action.kind === "update" ? "mod.gutters.est.update" : action.signed ? "mod.gutters.est.signed" : "mod.gutters.est.open")}
          icon={action.kind === "open" ? "chevronRight" : "plus"}
          size="sm"
          variant={action.kind === "open" ? "secondary" : "primary"}
          onPress={() => void doEstimate()}
        />
      </View>
    ) : null;

  // on its side (founder 08.11): one strip at the bottom — the card and the toolbar as a row beside it (a column would
  // not fit the height); the grip puts the toolbar left or right of the card
  const at = place;
  const side = !flat && at !== "bottom";
  // the grip (founder 08.11): drag the toolbar, let go — it sticks to the nearest edge
  const grip = (
    <GestureDetector gesture={gripPan}>
      <View testID="draw-grip" accessibilityRole="adjustable" accessibilityLabel={t("mod.gutters.draw.grip")} style={{ minWidth: side ? sizes.hitMin : sizes.iconMd, minHeight: side ? sizes.iconMd : sizes.hitMin, alignItems: "center", justifyContent: "center" }}>
        <Icon name="grip" s={sizes.iconMd} color={c.mut} />
      </View>
    </GestureDetector>
  );
  /** 390 at the bottom: the row takes the width, six cells share it */
  const grow = !side && !wide;
  const tools = (
    <View testID="draw-toolbar" style={{ flexDirection: side ? "column" : "row", alignSelf: grow ? "stretch" : undefined, gap: space[1], alignItems: "center", padding: space[2], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: 1, borderColor: c.bd, flexShrink: 0, transform: [{ translateX: gripAt[0] }, { translateY: gripAt[1] }] }}>
      {grip}
      <View testID="draw-tool-line" style={grow ? { flex: 1 } : undefined}><ToolCell icon="pencil" label={t("mod.gutters.draw.line")} active={tool === "line"} onPress={() => pick("line")} grow={grow} /></View>
      <View testID="draw-tool-ds" style={grow ? { flex: 1 } : undefined}><ToolCell icon="downspout" label={t("mod.gutters.draw.downspout")} active={tool === "ds"} onPress={() => pick("ds")} grow={grow} /></View>
      <View testID="draw-tool-select" style={grow ? { flex: 1 } : undefined}><ToolCell icon="cursor" label={t("mod.gutters.draw.select")} active={tool === "select"} onPress={() => pick("select")} grow={grow} /></View>
      <View testID="draw-story" style={grow ? { flex: 1 } : undefined}><ToolCell body={t("mod.gutters.draw.storyShort", { n: story })} ring={c.drawing.story[story - 1]} label={t("mod.gutters.draw.storyCell")} a11y={t("mod.gutters.draw.story", { n: story })} onPress={nextStory} grow={grow} /></View>
      <View testID="draw-undo" style={grow ? { flex: 1 } : undefined}><ToolCell icon="undo" label={t("mod.gutters.draw.undo")} onPress={doUndo} grow={grow} /></View>
      <View testID="draw-more" style={grow ? { flex: 1 } : undefined}><ToolCell icon="more" label={t("mod.gutters.draw.more")} onPress={() => setMoreSheet(true)} grow={grow} /></View>
    </View>
  );
  const nextDs = canSave && drawing.runs.length > 0 && drawing.downspouts.length === 0 && tool !== "ds" && !ghost;
  const hintText = hint && !(hint === "line" && !drawing.runs.length) ? t(`mod.gutters.draw.hint.${hint}`) : null;

  const ghostLen = ghost ? Math.round(Math.hypot(ghost.b[0] - ghost.a[0], ghost.b[1] - ghost.a[1])) : 0;
  const gA = ghost && view ? toScreen(view, ghost.a) : null;
  const gB = ghost && view ? toScreen(view, ghost.b) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID="draw-screen">
      {/* the drawing under everything */}
      <View style={{ position: "absolute", left: 0, right: panelSide, top: 0, bottom: 0 }}>
        <CanvasView view={view ?? { k: 1, ox: 0, oy: 0 }} onView={setView} live={live} size={size} onSize={setSize} panPointers={2} testID="draw-canvas">
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
        </RowView>
        {flat && canSave ? null : canSave ? (
          <RowView style={{ flexWrap: "wrap", gap: space[2] }}>
            {savedOnce ? (
              <View testID="draw-saved">
                <StatusChip status="ok" label={t("mod.gutters.draw.saved")} soft />
              </View>
            ) : null}
            {lead ? (
              <View testID="draw-lead">
                <Button label={lead.name} icon="user" size="sm" variant="ghost" onPress={() => router.push(`/lead/${lead.id}`)} />
              </View>
            ) : inStore && !leadId ? (
              <View testID="draw-to-lead">
                <Button label={t("mod.gutters.draw.toLead")} icon="plus" size="sm" variant="secondary" onPress={toLead} />
              </View>
            ) : null}
            {mPhotos && !wide ? (
              <View testID="draw-photos-open">
                <Button label={t("mod.gutters.photo.open")} icon="camera" size="sm" variant="ghost" onPress={() => setPhotoSheet(true)} />
              </View>
            ) : null}
          </RowView>
        ) : (
          <View testID="draw-not-saved" style={{ gap: space[2], padding: space[3], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: 1, borderColor: c.bd }}>
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
      </View>

      {!drawing.runs.length && !ghost ? (
        <View pointerEvents="none" style={{ position: "absolute", left: space[6], right: space[6] + panelSide, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }} testID="draw-empty">
          <T tone="mut" center>{t("mod.gutters.draw.empty")}</T>
        </View>
      ) : null}
      {ghost ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: panelSide, top: ins.top + space[8] + space[6], alignItems: "center" }}>
          <StatusChip status="neutral" label={ftIn(ghostLen)} />
        </View>
      ) : null}

      {/* bottom: the toolbar (bottom / right hand / left hand) and the $ — always at the bottom */}
      <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingLeft: ins.left + space[3], paddingRight: ins.right + space[3] + panelSide, paddingBottom: ins.bottom + space[3], gap: space[2] }}>
        {hintText ? (
          <View pointerEvents="none" testID="draw-hint" style={{ alignSelf: "center", paddingVertical: space[2], paddingHorizontal: space[3], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: 1, borderColor: c.bd }}>
            <T v="caption" w="semibold" center>{hintText}</T>
          </View>
        ) : null}
        {flat ? null : <View pointerEvents="box-none" style={{ alignItems: at === "bottom" ? (grow ? "stretch" : "center") : at === "right" ? "flex-end" : "flex-start" }}>{tools}</View>}
        <View pointerEvents="box-none" style={flat ? { flexDirection: at === "left" ? "row-reverse" : "row", alignItems: "flex-end", gap: space[2] } : undefined}>
        <View testID="draw-total" style={{ padding: space[3], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: 1, borderColor: c.bd, gap: space[1], ...(flat ? { flex: 1 } : {}) }}>
          {selText ? (
            // 390: the words on their own line, the buttons under them (a narrow row broke «эт / 1», П20.9)
            <View style={{ flexDirection: wide || flat ? "row" : "column", alignItems: wide || flat ? "center" : "stretch", justifyContent: "space-between", gap: space[2] }}>
              <View testID="draw-selected" style={wide || flat ? { flex: 1 } : undefined}>
                <T v="caption" w="semibold">{selText}</T>
              </View>
              <RowView style={{ gap: space[2], justifyContent: wide || flat ? "flex-end" : "space-between" }}>
                <View testID="draw-delete">
                  <Button label={t("mod.gutters.draw.delete")} icon="trash" size="sm" variant="ghost" onPress={doDelete} />
                </View>
                {!wide ? (
                  <View testID="draw-props">
                    <Button label={t("mod.gutters.attr.props")} icon="ruler" size="sm" variant="secondary" onPress={() => setSheet(true)} />
                  </View>
                ) : null}
              </RowView>
            </View>
          ) : null}
          {/* what next (П20.9): gutters drawn, no downspout yet → put them; then the «Смета» button is the next step */}
          {nextDs && !flat ? (
            <View testID="draw-next">
              <RowView style={{ justifyContent: "space-between", gap: space[2] }}>
                <T v="caption" tone="mut" style={{ flex: 1 }}>{t("mod.gutters.draw.nextDs")}</T>
                <Button label={t("mod.gutters.draw.downspout")} icon="downspout" size="sm" variant="secondary" onPress={() => pick("ds")} />
              </RowView>
            </View>
          ) : null}
          <RowView style={{ justifyContent: "space-between" }}>
            <View testID="draw-money">
              <T v="title" w="bold" tabular>{money(preview.totalCents)}</T>
            </View>
            {preview.test ? <View testID="draw-test-prices"><StatusChip status="info" label={t("mod.gutters.draw.test")} soft /></View> : null}
          </RowView>
          {estimateButton}
          {flat ? null : <RowView style={{ justifyContent: "space-between" }}>
            <T v="caption" tone="mut" tabular>{t("mod.gutters.draw.summary", { ft: Math.round(Number(preview.gutterFt)), ds: drawing.downspouts.length })}</T>
            {preview.unpriced ? <StatusChip status="warn" label={t("mod.gutters.draw.noPrice", { n: preview.unpriced })} soft /> : null}
          </RowView>}
        </View>
        {flat ? tools : null}
        </View>
      </View>

      {/* 820/1280: the panel on the right (what is picked, or how to pick); 390: the sheet from «Свойства» */}
      {wide ? (
        <View testID="draw-panel" style={{ position: "absolute", right: ins.right + space[3], top: ins.top + space[2], bottom: ins.bottom + space[3], width: component.panelW, padding: space[3], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: 1, borderColor: c.bd, gap: space[2] }}>
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
        <AttrBody>{attrs}</AttrBody>
      </Sheet>
      <Sheet visible={canSave && !!quick} onClose={() => setQuickRun(null)}>
        {quick ? <QuickLength run={quick} onLength={(n) => commit(setLength(cur.current.drawing, quick.id, n))} onDone={() => setQuickRun(null)} /> : null}
      </Sheet>
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
            <T v="caption" tone="mut">{t("mod.gutters.draw.cornerNote")}</T>
          </View>
        ) : null}
      </Sheet>
      <Sheet visible={moreSheet} onClose={() => setMoreSheet(false)}>
        <View testID="draw-more-sheet" style={{ gap: space[2] }}>
          <View testID="draw-redo">
            <ListRow title={t("mod.gutters.draw.redo")} left={<Icon name="redo" s={sizes.iconMd} color={c.ink} />} onPress={() => { setMoreSheet(false); doRedo(); }} />
          </View>
          <T v="caption" tone="mut">{t("mod.gutters.draw.placeTitle")}</T>
          {TOOLBAR_PLACES.map((p) => (
            <View key={p} testID={`draw-place-${p}`}>
              <ListRow title={t(`mod.gutters.draw.place.${p}`)} left={<Icon name={p === place ? "check" : "sliders"} s={sizes.iconMd} color={p === place ? c.ink : c.mut} />} onPress={() => pickPlace(p)} />
            </View>
          ))}
        </View>
      </Sheet>
      <Sheet visible={!wide && photoSheet && !!mPhotos} onClose={() => setPhotoSheet(false)}>
        {mPhotos}
      </Sheet>
    </View>
  );
}
