/**
 * The painter (docs/specs/33-gutters-canvas.md П20.1): draws a Scene with react-native-svg, nothing else. Every element
 * is memoised on plain props, so moving one point redraws that line and its labels only. Colours: themes[t].drawing
 * (founder О3 — storeys by colour on the canvas only, always with «эт N»), labels in ink on the overlay colour.
 */
import { memo } from "react";
import Svg, { Circle, G, Line, Rect, Text as SvgText } from "react-native-svg";
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

const DsDot = memo(function DsDot({ d, color, ring }: { d: SceneDs; color: string; ring: string }) {
  return <Circle cx={d.at[0]} cy={d.at[1]} r={drawing.dsR} fill={color} stroke={ring} strokeWidth={d.selected ? drawing.runW : drawing.runW / 2} />;
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
        <DsDot key={d.id} d={d} color={story[d.story - 1]!} ring={c.drawing.node} />
      ))}
      {scene.labels.map((l) => (
        <Label key={l.id} l={l} bg={c.ov} ink={c.ink} />
      ))}
    </Svg>
  );
}
