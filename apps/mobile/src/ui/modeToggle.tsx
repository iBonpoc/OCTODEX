import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { component, motion, radius, size } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Press, T } from "./primitives";
import { useReadOnly } from "./readOnly";

/**
 * The switch of a totals row (DS §8.7а, #2954 — founder 26.11: «маленький переключатель… такой же должен быть, как тоггловый
 * переключатель. Просто процент влево, вправо доллар. По центру серый выключенный»): a toggle track with one cell per position
 * (`component.modeToggle`), the knob in the chosen one. A value on («%», «$») — the yellow track (`acc`) and the dark knob with its
 * sign (`onAcc` ≈ 18:1, as `Toggle`); off — the grey track (`track`) and the grey knob in the middle. The signs of the other
 * positions stay written on the track. Each position is its own radio (a press there picks it; the screen reader reads a radio
 * group), a zone of `cell` × 44; a press on the chosen one changes nothing.
 */
export function ModeToggle<K extends string>({
  items,
  value,
  off,
  onChange,
  label,
  testID,
}: {
  /** the positions from left to right, each with its short sign («%», «Выкл.» is read, not drawn, «$») */
  items: { key: K; label: string; sign?: string }[];
  value: K;
  /** the position that turns the value off: the grey knob, no sign */
  off: K;
  onChange: (k: K) => void;
  /** what the group is a choice of — read with it */
  label: string;
  /** each position `<testID>-<key>` */
  testID?: string;
}) {
  const { c } = useTheme();
  const ro = useReadOnly();
  const reduce = useReducedMotion();
  const { cell, h, knob } = component.modeToggle;
  const idx = Math.max(0, items.findIndex((i) => i.key === value));
  const on = value !== off;
  const inset = (cell - knob) / 2;
  // the end zones reach past the track: 30 + 7 = 37 (the zone is never narrower than the knob's cell)
  const edge = (size.hitMin - cell) / 2;
  const x = useSharedValue(idx * cell);
  useEffect(() => {
    const to = idx * cell;
    x.value = reduce ? to : withSpring(to, motion.spring);
  }, [idx, cell, reduce, x]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const sign = items[idx]?.sign;
  return (
    <View testID={testID} accessibilityRole="radiogroup" accessibilityLabel={label} style={{ width: cell * items.length, height: h, borderRadius: radius.pill, borderWidth: 1, borderColor: c.bd, backgroundColor: on ? c.acc : c.track, justifyContent: "center" }}>
      {/* the signs of the positions, written on the track (the chosen one is under the knob, which carries it) */}
      <View pointerEvents="none" style={{ position: "absolute", left: -1, top: 0, bottom: 0, flexDirection: "row" }}>
        {items.map((i) => (
          <View key={i.key} style={{ width: cell, alignItems: "center", justifyContent: "center" }}>
            {i.key === off && on ? (
              // a value on: the middle «Выкл.» keeps a quiet mark, so the place to press to turn it off is seen (design review)
              <View style={{ width: component.modeToggle.dot, height: component.modeToggle.dot, borderRadius: component.modeToggle.dot / 2, backgroundColor: c.onAcc, opacity: component.dimOpacity }} />
            ) : null}
            {i.sign ? (
              // on the yellow track the sign of the other position is pale (only the knob's sign reads as chosen — crm-reviewer)
              <T v="caption" w="semibold" style={{ color: on ? c.onAcc : c.mut, opacity: on ? component.dimOpacity : 1 }}>
                {i.sign}
              </T>
            ) : null}
          </View>
        ))}
      </View>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: inset - 1, width: knob, height: knob, borderRadius: knob / 2, backgroundColor: on ? c.onAcc : c.mut, alignItems: "center", justifyContent: "center" }, a]}>
        {on && sign ? (
          <T v="body" w="semibold" style={{ color: c.acc }}>
            {sign}
          </T>
        ) : null}
      </Animated.View>
      {/* the zones: 44 high (size.hitMin); the end positions reach `edge` past the track (crm-reviewer: a finger at the edge picks
          the end, as iOS segments), so «%» and «$» are 37 wide, the middle «Выкл.» 30 — the founder's small toggle (DS §8.7а) */}
      <View style={{ position: "absolute", left: -1 - edge, top: (h - size.hitMin) / 2 - 1, height: size.hitMin, flexDirection: "row" }}>
        {items.map((i, k) => (
          <Press
            key={i.key}
            testID={testID ? `${testID}-${i.key}` : undefined}
            onPress={() => i.key !== value && onChange(i.key)}
            disabled={ro}
            accessibilityRole="radio"
            accessibilityState={{ selected: i.key === value, disabled: ro }}
            // web: a radio is read by aria-checked
            {...({ "aria-checked": i.key === value } as object)}
            accessibilityLabel={i.label}
            style={{ width: cell + (k === 0 || k === items.length - 1 ? edge : 0), height: size.hitMin }}
          >
            {null}
          </Press>
        ))}
      </View>
    </View>
  );
}

/** the toggle's whole width (the row decides one line or two by it) */
export const modeToggleW = (n: number): number => component.modeToggle.cell * n;
