/**
 * A tape measure to pull (founder 09.11: «как рулетка, бегунком проматывать длину»; then his sample «tape pager»: drag
 * with inertia, it settles on the nearest mark under the line, arrows step one mark, the value big above). A strip of
 * marks under a fixed mark in the middle; the finger drags the tape, a flick keeps it running and slowing, then it
 * settles on a mark. The scale is given: 1/8″ marks (inches numbered, feet bold) or millimetres (centimetres numbered,
 * every 10 cm bold). Only the marks in sight are drawn (a 500′ tape is 48 000 marks). PanResponder: the same on the
 * phone, the tablet and the web; VoiceOver and the arrows step one mark. Our own code (the sample's has no licence).
 */
import { useEffect, useRef, useState } from "react";
import { PanResponder, View, type LayoutChangeEvent } from "react-native";
import Svg, { Line, Path, Text as SvgText } from "react-native-svg";
import { drawing as dt, font, radius, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { IconButton } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";

/** px per mark */
const TICK = space[2];
const H = size.hitMin * 2;
/** a flick: the share of speed kept per millisecond, and the speed (marks per ms) at which it settles */
const KEEP_PER_MS = 0.996;
const STOP = 0.002;

/** where a flick ends (marks): from `at` with `speed` marks/ms, slowing by KEEP_PER_MS each ms — the whole path */
export const coastEnd = (at: number, speed: number) => (Math.abs(speed) < STOP ? at : at + speed / -Math.log(KEEP_PER_MS));

/** one mark of a scale: its height (share of the tape), a number under it, bold */
export interface Mark { h: number; text?: string; bold?: boolean }
export type Scale = (k: number) => Mark;

/** 1/8″: the inches longer and numbered (within the foot), the feet bold «12′» */
export const EIGHTHS_SCALE: Scale = (k) =>
  k % 96 === 0 ? { h: 0.45, text: k ? `${k / 96}′` : undefined, bold: true } : k % 8 === 0 ? { h: 0.45, text: String((k / 8) % 12) } : { h: k % 4 === 0 ? 0.32 : k % 2 === 0 ? 0.24 : 0.16 };
/** millimetres: the centimetres longer and numbered, every 10 cm bold */
export const MM_SCALE: Scale = (k) =>
  k % 100 === 0 ? { h: 0.45, text: k ? `${k / 10}` : undefined, bold: true } : k % 10 === 0 ? { h: 0.45, text: String(k / 10) } : { h: k % 5 === 0 ? 0.3 : 0.18 };

export function Tape({ marks, onMarks, max, scale, readout, testID, label, stepLabels }: {
  /** the value in marks (1/8″ or mm) */
  marks: number;
  onMarks: (k: number) => void;
  max: number;
  scale: Scale;
  /** the value as the contractor reads it, big above the tape */
  readout: string;
  testID: string;
  label: string;
  stepLabels: { less: string; more: string };
}) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const v = Math.round(marks);
  const now = useRef({ v, onMarks });
  now.current = { v, onMarks };
  const start = useRef(0);
  const fling = useRef<number | null>(null);
  const stop = () => {
    if (fling.current !== null) cancelAnimationFrame(fling.current);
    fling.current = null;
  };
  useEffect(() => stop, []);
  const set = (k: number) => {
    const n = Math.min(max, Math.max(1, Math.round(k)));
    if (n !== now.current.v) now.current.onMarks(n);
    return n;
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        stop();
        start.current = now.current.v;
      },
      // the tape moves with the finger: dragged left, more of it comes out
      onPanResponderMove: (_, g) => set(start.current - g.dx / TICK),
      // let go while moving: it runs on, slowing, and settles on the nearest mark (the sample's inertia)
      onPanResponderRelease: (_, g) => {
        let at = start.current - g.dx / TICK;
        let speed = -g.vx / TICK;
        let last: number | null = null;
        const step = (t: number) => {
          const ms = last === null ? 0 : t - last;
          last = t;
          at += speed * ms;
          speed *= Math.pow(KEEP_PER_MS, ms);
          const n = set(at);
          if (Math.abs(speed) < STOP || n <= 1 || n >= max) return stop();
          fling.current = requestAnimationFrame(step);
        };
        if (Math.abs(speed) >= STOP) fling.current = requestAnimationFrame(step);
      },
    }),
  ).current;

  const cx = w / 2;
  const half = Math.ceil(cx / TICK) + 1;
  const drawn = [];
  for (let k = Math.max(0, v - half); k <= v + half; k++) {
    const x = cx + (k - v) * TICK;
    const m = scale(k);
    drawn.push(<Line key={`m${k}`} x1={x} y1={0} x2={x} y2={H * m.h} stroke={c.ink} strokeWidth={m.bold ? dt.runW / 2 : 1} />);
    if (m.text) {
      drawn.push(
        <SvgText key={`t${k}`} x={x} y={H * 0.45 + font.size.body + space[1]} fontSize={m.bold ? font.size.heading : font.size.body} fontFamily={m.bold ? font.families.bold : font.families.medium} fill={m.bold ? c.ink : c.mut} textAnchor="middle">
          {m.text}
        </SvgText>,
      );
    }
  }
  const nudge = (d: number) => {
    stop();
    set(v + d);
  };
  return (
    <View style={{ gap: space[1] }}>
      <RowView style={{ alignItems: "center", gap: space[1] }}>
        <View testID={`${testID}-less`}><IconButton icon="chevronLeft" label={stepLabels.less} onPress={() => nudge(-1)} /></View>
        <View style={{ flex: 1, alignItems: "center" }} testID={`${testID}-value`}>
          <T v="title" w="semibold" tabular>{readout}</T>
        </View>
        <View testID={`${testID}-more`}><IconButton icon="chevronRight" label={stepLabels.more} onPress={() => nudge(1)} /></View>
      </RowView>
      <View
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 1, max, now: v, text: readout }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === "increment" ? 1 : -1)}
        onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))}
        style={{ height: H, borderRadius: radius.field, overflow: "hidden", backgroundColor: c.ov, borderWidth: 1, borderColor: c.bd }}
        {...pan.panHandlers}
      >
        {w > 0 ? (
          <Svg width={w} height={H} pointerEvents="none">
            {drawn}
            {/* the mark the length is read at */}
            <Line x1={cx} y1={0} x2={cx} y2={H} stroke={c.ink} strokeWidth={dt.runW} />
            <Path d={`M${cx - space[2]} 0L${cx + space[2]} 0L${cx} ${space[2]}Z`} fill={c.ink} />
          </Svg>
        ) : null}
      </View>
    </View>
  );
}
