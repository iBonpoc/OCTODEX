/**
 * A tape measure to pull (founder 09.11: «как рулетка, бегунком проматывать длину»): a strip of marks — every 1/8″, the
 * inches longer and numbered, the feet bold — under a fixed mark in the middle; the finger drags the tape and the length
 * under the mark is the gutter's, to 1/8″. Only the marks in sight are drawn (a 500′ tape is 48 000 marks).
 * PanResponder: the same on the phone, the tablet and the web; the keyboard / VoiceOver step it by 1/8″.
 */
import { useRef, useState } from "react";
import { PanResponder, View, type LayoutChangeEvent } from "react-native";
import Svg, { Line, Path, Text as SvgText } from "react-native-svg";
import { drawing as dt, font, radius, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";

/** px per 1/8″ */
const TICK = space[2];
const H = size.hitMin * 2;

export function Tape({ value, onChange, max, testID, label }: { value: number; onChange: (inches: number) => void; max: number; testID: string; label: string }) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const v8 = Math.round(value * 8);
  const now = useRef({ v8, onChange });
  now.current = { v8, onChange };
  const start = useRef(0);
  const set8 = (k: number) => {
    const n = Math.min(Math.round(max * 8), Math.max(1, k));
    if (n !== now.current.v8) now.current.onChange(n / 8);
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start.current = now.current.v8;
      },
      // the tape moves with the finger: dragged left, more of it comes out
      onPanResponderMove: (_, g) => set8(start.current - Math.round(g.dx / TICK)),
    }),
  ).current;

  const cx = w / 2;
  const half = Math.ceil(cx / TICK) + 1;
  const marks = [];
  for (let k = Math.max(0, v8 - half); k <= v8 + half; k++) {
    const x = cx + (k - v8) * TICK;
    const foot = k % 96 === 0;
    const inch = k % 8 === 0;
    const len = foot || inch ? 0.45 : k % 4 === 0 ? 0.32 : k % 2 === 0 ? 0.24 : 0.16;
    marks.push(<Line key={`m${k}`} x1={x} y1={0} x2={x} y2={H * len} stroke={c.ink} strokeWidth={foot ? dt.runW / 2 : 1} />);
    if (inch && k > 0) {
      const txt = foot ? `${k / 96}′` : String((k / 8) % 12);
      marks.push(
        <SvgText key={`t${k}`} x={x} y={H * 0.45 + font.size.body + space[1]} fontSize={foot ? font.size.heading : font.size.body} fontFamily={foot ? font.families.bold : font.families.medium} fill={foot ? c.ink : c.mut} textAnchor="middle">
          {txt}
        </SvgText>,
      );
    }
  }
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: Math.round(max * 8), now: v8 }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => set8(v8 + (e.nativeEvent.actionName === "increment" ? 1 : -1))}
      onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))}
      style={{ height: H, borderRadius: radius.field, overflow: "hidden", backgroundColor: c.ov, borderWidth: 1, borderColor: c.bd }}
      {...pan.panHandlers}
    >
      {w > 0 ? (
        <Svg width={w} height={H} pointerEvents="none">
          {marks}
          {/* the mark the length is read at */}
          <Line x1={cx} y1={0} x2={cx} y2={H} stroke={c.ink} strokeWidth={dt.runW} />
          <Path d={`M${cx - space[2]} 0L${cx + space[2]} 0L${cx} ${space[2]}Z`} fill={c.ink} />
        </Svg>
      ) : null}
    </View>
  );
}
