import { useLayoutEffect, useRef } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { component, motion, radius, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { T } from "./primitives";
import { barHeight } from "./chartMath";

/**
 * Charts of «Наряд» for «Сегодня» (spec 24 A3–A4): columns and horizontal bars, built from Views (no SVG — steadier
 * on the web). No grid, no axes; the value is written only over the current column, ABOVE the track, so every track
 * has the same height (review #270). Growth animates only a transform (scale from the base): the first time from 0
 * over motion.durChart with a stagger of motion.chartStagger; a new value flows from the old size over motion.durSlow.
 * «Уменьшить движение» (and e2e) — values are set at once. The current column is `ink`, not `acc`: yellow is kept for
 * the one main action (rule 2).
 */
const ease = Easing.bezier(...motion.easeOut);

/**
 * Scale for a bar of `size`: grows from 0 the first time; when the size changes it starts from old/new and flows to 1,
 * so the bar visibly goes from its old length to the new one — with a transform only.
 */
function useScaleIn(size: number, delay: number) {
  const reduce = useReducedMotion();
  const s = useSharedValue(reduce ? 1 : 0);
  const prev = useRef<number | null>(null);
  // layout effect: the new scale is set before the frame is painted — no one-frame jump to the new size
  useLayoutEffect(() => {
    const from = prev.current;
    prev.current = size;
    if (reduce) {
      s.value = 1;
      return;
    }
    if (from === null) {
      s.value = 0;
      s.value = withDelay(delay, withTiming(1, { duration: motion.durChart, easing: ease }));
    } else if (from !== size && size > 0) {
      s.value = from / size;
      s.value = withTiming(1, { duration: motion.durSlow, easing: ease });
    }
  }, [size, reduce, delay, s]);
  return s;
}

export interface Column {
  key: string;
  /** cents or a count — only the proportion matters */
  value: number;
  /** under the column: «Пн», «1–7» */
  label: string;
  /** written over the current column only */
  valueLabel?: string;
  current?: boolean;
  /** all of it is after today — only the track */
  future?: boolean;
}

function Bar({ col, max, index }: { col: Column; max: number; index: number }) {
  const { c } = useTheme();
  const { h, barRadius, mutedOpacity } = component.chart;
  const height = barHeight(col.value, max, col.future);
  const scale = useScaleIn(height, index * motion.chartStagger);
  const grow = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));
  return (
    <View style={{ flex: 1, alignItems: "center", gap: space[1] }}>
      {/* the value line sits above the track in every column (blank where there is no value): equal tracks */}
      <View style={{ alignSelf: "stretch", alignItems: "center" }}>
        <T v="micro" tabular center>
          {" "}
        </T>
        {/* the figure of the current column is wider than its column at a bigger type: it stands over the column, centred, never cut (#1303) */}
        {col.current && col.valueLabel ? (
          <View pointerEvents="none" style={{ position: "absolute", top: 0, width: size.hitMin * 2, alignItems: "center" }}>
            <T v="micro" w="semibold" tabular center>
              {col.valueLabel}
            </T>
          </View>
        ) : null}
      </View>
      <View testID="chart-track" style={{ height: h, width: "100%", justifyContent: "flex-end", borderRadius: barRadius, backgroundColor: c.track, overflow: "hidden" }}>
        {height > 0 ? (
          <Animated.View
            testID={col.current ? "chart-bar-current" : "chart-bar"}
            style={[
              { height, width: "100%", borderRadius: barRadius, backgroundColor: col.current ? c.ink : c.mut, opacity: col.current ? 1 : mutedOpacity, transformOrigin: "bottom" },
              grow,
            ]}
          />
        ) : null}
      </View>
      <T v="micro" tone="mut" numberOfLines={1}>
        {col.label}
      </T>
    </View>
  );
}

/** Columns: «Получено» by days / weeks. Inside a pressable card the card itself carries the description (a11y). */
export function Columns({ items, testID }: { items: Column[]; testID?: string }) {
  const max = Math.max(0, ...items.map((x) => (x.future ? 0 : x.value)));
  return (
    <View testID={testID} style={{ flexDirection: "row", gap: space[2] }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {items.map((col, i) => (
        // keyed by place, not by date: on a new period or after midnight the bars flow, they do not mount and grow from 0
        <Bar key={i} col={col} max={max} index={i} />
      ))}
    </View>
  );
}

/** A horizontal bar on its track (a funnel step): share 0…1 of the widest step. Not a status — neutral fill (rule 2). */
export function Meter({ share, index = 0, testID }: { share: number; index?: number; testID?: string }) {
  const { c } = useTheme();
  const pct = Math.max(0, Math.min(1, share)) * 100;
  const scale = useScaleIn(pct, index * motion.chartStagger);
  const grow = useAnimatedStyle(() => ({ transform: [{ scaleX: scale.value }] }));
  return (
    <View testID={testID} style={{ height: component.chart.track, borderRadius: radius.pill, backgroundColor: c.track, overflow: "hidden" }}>
      {pct > 0 ? <Animated.View style={[{ height: "100%", width: `${pct}%`, borderRadius: radius.pill, backgroundColor: c.mut, transformOrigin: "left" }, grow]} /> : null}
    </View>
  );
}
