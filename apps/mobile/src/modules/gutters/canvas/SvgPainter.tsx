/**
 * The painter (docs/specs/33-gutters-canvas.md П20.1): draws a Scene with react-native-svg, nothing else. Every element
 * is memoised on plain props, so moving one point redraws that line and its labels only. Colours: themes[t].drawing
 * (founder О3 — storeys by colour on the canvas only, always with «эт N»), labels in ink on the overlay colour.
 */
import { memo } from "react";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { drawing, font, radius } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import type { Scene, SceneCap, SceneCorner, SceneDs, SceneLabel, SceneRun } from "./scene";

const FS = font.size.caption;

const RunLine = memo(function RunLine({ r, color, halo }: { r: SceneRun; color: string; halo: string }) {
  const w = r.selected ? drawing.runWSel : drawing.runW;
  return (
    <G>
      {r.selected ? <Line id={`halo-${r.id}`} x1={r.a[0]} y1={r.a[1]} x2={r.b[0]} y2={r.b[1]} stroke={halo} strokeWidth={w + drawing.labelGap} strokeLinecap="round" /> : null}
      <Line x1={r.a[0]} y1={r.a[1]} x2={r.b[0]} y2={r.b[1]} stroke={color} strokeWidth={w} strokeLinecap="round" />
      {/* the face (founder 08.11): a thin dashed path on the side away from the house — a path, not a line (e2e counts lines) */}
      <Path id={`face-${r.id}`} d={`M${r.face[0][0]} ${r.face[0][1]}L${r.face[1][0]} ${r.face[1][1]}`} stroke={color} strokeWidth={drawing.runW / 2} strokeDasharray={`${drawing.runW} ${drawing.runW}`} fill="none" />
    </G>
  );
});

/** a downspout's mark (spec 33 П20.8): a disc of its storey's colour with an arrow down in the background's colour — the water goes down here;
 *  a plain dot was missed. Picked: a thick ring (one circle — e2e counts circles) */
export const DS_MARK_R = drawing.dsR + drawing.nodeR;
const DsMark = memo(function DsMark({ d, color, fill, halo }: { d: SceneDs; color: string; fill: string; halo: string }) {
  const [x, y] = d.at;
  const r = DS_MARK_R;
  return (
    <G>
      <Circle cx={x} cy={y} r={r} fill={d.dim ? fill : color} stroke={d.selected || d.dim ? halo : fill} strokeWidth={d.selected || d.dim ? drawing.labelGap : drawing.runW / 2} />
      {/* «D1» inside (founder 08.11): the number, not an arrow */}
      <SvgText x={x} y={y + FS * 0.35} fontSize={FS} fontFamily={font.families.semibold} fill={d.dim ? color : fill} textAnchor="middle">
        {d.text}
      </SvgText>
    </G>
  );
});

/** an end cap: a square of its storey's colour with «L» / «R» (a rect, not a circle — e2e counts downspout circles) */
export const CAP_HALF = drawing.dsR;
const CapMark = memo(function CapMark({ k, color, fill }: { k: SceneCap; color: string; fill: string }) {
  const [x, y] = k.at;
  return (
    <G id={k.id}>
      <Rect x={x - CAP_HALF} y={y - CAP_HALF} width={CAP_HALF * 2} height={CAP_HALF * 2} rx={radius.chip} fill={color} stroke={fill} strokeWidth={drawing.runW / 2} />
      <SvgText x={x} y={y + FS * 0.35} fontSize={FS} fontFamily={font.families.semibold} fill={fill} textAnchor="middle">
        {k.side}
      </SvgText>
    </G>
  );
});

/** a corner: a diamond — filled inside, hollow outside (its chip says it in words) */
const CornerMark = memo(function CornerMark({ k, color, fill }: { k: SceneCorner; color: string; fill: string }) {
  const [x, y] = k.at;
  const r = drawing.dsR;
  return <Path id={k.id} d={`M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`} fill={k.kind === "in" ? color : fill} stroke={color} strokeWidth={drawing.runW / 2} />;
});

const Label = memo(function Label({ l, bg, ink }: { l: SceneLabel; bg: string; ink: string }) {
  return (
    <G>
      <Rect x={l.x - l.w / 2} y={l.y - l.h / 2} width={l.w} height={l.h} rx={radius.chip} fill={bg} />
      <SvgText x={l.x} y={l.y + FS * 0.35} fontSize={FS} fontFamily={font.families.medium} fill={ink} textAnchor="middle">
        {l.text}
      </SvgText>
    </G>
  );
});

export const LABEL_FONT = FS;

export function SvgPainter({ scene, w, h, testID }: { scene: Scene; w: number; h: number; testID?: string }) {
  const { c } = useTheme();
  const story = c.drawing.story;
  return (
    <Svg width={w} height={h} testID={testID}>
      {scene.runs.map((r) => (
        <RunLine key={r.id} r={r} color={story[r.story - 1]!} halo={c.drawing.node} />
      ))}
      {scene.corners.map((k) => (
        <CornerMark key={k.id} k={k} color={c.drawing.node} fill={c.bg} />
      ))}
      {scene.caps.map((k) => (
        <CapMark key={k.id} k={k} color={story[k.story - 1]!} fill={c.bg} />
      ))}
      {scene.ds.map((d) => (
        <DsMark key={d.id} d={d} color={story[d.story - 1]!} fill={c.bg} halo={c.drawing.node} />
      ))}
      {scene.labels.map((l) => (
        <Label key={l.id} l={l} bg={c.ov} ink={c.ink} />
      ))}
    </Svg>
  );
}
