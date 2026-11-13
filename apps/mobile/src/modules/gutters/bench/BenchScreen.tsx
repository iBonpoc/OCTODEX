/**
 * «Проверка скорости холста» (docs/specs/33-gutters-module.md §9, П14.2; docs/specs/33-gutters-canvas.md П20.3).
 * The founder opens it in Expo Go on his iPhone and Android, taps «Начать» and sends the copied result. One run:
 * opening ×5 → pan and zoom 4 s (the UI-thread transform, frames counted on the UI thread) → dragging a point 4 s
 * (the scene rebuilt and redrawn every frame) → 20 taps (select → the first frame after the commit). The thresholds
 * are the founder's: pan p90 ≥ 55 fps, drag ≥ 50, tap < 100 ms, open < 500 ms. Nothing is saved.
 */
import { APP_NAME } from "@/config/product";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PixelRatio, Platform, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { cancelAnimation, Easing, useFrameCallback, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { motion, space } from "@octo/design-tokens";
import { BUILD } from "@/config/version";
import { useI18n } from "@/i18n";
import { Button, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, RowView, Screen } from "@/ui/surfaces";
import { CanvasView, useLive } from "../canvas/CanvasView";
import { buildScene, fitView, type Story, type View as PlanView } from "../canvas/scene";
import { DS_MARK_R, LABEL_FONT, SvgPainter } from "../canvas/SvgPainter";
import { fpsP90, fromHistogram, intervals, LIMITS, passes, pct, reportText, type BenchKey, type BenchResult } from "../canvas/stats";
import type { Drawing } from "../geometry";
import { benchDrawing } from "./benchScene";

const PHASE_MS = 4000;
const OPENS = 5;
const TAPS = 20;
const HIST = 101;
const ORDER: BenchKey[] = ["open", "pan", "drag", "tap"];
const nameKey = { pan: "mod.gutters.bench.pan", drag: "mod.gutters.bench.drag", tap: "mod.gutters.bench.tap", open: "mod.gutters.bench.open" } as const;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(() => r(now())));

/** the drawing with one point moved (the drag) */
const moved = (d: Drawing, dx: number, dy: number): Drawing => {
  const [r0, ...rest] = d.runs;
  return r0 ? { ...d, runs: [{ ...r0, b: [r0.b[0] + Math.round(dx), r0.b[1] + Math.round(dy)] }, ...rest] } : d;
};

export default function BenchScreen() {
  const { t } = useI18n();
  const toast = useToast();
  const win = useWindowDimensions();
  const base = useMemo(benchDrawing, []);
  const [drawing, setDrawing] = useState<Drawing>(base.drawing);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<PlanView | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState(0);
  const [phase, setPhase] = useState<BenchKey | null>(null);
  const [results, setResults] = useState<BenchResult[]>([]);
  const live = useLive();

  // the UI thread's frames: a histogram of intervals in whole ms (no arrays crossing threads per frame)
  const hist = useSharedValue<number[]>(new Array(HIST).fill(0));
  const frames = useFrameCallback((f) => {
    "worklet";
    const d = f.timeSincePreviousFrame;
    if (d == null) return;
    const i = Math.min(HIST - 1, Math.round(d));
    hist.modify((h) => {
      "worklet";
      h[i] = (h[i] ?? 0) + 1;
      return h;
    });
  }, false);

  const fit = useCallback((s: { w: number; h: number }) => fitView(base.drawing.runs.flatMap((r) => [r.a, r.b]), s, space[6]), [base]);
  useEffect(() => {
    if (size.w > 0 && size.h > 0) setView(fit(size));
  }, [size, fit]);

  const scene = useMemo(
    () =>
      view
        ? buildScene(drawing, {
            view,
            viewport: size,
            fontSize: LABEL_FONT,
            padX: space[1],
            gap: space[1],
            selected,
            keepAll: true,
            // the canvas's load: labels go round the downspouts' marks (spec 33 П20.8)
            dsPad: DS_MARK_R,
            dsText: (n) => t("mod.gutters.ds", { n }),
            storyText: (n: Story) => t("mod.gutters.story", { n }),
            extra: base.marks.map((m) => ({ id: m.id, at: m.at, text: t("mod.gutters.story", { n: m.story }), kind: "story" as const })),
          })
        : null,
    // openKey: every «open» builds the scene again — its time is part of opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawing, view, size, selected, base, t, openKey],
  );

  // opening: the time from asking for the drawing to its first frame on screen
  const opened = useRef<((ms: number) => void) | null>(null);
  const openT0 = useRef(0);
  const onPainted = () => {
    const cb = opened.current;
    if (!cb) return;
    opened.current = null;
    void nextFrame().then((t1) => cb(t1 - openT0.current));
  };
  // a tap: from the select to the first frame after React committed it
  const tapped = useRef<((ms: number) => void) | null>(null);
  const tapT0 = useRef(0);
  useEffect(() => {
    const cb = tapped.current;
    if (!cb) return;
    tapped.current = null;
    void nextFrame().then((t1) => cb(t1 - tapT0.current));
  }, [selected]);

  const runOpen = async (): Promise<BenchResult> => {
    const ms: number[] = [];
    for (let i = 0; i < OPENS; i++) {
      ms.push(
        await new Promise<number>((res) => {
          opened.current = res;
          openT0.current = now();
          setOpenKey((k) => k + 1);
        }),
      );
    }
    return { key: "open", value: pct(ms, 90), samples: ms.length };
  };
  const runPan = async (): Promise<BenchResult> => {
    hist.value = new Array(HIST).fill(0);
    live.fx.value = size.w / 2;
    live.fy.value = size.h / 2;
    const half = PHASE_MS / 8;
    const ease = Easing.inOut(Easing.quad);
    live.tx.value = withRepeat(withSequence(withTiming(size.w / 4, { duration: half, easing: ease }), withTiming(-size.w / 4, { duration: half * 2, easing: ease }), withTiming(0, { duration: half, easing: ease })), 2);
    live.s.value = withRepeat(withSequence(withTiming(2, { duration: half * 2, easing: ease }), withTiming(1, { duration: half * 2, easing: ease })), 1);
    frames.setActive(true);
    await new Promise((r) => setTimeout(r, PHASE_MS));
    frames.setActive(false);
    cancelAnimation(live.tx);
    cancelAnimation(live.s);
    live.tx.value = 0;
    live.s.value = 1;
    const iv = fromHistogram(hist.value);
    return { key: "pan", value: fpsP90(iv), samples: iv.length };
  };
  const runDrag = async (): Promise<BenchResult> => {
    const stamps: number[] = [];
    const t0 = now();
    for (let ts = await nextFrame(); ts - t0 < PHASE_MS; ts = await nextFrame()) {
      stamps.push(ts);
      const a = ((ts - t0) / PHASE_MS) * Math.PI * 4;
      setDrawing(moved(base.drawing, Math.cos(a) * 60, Math.sin(a) * 60));
    }
    setDrawing(base.drawing);
    const iv = intervals(stamps);
    return { key: "drag", value: fpsP90(iv), samples: iv.length };
  };
  const runTap = async (): Promise<BenchResult> => {
    const ids = [...base.drawing.runs.map((r) => r.id), ...base.drawing.downspouts.map((d) => d.id)];
    const ms: number[] = [];
    for (let i = 0; i < TAPS; i++) {
      ms.push(
        await new Promise<number>((res) => {
          tapped.current = res;
          tapT0.current = now();
          setSelected(ids[(i * 7) % ids.length]!);
        }),
      );
      await new Promise((r) => setTimeout(r, motion.durFast));
    }
    setSelected(null);
    return { key: "tap", value: pct(ms, 90), samples: ms.length };
  };

  const start = async () => {
    setResults([]);
    setView(fit(size));
    const out: BenchResult[] = [];
    for (const k of ORDER) {
      setPhase(k);
      await new Promise((r) => setTimeout(r, motion.durSlow));
      out.push(await { open: runOpen, pan: runPan, drag: runDrag, tap: runTap }[k]());
      setResults([...out]);
    }
    setPhase(null);
  };

  const word = (ok: boolean) => t(ok ? "mod.gutters.bench.pass" : "mod.gutters.bench.fail");
  const head = `${APP_NAME} · ${BUILD} · ${Platform.OS} ${String(Platform.Version)} · ${Math.round(win.width)}×${Math.round(win.height)} @${PixelRatio.get()}`;
  const copy = async () => {
    await Clipboard.setStringAsync(reportText(results, head, word, (k) => t(nameKey[k])));
    toast.show(t("mod.gutters.bench.copied"));
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace("/company/modules"));
  const done = results.length === ORDER.length && !phase;
  const canvasH = Math.round(win.height * (done ? 0.36 : 0.5));

  return (
    <Screen title={t("mod.gutters.bench.title")} back={back} scroll={false}>
      <T v="caption" tone="mut">{t("mod.gutters.bench.intro")}</T>
      <View testID="bench-canvas" style={{ height: canvasH }}>
        {view && scene ? (
          <CanvasView view={view} onView={setView} live={live} size={size} onSize={setSize}>
            <View key={openKey} onLayout={onPainted} testID="bench-drawing">
              <SvgPainter scene={scene} w={size.w} h={size.h} />
            </View>
          </CanvasView>
        ) : (
          <CanvasView view={{ k: 1, ox: 0, oy: 0 }} onView={() => {}} live={live} size={size} onSize={setSize}>
            <View />
          </CanvasView>
        )}
      </View>
      {phase ? (
        <View testID="bench-running">
          <StatusChip status="info" label={t("mod.gutters.bench.running", { what: t(nameKey[phase]) })} />
        </View>
      ) : (
        <RowView>
          <View testID="bench-start">
            <Button label={t(results.length ? "mod.gutters.bench.again" : "mod.gutters.bench.start")} icon="check" onPress={() => void start()} disabled={!view} />
          </View>
          {done ? (
            <View testID="bench-copy">
              <Button label={t("mod.gutters.bench.copy")} variant="secondary" onPress={() => void copy()} />
            </View>
          ) : null}
        </RowView>
      )}
      {results.length ? (
        <View testID="bench-results">
          <Card>
            {results.map((r) => {
              const ok = passes(r.key, r.value);
              const n = Number.isFinite(r.value) ? Math.round(r.value) : 0;
              return (
                <View key={r.key} testID={`bench-${r.key}`} style={{ gap: space[1] }}>
                  <RowView style={{ justifyContent: "space-between" }}>
                    <T w="semibold">{t(nameKey[r.key])}</T>
                    <StatusChip status={ok ? "ok" : "bad"} label={word(ok)} />
                  </RowView>
                  <T v="caption" tone="mut" tabular>
                    {t(LIMITS[r.key].kind === "fps" ? "mod.gutters.bench.fps" : "mod.gutters.bench.ms", { n, limit: LIMITS[r.key].limit })}
                  </T>
                </View>
              );
            })}
          </Card>
          {done ? <T v="caption" tone="mut">{t("mod.gutters.bench.send")}</T> : null}
        </View>
      ) : null}
    </Screen>
  );
}
