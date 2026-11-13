/**
 * A tape measure to pull (founder 09.11: «как рулетка, бегунком проматывать длину»; then his sample «tape pager»: drag
 * with inertia, it settles on the nearest mark under the line, arrows step one mark, the value big above). A strip of
 * marks under a fixed mark in the middle; the finger drags the tape, a flick keeps it running and slowing, then it
 * settles on a mark. The scale is given: 1/16″ marks (inches numbered, feet bold) or millimetres (centimetres numbered,
 * every 10 cm bold). Only the marks in sight are drawn (a 500′ tape is 48 000 marks). PanResponder: the same on the
 * phone, the tablet and the web; VoiceOver and the arrows step one mark. Our own code (the sample's has no licence).
 */
import { useEffect, useRef, useState } from "react";
import { PanResponder, View, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import { component, drawing as dt, font, radius, size, space, spaceHalf } from "@octo/design-tokens";
import { haptics } from "@/ui/haptics";
import { settleAt, tickDue } from "./tapeMath";
import { useTheme } from "@/theme/ThemeProvider";
import { IconButton } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";
import { useSheetHold } from "@/ui/overlays";

/** px per mark (1/16″ or 1 mm): room for a fraction under each eighth, and wide enough for a finger to hit a mark — the tape is stretched over a real one
 *  (founder 13.11, #1315: «шаг больше… чуть растянутая, ничего страшного»; the token `tapeTick`) */
const TICK = component.tapeTick;
/** tall enough for the marks, the fractions under them and the length under the inch, readable (founder 09.11) */
const H_FULL = size.hitMin * 3;
/** a short window (a phone of 667 pt with the number keyboard up): the strip is a little lower so the window's buttons stay above the keyboard (#1345) */
const H_SHORT = size.hitMin * 2.5;
/** a flick: the share of speed kept per millisecond, and the speed (marks per ms) at which it settles */
const KEEP_PER_MS = 0.996;
const STOP = 0.002;
/** past an end: the share of the pull the tape follows */
const GIVE = 0.3;
/** a move shorter than this is a tap, not a drag (px) */
const MOVE_PX = space[1];
/** a tap finds a number this many marks away at most */
const NEAR = 4;
/** the share of the tape's width shaded at each side */
const FADE = 0.2;
/** an arrow with nowhere to go */
const OFF = 0.35;
/** a glyph's width and its height above the baseline, as shares of the font size (to size the pill under the mark) */
const GLYPH_W = 0.62;
const CAP = 0.78;

/** the pill behind the number under the mark: the main button's colours (founder 09.11, #674 «как у нас кнопки») */
function MarkPill({ x, y, fs, text, fill }: { x: number; y: number; fs: number; text: string; fill: string }) {
  const w = text.length * fs * GLYPH_W + space[2] * 2;
  const h = fs * CAP + space[1] * 2;
  return <Rect x={x - w / 2} y={y - fs * CAP - space[1]} width={w} height={h} rx={h / 2} fill={fill} />;
}

/** where a flick ends (marks): from `at` with `speed` marks/ms, slowing by KEEP_PER_MS each ms — the whole path */
export const coastEnd = (at: number, speed: number) => (Math.abs(speed) < STOP ? at : at + speed / -Math.log(KEEP_PER_MS));

/** one mark of a scale: its height (share of the tape), a number under it, bold */
export interface Mark { h: number; text?: string; bold?: boolean; /** a fraction under a short mark (⅛ … ⅞), ½ bigger */ frac?: string; big?: boolean }
export type Scale = (k: number) => Mark;

/** the fractions of an inch as a tape writes them: a glyph at an eighth (⅜); the sixteenths between carry none (too narrow) */
const EIGHTH = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"];
/** the short marks between two inches, 1/16″ apart: the half longest, then the quarters, the eighths, the sixteenths shortest */
const short = (k: number): Mark => ({ h: k % 8 === 0 ? 0.36 : k % 4 === 0 ? 0.3 : k % 2 === 0 ? 0.24 : 0.16, ...(k % 2 === 0 ? { frac: EIGHTH[(k % 16) / 2], big: k % 16 === 8 } : {}) });
/**
 * 1/16″ (founder 11.11): every inch with the whole length «25′ 6″» (founder 09.11: «на рулетке видно 25 фит 6 инчей,
 * потом тонкая настройка»), the feet bold «26′», the fractions between them shorter; a mark is 1/16″
 */
export const SIXTEENTHS_SCALE: Scale = (k) =>
  k % 192 === 0
    ? { h: 0.45, text: k ? `${k / 192}′` : undefined, bold: true }
    : k % 16 === 0
      ? { h: 0.45, text: `${Math.floor(k / 192)}′ ${(k / 16) % 12}″` }
      : short(k);
/** inches alone: every inch numbered as it is (no feet) */
export const SIXTEENTHS_SCALE_IN: Scale = (k) => (k % 16 === 0 ? { h: 0.45, text: k ? `${k / 16}″` : undefined, bold: k % 192 === 0 } : short(k));
/** millimetres: every centimetre with the whole length «102 cm», every 10 cm bold «1.1 m», the millimetres between */
export const MM_SCALE: Scale = (k) =>
  k % 100 === 0 ? { h: 0.45, text: k ? `${k / 1000} m` : undefined, bold: true } : k % 10 === 0 ? { h: 0.45, text: `${k / 10} cm` } : { h: k % 5 === 0 ? 0.3 : 0.18 };

export function Tape({ marks, onMarks, max, scale, readout, testID, label, stepLabels, short }: {
  /** a short window: the lower strip (`H_SHORT`) */
  short?: boolean;
  /** the value in marks (1/16″ or mm) */
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
  const H = short ? H_SHORT : H_FULL;
  const [w, setW] = useState(0);
  const v = Math.round(marks);
  const now = useRef({ v, onMarks });
  now.current = { v, onMarks };
  const start = useRef(0);
  /** where the tape is while the finger holds it or it runs on (between marks, past the ends with give); null — at v */
  const [pos, setPos] = useState<number | null>(null);
  /** where the finger touched (to tell a tap on a number from a drag) */
  const touch = useRef(0);
  const fling = useRef<number | null>(null);
  const stop = () => {
    if (fling.current !== null) cancelAnimationFrame(fling.current);
    fling.current = null;
  };
  useEffect(() => stop, []);
  /** when the last tick was given (ms): a mark crossed gives one, a flick over many does not buzz (#1315) */
  const lastTick = useRef(0);
  const set = (k: number) => {
    const n = settleAt(k, max);
    if (n !== now.current.v) {
      const t = Date.now();
      // every mark crossed is felt in the hand (DS §15.6: the value changes by steps → `selection`)
      if (tickDue(now.current.v, n, lastTick.current, t)) {
        haptics.selection();
        lastTick.current = t;
      }
      now.current.onMarks(n);
    }
    return n;
  };
  /** past an end the tape gives a little (a third of the pull), as a real one does — the sample's edge */
  const give = (f: number) => (f < 1 ? 1 - (1 - f) * GIVE : f > max ? max + (f - max) * GIVE : f);
  // in a sheet: the tape keeps its finger — the sheet's swipe to close never takes it over (#714)
  const hold = useSheetHold();
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        hold.current = true;
        stop();
        start.current = now.current.v;
        touch.current = e.nativeEvent.locationX;
      },
      // the tape moves with the finger: dragged left, more of it comes out
      onPanResponderMove: (_, g) => {
        const f = give(start.current - g.dx / TICK);
        setPos(f);
        set(f);
      },
      // let go while moving: it runs on, slowing, and settles on the nearest mark (the sample's inertia)
      onPanResponderTerminate: () => {
        hold.current = false;
      },
      onPanResponderRelease: (_, g) => {
        hold.current = false;
        // a tap, not a drag: on a number — the tape comes to it (the sample's click on a page)
        if (Math.abs(g.dx) < MOVE_PX) {
          setPos(null);
          const k = start.current + (touch.current - widthRef.current / 2) / TICK;
          for (let d = 0; d <= NEAR; d++) for (const s of [Math.round(k) + d, Math.round(k) - d]) if (scaleRef.current(s).text) return set(s);
          return;
        }
        let at = Math.min(max, Math.max(1, start.current - g.dx / TICK));
        let speed = -g.vx / TICK;
        let last: number | null = null;
        const step = (t: number) => {
          const ms = last === null ? 0 : t - last;
          last = t;
          at += speed * ms;
          speed *= Math.pow(KEEP_PER_MS, ms);
          const n = set(at);
          setPos(at);
          if (Math.abs(speed) < STOP || n <= 1 || n >= max) {
            setPos(null);
            return stop();
          }
          fling.current = requestAnimationFrame(step);
        };
        set(at);
        if (Math.abs(speed) >= STOP) fling.current = requestAnimationFrame(step);
        else setPos(null);
      },
    }),
  ).current;

  const widthRef = useRef(0);
  widthRef.current = w;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const at = pos ?? v;
  const cx = w / 2;
  const half = Math.ceil(cx / TICK) + 1;
  const drawn = [];
  for (let k = Math.max(0, Math.floor(at) - half); k <= Math.ceil(at) + half; k++) {
    const x = cx + (k - at) * TICK;
    const m = scale(k);
    // the number under the mark stands out on a pill like the main button (founder 09.11, #674 — the one place of `tape.*`)
    const on = Math.abs(k - at) < 0.5;
    drawn.push(<Line key={`m${k}`} x1={x} y1={0} x2={x} y2={H * m.h} stroke={c.ink} strokeWidth={m.bold ? dt.runW / 2 : 1} />);
    // the fraction under its mark (a real tape: ⅛ ¼ ⅜ ½ ⅝ ¾ ⅞, ½ bigger)
    if (m.frac) {
      const fy = H * m.h + font.size.caption + spaceHalf.hair;
      if (on) drawn.push(<MarkPill key={`pf${k}`} x={x} y={fy} fs={font.size.heading} text={m.frac} fill={c.tape.markFill} />);
      drawn.push(
        <SvgText key={`f${k}`} id={on ? `${testID}-at` : undefined} x={x} y={fy} fontSize={m.big || on ? font.size.heading : font.size.caption} fontFamily={m.big || on ? font.families.bold : font.families.medium} fill={on ? c.tape.markText : m.big ? c.ink : c.mut} textAnchor="middle">
          {m.frac}
        </SvgText>,
      );
    }
    if (m.text) {
      if (on) drawn.push(<MarkPill key={`pt${k}`} x={x} y={H - space[2]} fs={font.size.title} text={m.text} fill={c.tape.markFill} />);
      drawn.push(
        <SvgText key={`t${k}`} id={on ? `${testID}-at` : undefined} x={x} y={H - space[2]} fontSize={m.bold || on ? font.size.title : font.size.heading} fontFamily={m.bold || on ? font.families.bold : font.families.medium} fill={on ? c.tape.markText : c.ink} textAnchor="middle">
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
        <View testID={`${testID}-less`} style={{ opacity: v <= 1 ? OFF : 1 }}><IconButton icon="chevronLeft" label={stepLabels.less} onPress={v <= 1 ? undefined : () => nudge(-1)} /></View>
        <View style={{ flex: 1, alignItems: "center" }} testID={`${testID}-value`}>
          <T v="title" w="semibold" tabular>{readout}</T>
        </View>
        <View testID={`${testID}-more`} style={{ opacity: v >= max ? OFF : 1 }}><IconButton icon="chevronRight" label={stepLabels.more} onPress={v >= max ? undefined : () => nudge(1)} /></View>
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
        // the keyboard on a computer (the sample's): ← → one mark, Page ↑ ↓ ten, Home / End the ends
        focusable
        {...({
          tabIndex: 0,
          onKeyDown: (e: { key: string; preventDefault: () => void }) => {
            const by: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 };
            if (by[e.key] !== undefined) nudge(by[e.key]!);
            else if (e.key === "Home") nudge(1 - v);
            else if (e.key === "End") nudge(max - v);
            else return;
            e.preventDefault();
          },
        } as object)}
        // a drag with a mouse must not select the numbers (the web)
        style={{ height: H, borderRadius: radius.field, overflow: "hidden", backgroundColor: c.ov, borderWidth: component.hairline, borderColor: c.bd, ...({ userSelect: "none" } as object) }}
        {...pan.panHandlers}
      >
        {w > 0 ? (
          <Svg width={w} height={H} pointerEvents="none">
            <Defs>
              <LinearGradient id={`${testID}-fade`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={c.ov} stopOpacity={1} />
                <Stop offset={FADE} stopColor={c.ov} stopOpacity={0} />
                <Stop offset={1 - FADE} stopColor={c.ov} stopOpacity={0} />
                <Stop offset="1" stopColor={c.ov} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            {drawn}
            {/* the tape runs into the dark at both sides (the sample's shade) */}
            <Rect x={0} y={0} width={w} height={H} fill={`url(#${testID}-fade)`} />
            {/* the mark the length is read at */}
            {/* as long as the shortest mark: the fraction and the length written under it stay readable */}
            <Line x1={cx} y1={0} x2={cx} y2={H * 0.2} stroke={c.ink} strokeWidth={dt.runW} />
            <Path d={`M${cx - space[2]} 0L${cx + space[2]} 0L${cx} ${space[2]}Z`} fill={c.ink} />
          </Svg>
        ) : null}
      </View>
    </View>
  );
}
