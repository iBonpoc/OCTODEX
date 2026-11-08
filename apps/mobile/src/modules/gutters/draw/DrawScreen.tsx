/**
 * «Замер» — the measuring canvas (docs/specs/33-gutters-module.md §7; docs/specs/33-gutters-canvas.md П20.4 M4b).
 * The whole screen is the drawing. One finger draws a run along the roof edge (it sticks to other runs' ends and to
 * 45° steps — from an end it continues the gutter), puts a downspout on a run, or («Выбрать») picks and drags an end;
 * two fingers move and zoom. The toolbar (36 visible,
 * 44 to touch — rule 3) sits at the bottom, under the right hand or under the left; the $ is always at the bottom —
 * a preview from the engine with TEST rates (rule 9), the estimate is M8. Storeys by colour + «эт N» (founder О3).
 * Saved 1 s after a gesture ends through the core's queue (module.op, spec 33 П21 M5a; tables П19), offline too;
 * `?m=<id>` opens a measurement, none — a new one; a module that is off or past its
 * trial draws but saves nothing, and says so before the work starts (§6, founder О2). Delete → «Отменить» 5 s (rule 5).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import Svg, { Line } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector, usePanGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import { computeGutterParts, gutterPreview } from "@octo/estimating-engine";
import { component, drawing as dt, radius, size as sizes, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { moduleState } from "@/modules/registry";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, IconButton, StatusChip } from "@/ui/controls";
import { Press, T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { RowView } from "@/ui/surfaces";
import { CanvasView, useLive } from "../canvas/CanvasView";
import { addDownspout, endAt, finishStroke, hitTest, moveEnd, pushHistory, redo, removeElement, restoreRemoved, setStory, startAt, undo, type History, type Stroke } from "../canvas/edit";
import { ftIn } from "../canvas/format";
import { forgetOldDraft, loadToolbarPlace, saveToolbarPlace, TOOLBAR_PLACES, type ToolbarPlace } from "../canvas/localStore";
import { makeModuleStore } from "../canvas/moduleStore";
import { gutterData, measurementOf } from "../data";
import { makeSaver } from "../canvas/draftStore";
import { DEFAULT_DS_ATTRS, DEFAULT_RUN_ATTRS, fromElements, toElements, type MeasurementRow } from "../canvas/model";
import { buildScene, fitView, storyOf, toPlan, toScreen, type Story, type View as PlanView } from "../canvas/scene";
import { LABEL_FONT, SvgPainter } from "../canvas/SvgPainter";
import { TEST_RATES } from "../canvas/testRates";
import { runLengthIn, toMeasurement, type Drawing, type P } from "../geometry";

type Tool = "line" | "ds" | "select";
/** a finger's reach on the glass, whatever the zoom: half the 44 pt touch target */
const FINGER = sizes.hitMin / 2;
const SAVE_AFTER_MS = 1000;
const EMPTY: Drawing = { runs: [], downspouts: [] };

/** a storey button: «эт N» with its colour on the canvas toolbar (the О3 exception lives only on this screen) */
function StoryButton({ n, onPress, label }: { n: Story; onPress: () => void; label: string }) {
  const { c } = useTheme();
  const s = component.dockBtn;
  return (
    <Press onPress={onPress} visibleHeight={s} accessibilityRole="button" accessibilityLabel={label} testID="draw-story">
      <View style={{ width: s, height: s, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: c.surf2, borderWidth: dt.runW / 2, borderColor: c.drawing.story[n - 1] }}>
        <T v="caption" w="semibold">{`${n}`}</T>
      </View>
    </Press>
  );
}

export default function DrawScreen() {
  const { t, money } = useI18n();
  const { c } = useTheme();
  const toast = useToast();
  const store = useStore();
  const params = useLocalSearchParams<{ m?: string }>();
  const ins = useSafeAreaInsets();
  const access = moduleState(store.db.company?.modules?.gutters).access;
  const canSave = access === "trial" || access === "paid";

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
  const live = useLive();

  // the latest values for gesture callbacks and the delayed save
  const cur = useRef({ drawing, view, tool, story, selected, m, canSave });
  cur.current = { drawing, view, tool, story, selected, m, canSave };
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
        saver.seed(v.elements);
        setDrawing(fromElements(v.elements));
      }
      setM(v?.m ?? { id: mid, label: null, status: "draft", propertyId: null, leadId: null });
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
  const pan = usePanGesture({
    runOnJS: true,
    maxPointers: 1,
    onBegin: (e) => {
      downAt.current = [e.x, e.y];
    },
    onActivate: () => {
      const { drawing: d, tool: tl } = cur.current;
      const p0 = plan(downAt.current[0], downAt.current[1]);
      const h = hitTest(d, p0, tolIn());
      // «Линия» from an end continues the gutter (a corner); only «Выбрать» drags an end
      if (tl === "select" && h?.kind === "end") {
        dragRef.current = { kind: "end", id: h.id, end: h.end, before: d };
        setSelected(h.id);
        return;
      }
      if (tl === "line") {
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
      const next = finishStroke(g, d, plan(e.x, e.y), tolIn(), e.canceled, { id, attrs: { ...DEFAULT_RUN_ATTRS, story: cur.current.story } });
      if (g.kind === "end") {
        if (e.canceled) setDrawing(g.before);
        else commit(next, g.before);
        return;
      }
      if (next !== d) {
        commit(next, d);
        setSelected(id);
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
        const next = addDownspout(d, id, p, tolIn() * 1.5, DEFAULT_DS_ATTRS);
        if (next !== d) {
          commit(next);
          setSelected(id);
        }
        return;
      }
      const h = hitTest(d, p, tolIn());
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
            dsText: (n) => t("mod.gutters.ds", { n }),
            storyText: (n) => t("mod.gutters.story", { n }),
          })
        : null,
    [drawing, view, size, selected, t],
  );

  const preview = useMemo(() => {
    if (!drawing.runs.length) return { totalCents: 0, unpriced: 0, gutterFt: "0" };
    return gutterPreview(computeGutterParts(toMeasurement(drawing)).parts, TEST_RATES);
  }, [drawing]);

  const sel = selected ? drawing.runs.find((r) => r.id === selected) ?? drawing.downspouts.find((s) => s.id === selected) : undefined;
  const selText = !sel
    ? null
    : "a" in sel
      ? t("mod.gutters.draw.selRun", { len: ftIn(runLengthIn(sel)), n: storyOf(sel.attrs.story) })
      : t("mod.gutters.draw.selDs", { n: storyOf(drawing.runs.find((r) => r.id === sel.runId)?.attrs.story) });

  const doUndo = () => {
    const u = undo(hist, drawing);
    if (!u) return;
    setHist(u.h);
    setDrawing(u.d);
    setSelected(null);
    later.current();
  };
  const doRedo = () => {
    const r = redo(hist, drawing);
    if (!r) return;
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
  const movePlace = () => {
    const p = TOOLBAR_PLACES[(TOOLBAR_PLACES.indexOf(place) + 1) % TOOLBAR_PLACES.length]!;
    setPlace(p);
    void saveToolbarPlace(p);
  };
  const back = () => {
    flush();
    if (router.canGoBack()) router.back();
    else router.replace("/company/modules");
  };

  const side = place !== "bottom";
  const tools = (
    <View testID="draw-toolbar" style={{ flexDirection: side ? "column" : "row", gap: space[2], alignItems: "center", padding: space[2], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: 1, borderColor: c.bd }}>
      <View testID="draw-tool-line"><IconButton icon="pencil" label={t("mod.gutters.draw.line")} active={tool === "line"} onPress={() => setTool("line")} /></View>
      <View testID="draw-tool-ds"><IconButton icon="pin" label={t("mod.gutters.draw.downspout")} active={tool === "ds"} onPress={() => setTool("ds")} /></View>
      <View testID="draw-tool-select"><IconButton icon="navigate" label={t("mod.gutters.draw.select")} active={tool === "select"} onPress={() => setTool("select")} /></View>
      <StoryButton n={story} onPress={nextStory} label={t("mod.gutters.draw.story", { n: story })} />
      <View testID="draw-undo"><IconButton icon="undo" label={t("mod.gutters.draw.undo")} onPress={doUndo} /></View>
      <View testID="draw-redo"><IconButton icon="repeat" label={t("mod.gutters.draw.redo")} onPress={doRedo} /></View>
      <View testID="draw-delete"><IconButton icon="trash" label={t("mod.gutters.draw.delete")} onPress={doDelete} /></View>
      <View testID="draw-place"><IconButton icon="sliders" label={t("mod.gutters.draw.place")} onPress={movePlace} /></View>
    </View>
  );

  const ghostLen = ghost ? Math.round(Math.hypot(ghost.b[0] - ghost.a[0], ghost.b[1] - ghost.a[1])) : 0;
  const gA = ghost && view ? toScreen(view, ghost.a) : null;
  const gB = ghost && view ? toScreen(view, ghost.b) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID="draw-screen">
      {/* the drawing under everything */}
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
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
      <View pointerEvents="box-none" style={{ paddingTop: ins.top + space[2], paddingLeft: ins.left + space[3], paddingRight: ins.right + space[3], gap: space[2] }}>
        <RowView>
          <View testID="draw-back"><IconButton icon="chevronLeft" label={t("mod.title")} onPress={back} /></View>
          <T v="heading" w="semibold">{t("mod.gutters.draw.title")}</T>
          <View style={{ flex: 1 }} />
          <View testID="draw-fit"><IconButton icon="expand" label={t("mod.gutters.draw.fit")} onPress={() => size.w && setView(fit(drawing, size))} /></View>
        </RowView>
        {canSave ? (
          savedOnce ? (
            <View testID="draw-saved" style={{ alignSelf: "flex-start" }}>
              <StatusChip status="ok" label={t("mod.gutters.draw.saved")} soft />
            </View>
          ) : null
        ) : (
          <View testID="draw-not-saved" style={{ gap: space[2], padding: space[3], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: 1, borderColor: c.bd }}>
            <StatusChip status="warn" label={t("mod.gutters.draw.notSaved")} />
            <T v="caption">{t(access === "expired" ? "mod.gutters.draw.expired" : "mod.gutters.draw.off")}</T>
            <View style={{ alignSelf: "flex-start" }}>
              <Button label={t("mod.gutters.draw.connect")} variant="secondary" onPress={() => router.push("/company/modules")} />
            </View>
          </View>
        )}
      </View>

      {!drawing.runs.length && !ghost ? (
        <View pointerEvents="none" style={{ position: "absolute", left: space[6], right: space[6], top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }} testID="draw-empty">
          <T tone="mut" center>{t("mod.gutters.draw.empty")}</T>
        </View>
      ) : null}
      {ghost ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: ins.top + space[8] + space[6], alignItems: "center" }}>
          <StatusChip status="neutral" label={ftIn(ghostLen)} />
        </View>
      ) : null}

      {/* bottom: the toolbar (bottom / right hand / left hand) and the $ — always at the bottom */}
      <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingLeft: ins.left + space[3], paddingRight: ins.right + space[3], paddingBottom: ins.bottom + space[3], gap: space[2] }}>
        <View pointerEvents="box-none" style={{ alignItems: place === "bottom" ? "center" : place === "right" ? "flex-end" : "flex-start" }}>{tools}</View>
        <View testID="draw-total" style={{ padding: space[3], borderRadius: radius.card, backgroundColor: c.ov, borderWidth: 1, borderColor: c.bd, gap: space[1] }}>
          {selText ? (
            <View testID="draw-selected">
              <T v="caption" w="semibold">{selText}</T>
            </View>
          ) : null}
          <RowView style={{ justifyContent: "space-between" }}>
            <View testID="draw-money">
              <T v="title" w="bold" tabular>{money(preview.totalCents)}</T>
            </View>
            <StatusChip status="info" label={t("mod.gutters.draw.test")} soft />
          </RowView>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="caption" tone="mut" tabular>{t("mod.gutters.draw.summary", { ft: Math.round(Number(preview.gutterFt)), ds: drawing.downspouts.length })}</T>
            {preview.unpriced ? <StatusChip status="warn" label={t("mod.gutters.draw.noPrice", { n: preview.unpriced })} soft /> : null}
          </RowView>
        </View>
      </View>
    </View>
  );
}
