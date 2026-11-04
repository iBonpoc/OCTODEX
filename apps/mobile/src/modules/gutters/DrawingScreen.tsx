import { useMemo, useRef, useState, type ComponentRef } from "react";
import { Image, Pressable, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native"; // ds-allow: full-canvas tap area for the drawing
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { font, radius, space } from "@octo/design-tokens";
import type { Pt } from "@octo/estimating-engine";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { summarize, type Calibration } from "./drawing";
import { Button, Segmented, Stepper } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, RowView, Screen } from "@/ui/surfaces";

type Mode = "calib" | "gutter" | "ds";
const ASPECT = 0.75; // 4:3 canvas

/** Gutter drawing over the contractor's own photo (ADR-004). Feeds the quick estimate. */
export default function DrawScreen() {
  const { customerId, propertyId } = useLocalSearchParams<{ customerId?: string; propertyId?: string }>();
  const { t } = useI18n();
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("calib");
  const [cal, setCal] = useState<Calibration>({ knownFt: 16 });
  const [runs, setRuns] = useState<Pt[][]>([[]]);
  const [ds, setDs] = useState<Pt[]>([]);
  const [roofSide, setRoofSide] = useState<"left" | "right">("right");
  const sum = useMemo(() => summarize(runs, cal, ds, roofSide), [runs, cal, ds, roofSide]);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const h = w * ASPECT;
  const px = (p: Pt) => [p[0] * w, p[1] * w] as const;

  const canvas = useRef<ComponentRef<typeof View>>(null);
  // pageX/pageY minus the canvas position works the same on iOS, Android and web (locationX does not on web)
  const tap = (e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    canvas.current?.measureInWindow((x: number, y: number) => addPoint([(pageX - x) / w, (pageY - y) / w]));
  };
  const addPoint = (p: Pt) => {
    if (!w || p[0] < 0 || p[0] > 1 || p[1] < 0 || p[1] > ASPECT) return;
    Haptics.selectionAsync().catch(() => {});
    if (mode === "calib") setCal((x) => (!x.a || x.b ? { ...x, a: p, b: undefined } : { ...x, b: p }));
    else if (mode === "gutter") setRuns((r) => [...r.slice(0, -1), [...(r[r.length - 1] ?? []), p]]);
    else setDs((d) => [...d, p]);
  };
  const undo = () => {
    if (mode === "calib") setCal((x) => (x.b ? { ...x, b: undefined } : { ...x, a: undefined }));
    else if (mode === "ds") setDs((d) => d.slice(0, -1));
    else
      setRuns((r) => {
        const last = r[r.length - 1] ?? [];
        if (last.length > 0) return [...r.slice(0, -1), last.slice(0, -1)];
        return r.length > 1 ? r.slice(0, -1) : r;
      });
  };
  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 }).catch(() => null);
    if (res && !res.canceled && res.assets[0]) setPhoto(res.assets[0].uri);
  };
  const toEstimate = () => {
    const q = new URLSearchParams();
    if (customerId) q.set("customerId", customerId);
    if (propertyId) q.set("propertyId", propertyId);
    q.set("lengthFt", String(Math.round(sum.totalFt)));
    q.set("out", String(sum.outside));
    q.set("in", String(sum.inside));
    q.set("ds", String(sum.downspouts));
    router.replace(`/estimate/gutters?${q.toString()}`);
  };

  const hint = mode === "calib" ? t("draw.hintCalib") : mode === "gutter" ? t("draw.hintGutter") : t("draw.hintDs");
  const gridLines = Array.from({ length: 9 }, (_, i) => (i + 1) / 10);

  return (
    <Screen title={t("draw.title")} back={back}>
      <Segmented<Mode>
        full
        value={mode}
        onChange={setMode}
        items={[
          { key: "calib", label: t("draw.modeCalib") },
          { key: "gutter", label: t("draw.modeGutter") },
          { key: "ds", label: t("draw.modeDs") },
        ]}
      />
      <T v="caption" tone="mut">
        {hint}
      </T>
      <View
        ref={canvas}
        onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
        style={{ width: "100%", height: h || undefined, aspectRatio: h ? undefined : 1 / ASPECT, borderRadius: radius.inner, overflow: "hidden", backgroundColor: c.in, borderWidth: 1, borderColor: c.bd }}
      >
        {photo ? <Image source={{ uri: photo }} style={{ position: "absolute", width: w, height: h }} resizeMode="cover" /> : null}
        <View style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none">
          <Svg width={w} height={h}>
            {!photo
              ? gridLines.map((g) => (
                  <Line key={`v${g}`} x1={g * w} y1={0} x2={g * w} y2={h} stroke={c.track} strokeWidth={1} />
                ))
              : null}
            {!photo
              ? gridLines.map((g) => <Line key={`h${g}`} x1={0} y1={g * h} x2={w} y2={g * h} stroke={c.track} strokeWidth={1} />)
              : null}
            {cal.a ? <Circle cx={px(cal.a)[0]} cy={px(cal.a)[1]} r={6} fill={c.status.info.fill} /> : null}
            {cal.a && cal.b ? (
              <>
                <Line x1={px(cal.a)[0]} y1={px(cal.a)[1]} x2={px(cal.b)[0]} y2={px(cal.b)[1]} stroke={c.status.info.fill} strokeWidth={3} strokeDasharray="8 6" />
                <Circle cx={px(cal.b)[0]} cy={px(cal.b)[1]} r={6} fill={c.status.info.fill} />
              </>
            ) : null}
            {runs.map((r, ri) =>
              r.length ? (
                <Polyline
                  key={`r${ri}`}
                  points={r.map((p) => px(p).join(",")).join(" ")}
                  stroke={c.acc}
                  strokeWidth={4}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  fill="none"
                />
              ) : null,
            )}
            {runs.flatMap((r, ri) => r.map((p, pi) => <Circle key={`p${ri}-${pi}`} cx={px(p)[0]} cy={px(p)[1]} r={5} fill={c.acc} stroke={c.onAcc} strokeWidth={1.5} />))}
            {runs.flatMap((r, ri) =>
              (sum.segmentsFt[runs.filter((x) => x.length >= 2).indexOf(r)] ?? []).map((ft, si) => {
                const a = px(r[si]!);
                const b = px(r[si + 1]!);
                const props = {
                  x: (a[0] + b[0]) / 2,
                  y: (a[1] + b[1]) / 2 - 8,
                  fontSize: font.size.caption,
                  fontFamily: font.families.semibold,
                  textAnchor: "middle" as const,
                };
                // halo first (readable over any photo), then the label
                return [
                  <SvgText key={`lh${ri}-${si}`} {...props} fill={c.bg} stroke={c.bg} strokeWidth={4}>
                    {`${ft}′`}
                  </SvgText>,
                  <SvgText key={`l${ri}-${si}`} {...props} fill={c.ink}>
                    {`${ft}′`}
                  </SvgText>,
                ];
              }),
            )}
            {ds.map((p, i) => (
              <Circle key={`d${i}`} cx={px(p)[0]} cy={px(p)[1]} r={8} fill="none" stroke={c.status.ok.fill} strokeWidth={3} />
            ))}
          </Svg>
        </View>
        {/* transparent touch layer on top: tap coordinates are relative to the canvas on every platform */}
        <Pressable onPress={tap} style={{ position: "absolute", left: 0, top: 0, width: w, height: h }} accessibilityLabel={hint} />
      </View>
      <RowView style={{ flexWrap: "wrap" }}>
        <Button label={t("draw.photo")} icon="camera" variant="secondary" onPress={pickPhoto} />
        <Button label={t("draw.undo")} icon="undo" variant="secondary" onPress={undo} />
        {mode === "gutter" ? (
          <Button label={t("draw.newLine")} icon="plus" variant="secondary" onPress={() => setRuns((r) => (r[r.length - 1]?.length ? [...r, []] : r))} />
        ) : null}
      </RowView>
      {!photo ? (
        <T v="caption" tone="mut">
          {t("draw.noPhoto")}
        </T>
      ) : null}

      <Card>
        {mode === "calib" ? (
          <Stepper label={t("draw.known")} unit={t("est.ft")} value={cal.knownFt} min={1} max={200} onChange={(v) => setCal((x) => ({ ...x, knownFt: v }))} />
        ) : null}
        <T v="caption" tone="mut">
          {t("draw.roof")}
        </T>
        <Segmented
          value={roofSide}
          onChange={setRoofSide}
          items={[
            { key: "left", label: t("draw.left") },
            { key: "right", label: t("draw.right") },
          ]}
        />
        <RowView style={{ justifyContent: "space-between", marginTop: space[2] }}>
          <T v="body" tone="mut">
            {t("draw.total")}
          </T>
          <T v="title" tabular>
            {sum.calibrated ? `${sum.totalFt} ${t("est.ft")}` : "—"}
          </T>
        </RowView>
        <T v="caption" tone="mut">
          {t("est.outCorners")}: {sum.outside} · {t("est.inCorners")}: {sum.inside} · {t("est.downspouts")}: {sum.downspouts}
        </T>
        {!sum.calibrated ? (
          <T v="caption" tone="warn">
            {t("draw.needCalib")}
          </T>
        ) : null}
        <Button label={t("draw.toEstimate")} icon="invoice" full disabled={!sum.calibrated || sum.totalFt <= 0} onPress={toEstimate} />
      </Card>
    </Screen>
  );
}
