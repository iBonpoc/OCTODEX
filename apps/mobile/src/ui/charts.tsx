import { useEffect, useRef } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { component, motion, radius, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { T } from "./primitives";

/**
 * Charts of «Наряд» for «Сегодня» (spec 24 A3–A4): columns and horizontal bars, built from Views (no SVG — steadier
 * on the web). No grid, no axes; the value is written only over the current column. Growth: the first time from 0
 * over motion.durChart with a stagger of motion.chartStagger; a new value flows over motion.durSlow.
 * «Уменьшить движение» (and e2e) — values are set at once. The current column is `ink`, not `acc`: yellow is kept for
 * the one main action (rule 2).
 */
const ease = Easing.bezier(...motion.easeOut);

/** a value that grows from 0 the first time and flows to the next value after that */
function useGrow(target: number, delay: number) {
  const reduce = useReducedMotion();
  const v = useSharedValue(reduce ? target : 0);
  const first = useRef(true);
  useEffect(() => {
    if (reduce) {
      v.value = target;
    } else if (first.current) {
      v.value = withDelay(delay, withTiming(target, { duration: motion.durChart, easing: ease }));
    } else {
      v.value = withTiming(target, { duration: motion.durSlow, easing: ease });
    }
    first.current = false;
  }, [target, reduce, delay, v]);
  return v;
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
  const { h, barMin, barRadius, mutedOpacity } = component.chart;
  const target = col.future ? 0 : max > 0 ? barMin + ((h - barMin) * col.value) / max : barMin;
  const height = useGrow(target, index * motion.chartStagger);
  const fill = useAnimatedStyle(() => ({ height: height.value }));
  return (
    <View style={{ flex: 1, alignItems: "center", gap: space[1] }}>
      <View style={{ height: h, width: "100%", justifyContent: "flex-end" }}>
        {col.current && col.valueLabel ? (
          <T v="micro" w="semibold" tabular center numberOfLines={1}>
            {col.valueLabel}
          </T>
        ) : null}
        <View style={{ flex: 1, justifyContent: "flex-end", borderRadius: barRadius, backgroundColor: c.track, overflow: "hidden" }}>
          {col.future ? null : (
            <Animated.View
              style={[
                { width: "100%", borderRadius: barRadius, backgroundColor: col.current ? c.ink : c.mut, opacity: col.current ? 1 : mutedOpacity },
                fill,
              ]}
            />
          )}
        </View>
      </View>
      <T v="micro" tone="mut" numberOfLines={1}>
        {col.label}
      </T>
    </View>
  );
}

/** Columns: «Получено» by days / weeks. `a11y` — the whole chart read as one image («Получено по дням: Пн $0, …»). */
export function Columns({ items, a11y, testID }: { items: Column[]; a11y: string; testID?: string }) {
  const max = Math.max(0, ...items.map((x) => (x.future ? 0 : x.value)));
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={a11y} style={{ flexDirection: "row", gap: space[2] }}>
      {items.map((col, i) => (
        <Bar key={col.key} col={col} max={max} index={i} />
      ))}
    </View>
  );
}

/** A horizontal bar on its track (a funnel step): share 0…1 of the widest step. Not a status — neutral fill (rule 2). */
export function Meter({ share, index = 0, testID }: { share: number; index?: number; testID?: string }) {
  const { c } = useTheme();
  const pctW = useGrow(Math.max(0, Math.min(1, share)) * 100, index * motion.chartStagger);
  const fill = useAnimatedStyle(() => ({ width: `${pctW.value}%` }));
  return (
    <View testID={testID} style={{ height: component.chart.track, borderRadius: radius.pill, backgroundColor: c.track, overflow: "hidden" }}>
      <Animated.View style={[{ height: "100%", borderRadius: radius.pill, backgroundColor: c.mut }, fill]} />
    </View>
  );
}
