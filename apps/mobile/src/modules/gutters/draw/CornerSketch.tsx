/**
 * The corner's own small drawing and its triangle (founder 08.11, docs/specs/33-gutters-canvas.md П20.15): the two
 * gutters from the corner — the back (the wall) solid, the face dashed, meeting on the miter — with both lengths on
 * each; and three tape lengths (along each gutter from the corner, and straight between the marks) that give the
 * angle between the walls.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import Svg, { G, Path, Text as SvgText } from "react-native-svg";
import { drawing as dt, font, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";
import { tapeIn } from "../canvas/attrs";
import { ftIn } from "../canvas/format";
import { angleFromTriangle, centre, houseSide, runLengthIn, type CornerCutRun, type Drawing, type FoundCorner, type P } from "../geometry";

const SKETCH_H = space[8] * 5;

/** the sketch: plan points of the corner and the far ends, fitted into w × SKETCH_H */
export function CornerSketch({ d, f, cut, w }: { d: Drawing; f: FoundCorner; cut: CornerCutRun[]; w: number }) {
  const { c } = useTheme();
  const geo = useMemo(() => {
    const ctr = centre(d.runs);
    const legs = f.runs.map(({ id, end }) => {
      const r = d.runs.find((x) => x.id === id)!;
      const far: P = end ? r.a : r.b;
      return { id, far, side: houseSide(r, ctr), lead: end ? 1 : 0 };
    });
    const pts = [f.at, ...legs.map((l) => l.far)];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const pad = space[8] + space[4];
    const k = Math.min((w - 2 * pad) / Math.max(1, Math.max(...xs) - Math.min(...xs)), (SKETCH_H - 2 * pad) / Math.max(1, Math.max(...ys) - Math.min(...ys)));
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const S = (p: P): [number, number] => [w / 2 + (p[0] - cx) * k, SKETCH_H / 2 - (p[1] - cy) * k];
    const corner = S(f.at);
    const off = space[3];
    // each leg's face: the back shifted away from the house (screen space), the two met on the miter
    const lines = legs.map((l) => {
      const far = S(l.far);
      const vx = far[0] - corner[0], vy = far[1] - corner[1];
      const L = Math.hypot(vx, vy) || 1;
      // the run's own direction a→b on the screen, then its right side (screen y is down: right of (x,y) is (−y, x))
      const dir = l.lead ? [vx / L, vy / L] : [-vx / L, -vy / L];
      const right = [-dir[1]!, dir[0]!];
      const s = l.side === "L" ? 1 : -1; // the face is on the side away from the house
      const n: [number, number] = [right[0]! * s * off, right[1]! * s * off];
      return { id: l.id, far, n, u: [vx / L, vy / L] as [number, number] };
    });
    // the miter point: where the two face lines meet
    const [a, b] = lines as [(typeof lines)[0], (typeof lines)[0]];
    const p0: [number, number] = [corner[0] + a.n[0], corner[1] + a.n[1]];
    const q0: [number, number] = [corner[0] + b.n[0], corner[1] + b.n[1]];
    const den = a.u[0] * b.u[1] - a.u[1] * b.u[0];
    const t = Math.abs(den) < 1e-6 ? 0 : ((q0[0] - p0[0]) * b.u[1] - (q0[1] - p0[1]) * b.u[0]) / den;
    const m: [number, number] = [p0[0] + a.u[0] * t, p0[1] + a.u[1] * t];
    return { corner, lines, m };
  }, [d, f, w]);
  const byId = new Map(cut.map((x) => [x.id, x]));
  const FS = font.size.micro;
  return (
    <View testID="corner-sketch">
      <Svg width={w} height={SKETCH_H}>
        {geo.lines.map((l) => {
          const x = byId.get(l.id)!;
          const mid = [(geo.corner[0] + l.far[0]) / 2, (geo.corner[1] + l.far[1]) / 2];
          const fm = [(geo.m[0] + l.far[0] + l.n[0]) / 2, (geo.m[1] + l.far[1] + l.n[1]) / 2];
          // the labels sit outside each line: back on the house side, face beyond the face
          return (
            <G key={l.id}>
              <Path d={`M${geo.corner[0]} ${geo.corner[1]}L${l.far[0]} ${l.far[1]}`} stroke={c.ink} strokeWidth={dt.runW / 2} fill="none" />
              <Path d={`M${geo.m[0]} ${geo.m[1]}L${l.far[0] + l.n[0]} ${l.far[1] + l.n[1]}`} stroke={c.ink} strokeWidth={dt.runW / 2} strokeDasharray={`${dt.runW} ${dt.runW}`} fill="none" />
              <SvgText x={mid[0]! - l.n[0] * 1.6} y={mid[1]! - l.n[1] * 1.6 + FS / 3} fontSize={FS} fontFamily={font.families.medium} fill={c.mut} textAnchor="middle">{ftIn(x.backIn)}</SvgText>
              <SvgText x={fm[0]! + l.n[0] * 1.6} y={fm[1]! + l.n[1] * 1.6 + FS / 3} fontSize={FS} fontFamily={font.families.semibold} fill={c.ink} textAnchor="middle">{ftIn(x.frontIn)}</SvgText>
            </G>
          );
        })}
        <Path d={`M${geo.corner[0]} ${geo.corner[1]}L${geo.m[0]} ${geo.m[1]}`} stroke={c.mut} strokeWidth={dt.runW / 2} fill="none" />
      </Svg>
    </View>
  );
}

/** a length typed in feet and inches (inches may be decimal — to 1/8″) */
function Len({ label, value, onChange, testID }: { label: string; value: { ft: string; inch: string }; onChange: (v: { ft: string; inch: string }) => void; testID: string }) {
  const { t } = useI18n();
  return (
    <View testID={testID} style={{ gap: space[1] }}>
      <T v="caption" tone="mut">{label}</T>
      <RowView style={{ gap: space[2] }}>
        <View style={{ flex: 1 }}><TextField type="integer" value={value.ft} onChangeText={(ft) => onChange({ ...value, ft })} label={t("mod.gutters.attr.ft")} /></View>
        <T v="body" tone="mut">{t("mod.gutters.attr.ft")}</T>
        <View style={{ flex: 1 }}><TextField type="number" value={value.inch} onChangeText={(inch) => onChange({ ...value, inch })} label={t("mod.gutters.attr.in")} /></View>
        <T v="body" tone="mut">{t("mod.gutters.attr.in")}</T>
      </RowView>
    </View>
  );
}

const asFields = (n: number) => ({ ft: String(Math.floor(n / 12)), inch: String(Math.round((n % 12) * 8) / 8) });

/** the triangle: along gutter 1 and gutter 2 from the corner (the whole gutters by default), and between the marks */
export function CornerTriangle({ d, f, onAngle }: { d: Drawing; f: FoundCorner; onAngle: (deg: number) => void }) {
  const { t } = useI18n();
  const [r1, r2] = f.runs.map(({ id }) => d.runs.find((x) => x.id === id)!);
  const n = (id: string) => d.runs.findIndex((x) => x.id === id) + 1;
  const [a, setA] = useState(asFields(runLengthIn(r1!)));
  const [b, setB] = useState(asFields(runLengthIn(r2!)));
  const [c3, setC] = useState({ ft: "", inch: "" });
  const [res, setRes] = useState<number | null | "bad">(null);
  const count = () => {
    const A = tapeIn(a.ft, a.inch), B = tapeIn(b.ft, b.inch), C = tapeIn(c3.ft, c3.inch);
    const deg = A && B && C ? angleFromTriangle(A, B, C) : null;
    if (deg === null) return setRes("bad");
    setRes(deg);
    onAngle(deg);
  };
  return (
    <View testID="corner-triangle" style={{ gap: space[2] }}>
      <T v="body" w="semibold">{t("mod.gutters.draw.triTitle")}</T>
      <T v="caption" tone="mut">{t("mod.gutters.draw.triHint")}</T>
      <Len label={t("mod.gutters.draw.triAlong", { n: n(r1!.id) })} value={a} onChange={setA} testID="tri-a" />
      <Len label={t("mod.gutters.draw.triAlong", { n: n(r2!.id) })} value={b} onChange={setB} testID="tri-b" />
      <Len label={t("mod.gutters.draw.triBetween")} value={c3} onChange={setC} testID="tri-c" />
      <RowView style={{ gap: space[2], flexWrap: "wrap" }}>
        <View testID="tri-count"><Button label={t("mod.gutters.draw.triCount")} size="sm" onPress={count} /></View>
        <View testID="tri-90"><Button label={t("mod.gutters.draw.tri90")} size="sm" variant="secondary" onPress={() => { setRes(90); onAngle(90); }} /></View>
        {res === "bad" ? <View testID="tri-bad"><StatusChip status="warn" label={t("mod.gutters.draw.triBad")} soft /></View> : null}
        {typeof res === "number" ? <View testID="tri-result"><StatusChip status="ok" label={t("mod.gutters.draw.cutAngle", { deg: res })} soft /></View> : null}
      </RowView>
    </View>
  );
}
