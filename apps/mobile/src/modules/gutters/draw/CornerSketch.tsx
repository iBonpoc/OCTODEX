/**
 * The corner's own small drawing and its triangle (founder 08.11, docs/specs/33-gutters-canvas.md П20.15): the two
 * gutters from the corner — the back (the wall) solid, the face dashed, meeting on the miter — with both lengths on
 * each; and three tape lengths (along each gutter from the corner, and straight between the marks) that give the
 * angle between the walls.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import Svg, { G, Path, Rect, Text as SvgText } from "react-native-svg";
import { drawing as dt, font, radius, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";
import { tapeIn } from "../canvas/attrs";
import { ftIn } from "../canvas/format";
import { labelWidth } from "../canvas/labels";
import { angleFromTriangle, centre, houseSide, runLengthIn, type CornerCutRun, type Drawing, type FoundCorner, type P } from "../geometry";

/**
 * The sketch (founder 09.11: «too small, the numbers overlap»): a scheme, not to scale — both gutters drawn the same
 * length from the corner at the real angle, as wide as the sheet; the wall solid, the face dashed, the cut line from
 * the corner to where the faces meet; on each gutter two labels in their own chips — «стена …» on the house side,
 * «лицевая …» beyond the face — and the gutter's letter (A, B) at its end, as in the triangle below.
 */
export function CornerSketch({ d, f, cut, w }: { d: Drawing; f: FoundCorner; cut: CornerCutRun[]; w: number }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const FS = font.size.caption;
  const H = Math.round(Math.min(w * 0.8, space[8] * 9));
  const geo = useMemo(() => {
    const ctr = centre(d.runs);
    // unit directions from the corner along each gutter, on the screen (y down)
    const legs = f.runs.map(({ id, end }) => {
      const r = d.runs.find((x) => x.id === id)!;
      const far: P = end ? r.a : r.b;
      const vx = far[0] - f.at[0], vy = -(far[1] - f.at[1]);
      const L = Math.hypot(vx, vy) || 1;
      return { id, u: [vx / L, vy / L] as [number, number], side: houseSide(r, ctr), lead: end ? 1 : 0 };
    });
    // the face side of each leg: away from the house (the run's right of a→b when the house is on its left)
    const off = space[4];
    const withN = legs.map((l) => {
      // the run's own a→b: from the corner when the corner is its start (end 0), towards it when it is its end
      const dir = l.lead ? ([-l.u[0], -l.u[1]] as [number, number]) : l.u;
      const right: [number, number] = [-dir[1], dir[0]];
      const s = l.side === "L" ? 1 : -1;
      return { ...l, n: [right[0] * s, right[1] * s] as [number, number] };
    });
    // a unit scheme first (corner at 0,0, legs of length 1), then fitted into the box with room for the labels
    const pts: [number, number][] = [[0, 0], ...withN.map((l) => l.u)];
    // room for the chips: a «лицевая 99′ 9⅞″» chip wide at the sides, two chips high above and below
    // room for the chips (they run along their line): two chips' height and the letters
    const padX = (FS + space[2]) * 2 + space[6];
    const padY = (FS + space[2]) * 2 + space[6];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const k = Math.min((w - 2 * padX) / Math.max(0.3, Math.max(...xs) - Math.min(...xs)), (H - 2 * padY) / Math.max(0.3, Math.max(...ys) - Math.min(...ys)));
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const S = (p: [number, number]): [number, number] => [w / 2 + (p[0] - cx) * k, H / 2 + (p[1] - cy) * k];
    const corner = S([0, 0]);
    const lines = withN.map((l) => ({ id: l.id, far: S(l.u), u: l.u, n: [l.n[0] * off, l.n[1] * off] as [number, number], nu: l.n }));
    const [a, b] = lines as [(typeof lines)[0], (typeof lines)[0]];
    const p0: [number, number] = [corner[0] + a.n[0], corner[1] + a.n[1]];
    const q0: [number, number] = [corner[0] + b.n[0], corner[1] + b.n[1]];
    const den = a.u[0] * b.u[1] - a.u[1] * b.u[0];
    const tt = Math.abs(den) < 1e-6 ? 0 : ((q0[0] - p0[0]) * b.u[1] - (q0[1] - p0[1]) * b.u[0]) / den;
    const m: [number, number] = [p0[0] + a.u[0] * tt, p0[1] + a.u[1] * tt];
    return { corner, lines, m };
  }, [d, f, w, H, t, FS]);
  const byId = new Map(cut.map((x) => [x.id, x]));
  const th = FS + space[2];
  /**
   * a chip along a line (founder 09.11: the numbers overlapped): at the line's middle, turned with it (kept upright),
   * pushed off it along the normal `nu` (±1) by half its height and `gap`
   */
  const chipBy = (mx: number, my: number, u: [number, number], nu: [number, number], sign: 1 | -1, text: string, strong: boolean, key: string, gap: number) => {
    const reach = th / 2 + gap;
    let deg = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
    if (deg > 90) deg -= 180;
    if (deg < -90) deg += 180;
    return chip(mx + nu[0] * reach * sign, my + nu[1] * reach * sign, text, strong, key, deg);
  };
  const chip = (x: number, y: number, text: string, strong: boolean, key: string, deg = 0) => {
    const tw = labelWidth(text, FS, space[2]);
    return (
      <G key={key} transform={`rotate(${deg} ${x} ${y})`}>
        <Rect x={x - tw / 2} y={y - th / 2} width={tw} height={th} rx={Math.min(radius.chip, th / 2)} ry={Math.min(radius.chip, th / 2)} fill={c.ov} stroke={c.bd} strokeWidth={1} />
        <SvgText x={x} y={y + FS * 0.35} fontSize={FS} fontFamily={strong ? font.families.semibold : font.families.medium} fill={strong ? c.ink : c.mut} textAnchor="middle">{text}</SvgText>
      </G>
    );
  };
  const GAP_WALL = space[2], GAP_FACE = space[4] + space[2];
  const gapOf = (sign: 1 | -1) => (sign > 0 ? GAP_FACE : GAP_WALL);
  /** the chip on leg i, side `sign`: in the middle; inside the angle moved out along the leg past the other leg's chips */
  const chipOn = (i: number, sign: 1 | -1, text: string, strong: boolean, key: string, gap: number) => {
    const l = geo.lines[i]!, o = geo.lines[1 - i]!;
    const Lpx = Math.hypot(l.far[0] - geo.corner[0], l.far[1] - geo.corner[1]);
    const tw = labelWidth(text, FS, space[2]);
    const inside = (l.nu[0] * o.u[0] + l.nu[1] * o.u[1]) * sign > 0;
    let along = Lpx / 2;
    if (inside) {
      // the other leg's chip on this side of it reaches this far off its line; past the corner by that (over the sine)
      const oSign = ((o.nu[0] * l.u[0] + o.nu[1] * l.u[1]) > 0 ? 1 : -1) as 1 | -1;
      const reach = gapOf(oSign) + th;
      const sin = Math.max(0.5, Math.abs(l.u[0] * o.u[1] - l.u[1] * o.u[0]));
      along = Math.min(Lpx - tw / 2, Math.max(along, reach / sin + tw / 2 + space[2]));
    }
    return chipBy(geo.corner[0] + l.u[0] * along, geo.corner[1] + l.u[1] * along, l.u, l.nu, sign, text, strong, key, gap);
  };
  const letters = ["A", "B"];
  return (
    <View testID="corner-sketch">
      <Svg width={w} height={H}>
        {geo.lines.map((l, i) => {
          const x = byId.get(l.id)!;
          // the labels stand clear of the lines: the wall's on the house side, the face's beyond the dashed face line
          return (
            <G key={l.id}>
              <Path d={`M${geo.corner[0]} ${geo.corner[1]}L${l.far[0]} ${l.far[1]}`} stroke={c.ink} strokeWidth={dt.runW} strokeLinecap="round" fill="none" />
              <Path d={`M${geo.m[0]} ${geo.m[1]}L${l.far[0] + l.n[0]} ${l.far[1] + l.n[1]}`} stroke={c.ink} strokeWidth={dt.runW / 2} strokeDasharray={`${dt.runW} ${dt.runW}`} fill="none" />
              {chipOn(i, -1, `${t("mod.gutters.draw.cutWall")} ${ftIn(x.backIn)}`, false, `b${i}`, GAP_WALL)}
              {chipOn(i, 1, `${t("mod.gutters.draw.cutFace")} ${ftIn(x.frontIn)}`, true, `f${i}`, GAP_FACE)}
              <SvgText x={l.far[0] + l.u[0] * FS * 1.4} y={l.far[1] + l.u[1] * FS * 1.4 + FS * 0.35} fontSize={FS} fontFamily={font.families.bold} fill={c.ink} textAnchor="middle">{letters[i]}</SvgText>
            </G>
          );
        })}
        <Path d={`M${geo.corner[0]} ${geo.corner[1]}L${geo.m[0]} ${geo.m[1]}`} stroke={c.mut} strokeWidth={dt.runW / 2} fill="none" />
        {/* C — straight between the ends of A and B (the triangle below) */}
        <Path d={`M${geo.lines[0]!.far[0]} ${geo.lines[0]!.far[1]}L${geo.lines[1]!.far[0]} ${geo.lines[1]!.far[1]}`} stroke={c.mut} strokeWidth={1} strokeDasharray={`${dt.runW * 2} ${dt.runW * 2}`} fill="none" />
        <SvgText x={(geo.lines[0]!.far[0] + geo.lines[1]!.far[0]) / 2} y={(geo.lines[0]!.far[1] + geo.lines[1]!.far[1]) / 2 - FS * 0.6} fontSize={FS} fontFamily={font.families.bold} fill={c.mut} textAnchor="middle">C</SvgText>
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
      <Len label={t("mod.gutters.draw.triA")} value={a} onChange={setA} testID="tri-a" />
      <Len label={t("mod.gutters.draw.triB")} value={b} onChange={setB} testID="tri-b" />
      <Len label={t("mod.gutters.draw.triC")} value={c3} onChange={setC} testID="tri-c" />
      <RowView style={{ gap: space[2], flexWrap: "wrap" }}>
        <View testID="tri-count"><Button label={t("mod.gutters.draw.triCount")} size="sm" onPress={count} /></View>
        <View testID="tri-90"><Button label={t("mod.gutters.draw.tri90")} size="sm" variant="secondary" onPress={() => { setRes(90); onAngle(90); }} /></View>
        {res === "bad" ? <View testID="tri-bad"><StatusChip status="warn" label={t("mod.gutters.draw.triBad")} soft /></View> : null}
        {typeof res === "number" ? <View testID="tri-result"><StatusChip status="ok" label={t("mod.gutters.draw.cutAngle", { deg: res })} soft /></View> : null}
      </RowView>
    </View>
  );
}
