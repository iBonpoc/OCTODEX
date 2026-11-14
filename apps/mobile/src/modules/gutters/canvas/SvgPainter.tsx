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
  const r = d.lifted ? DS_MARK_R * drawing.liftScale : DS_MARK_R; // picked up (#1272): the mark itself is bigger
  return (
    <G>
      <Circle cx={x} cy={y} r={r} fill={d.dim ? fill : color} stroke={d.selected || d.dim || d.lifted ? halo : fill} strokeWidth={d.selected || d.dim || d.lifted ? drawing.labelGap : drawing.runW / 2} />
      {/* «D1» inside (founder 08.11): the number, not an arrow */}
      <SvgText x={x} y={y + FS * 0.35} fontSize={FS} fontFamily={font.families.semibold} fill={d.dim ? color : fill} textAnchor="middle">
        {d.text}
      </SvgText>
    </G>
  );
});

/** an end cap: a square of its storey's colour with «L» / «R» (a rect, not a circle — e2e counts downspout circles) */
export const CAP_HALF = drawing.dsR;
const CapMark = memo(function CapMark({ k, color, fill, halo }: { k: SceneCap; color: string; fill: string; halo: string }) {
  const [x, y] = k.at;
  // picked up (#1272): the point itself is bigger and brighter (a ring of the selection colour); a free end it can stick to has a ring too
  const half = k.lifted ? CAP_HALF * drawing.liftScale : CAP_HALF;
  return (
    <G id={k.id}>
      {k.lifted || k.target ? <Rect id={`${k.lifted ? "lift" : "target"}-${k.id}`} x={x - half - drawing.nodeR} y={y - half - drawing.nodeR} width={(half + drawing.nodeR) * 2} height={(half + drawing.nodeR) * 2} rx={radius.chip} fill="none" stroke={halo} strokeWidth={k.lifted ? drawing.labelGap : drawing.runW / 2} strokeDasharray={k.target ? `${drawing.runW} ${drawing.runW}` : undefined} /> : null}
      {/* a picked gutter's free end is a handle (#504): a ring round the cap — a rect, not a circle (e2e counts circles) */}
      {k.selected ? <Rect id={`handle-${k.id}`} x={x - CAP_HALF - drawing.nodeR} y={y - CAP_HALF - drawing.nodeR} width={(CAP_HALF + drawing.nodeR) * 2} height={(CAP_HALF + drawing.nodeR) * 2} rx={radius.chip} fill="none" stroke={halo} strokeWidth={drawing.labelGap} /> : null}
      <Rect x={x - half} y={y - half} width={half * 2} height={half * 2} rx={radius.chip} fill={color} stroke={fill} strokeWidth={drawing.runW / 2} />
      <SvgText x={x} y={y + FS * 0.35} fontSize={FS} fontFamily={font.families.semibold} fill={fill} textAnchor="middle">
        {k.side}
      </SvgText>
    </G>
  );
});

/** a corner: a diamond — filled inside, hollow outside (its chip says it in words) */
const CornerMark = memo(function CornerMark({ k, color, fill, halo }: { k: SceneCorner; color: string; fill: string; halo: string }) {
  const [x, y] = k.at;
  const r = drawing.dsR * (k.lifted ? drawing.liftScale : 1); // picked up (#1272): the mark itself is bigger
  const R = r * 2;
  return (
    <G id={k.id}>
      {k.lifted ? <Rect id={`lift-${k.id}`} x={x - R} y={y - R} width={R * 2} height={R * 2} rx={radius.chip} fill="none" stroke={halo} strokeWidth={drawing.labelGap} /> : null}
      {/* a splash guard (founder 09.11: seen on the drawing): a dashed square round the corner's mark */}
      {k.splash ? <Path id={`splash-${k.id}`} d={`M${x} ${y - R}L${x + R} ${y}L${x} ${y + R}L${x - R} ${y}Z`} fill="none" stroke={color} strokeWidth={drawing.runW / 2} strokeDasharray={`${drawing.runW} ${drawing.runW}`} /> : null}
      {/* the angle marked as in a drawing: a dash-dot arc across it (founder 12.11); its chip says the words and the degrees */}
      {k.arc ? <Path id={`arc-${k.id}`} d={`M${k.arc.from[0]} ${k.arc.from[1]}A${k.arc.r} ${k.arc.r} 0 0 ${k.arc.sweep} ${k.arc.to[0]} ${k.arc.to[1]}`} fill="none" stroke={color} strokeWidth={drawing.runW / 4} strokeDasharray={`${drawing.runW} ${drawing.runW / 2} ${drawing.runW / 4} ${drawing.runW / 2}`} /> : null}
      {/* a picked gutter's joint is a handle (#818): a ring round the mark, a rect like the caps' */}
      {k.handle ? <Rect id={`handle-${k.id}`} x={x - R} y={y - R} width={R * 2} height={R * 2} rx={radius.chip} fill="none" stroke={halo} strokeWidth={drawing.labelGap} /> : null}
      <Path d={`M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`} fill={k.kind === "in" ? color : fill} stroke={color} strokeWidth={drawing.runW / 2} />
    </G>
  );
});

const Label = memo(function Label({ l, bg, ink }: { l: SceneLabel; bg: string; ink: string }) {
  return (
    <G id={`lbl-${l.id}`}>
      <Rect x={l.x - l.w / 2} y={l.y - l.h / 2} width={l.w} height={l.h} rx={radius.chip} fill={bg} />
      {/* a corner's degrees are small (founder 12.11: «маленькими буквами», #1275) */}
      <SvgText x={l.x} y={l.y + (l.kind === "corner" ? font.size.micro : FS) * 0.35} fontSize={l.kind === "corner" ? font.size.micro : FS} fontFamily={font.families.medium} fill={ink} textAnchor="middle">
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
    <Svg width={w} height={h} testID={testID} style={{ overflow: "visible" }}>
      {/* the grid (founder 08.11): paths, not lines — e2e counts lines; the major lines a little bolder */}
      {scene.grid ? <Path id="grid-minor" d={scene.grid.minor} stroke={c.bd} strokeWidth={drawing.runW / 4} fill="none" /> : null}
      {scene.grid ? <Path id="grid-major" d={scene.grid.major} stroke={c.bd} strokeWidth={drawing.runW / 2} fill="none" /> : null}
      {scene.runs.map((r) => (
        <RunLine key={r.id} r={r} color={story[r.story - 1]!} halo={c.drawing.node} />
      ))}
      {scene.corners.map((k) => (
        <CornerMark key={k.id} k={k} color={c.drawing.node} fill={c.bg} halo={c.drawing.node} />
      ))}
      {scene.caps.map((k) => (
        <CapMark key={k.id} k={k} color={story[k.story - 1]!} fill={c.bg} halo={c.drawing.node} />
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
