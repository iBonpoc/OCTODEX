/**
 * The painter (docs/specs/33-gutters-canvas.md П20.1): draws a Scene with react-native-svg, nothing else. Every element
 * is memoised on plain props, so moving one point redraws that line and its labels only. Colours: themes[t].drawing
 * (founder О3 — storeys by colour on the canvas only, always with «эт N»), labels in ink on the overlay colour.
 */
import { memo } from "react";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { drawing, font, radius } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import type { Scene, SceneDs, SceneLabel, SceneRun } from "./scene";

const FS = font.size.caption;

const RunLine = memo(function RunLine({ r, color, halo }: { r: SceneRun; color: string; halo: string }) {
  const w = r.selected ? drawing.runWSel : drawing.runW;
  return (
    <G>
      {r.selected ? <Line id={`halo-${r.id}`} x1={r.a[0]} y1={r.a[1]} x2={r.b[0]} y2={r.b[1]} stroke={halo} strokeWidth={w + drawing.labelGap} strokeLinecap="round" /> : null}
      <Line x1={r.a[0]} y1={r.a[1]} x2={r.b[0]} y2={r.b[1]} stroke={color} strokeWidth={w} strokeLinecap="round" />
    </G>
  );
});

/** a downspout's mark (spec 33 П20.8): a disc of its storey's colour with an arrow down in the background's colour — the water goes down here;
 *  a plain dot was missed. Picked: a thick ring (one circle — e2e counts circles) */
export const DS_MARK_R = drawing.dsR + drawing.nodeR;
const DsMark = memo(function DsMark({ d, color, fill, halo }: { d: SceneDs; color: string; fill: string; halo: string }) {
  const [x, y] = d.at;
  const r = DS_MARK_R;
  const a = r / 2;
  return (
    <G>
      <Circle cx={x} cy={y} r={r} fill={color} stroke={d.selected ? halo : fill} strokeWidth={d.selected ? drawing.labelGap : drawing.runW / 2} />
      <Path d={`M${x} ${y - a}V${y + a}M${x - a / 1.4} ${y + a / 3}L${x} ${y + a}L${x + a / 1.4} ${y + a / 3}`} stroke={fill} strokeWidth={drawing.runW / 2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </G>
  );
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
      {scene.ds.map((d) => (
        <DsMark key={d.id} d={d} color={story[d.story - 1]!} fill={c.bg} halo={c.drawing.node} />
      ))}
      {scene.labels.map((l) => (
        <Label key={l.id} l={l} bg={c.ov} ink={c.ink} />
      ))}
    </Svg>
  );
}
