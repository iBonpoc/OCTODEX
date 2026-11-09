/**
 * A wheel to spin (founder 09.11: «колесиком, как у айфона в будильнике»): the choices in a column, the one in the
 * middle band is picked; the rest fade off up and down. A flick settles on the nearest; a tap on a row turns to it.
 * No library: a ScrollView that snaps itself (the same on the phone, the tablet and the web).
 */
import { useEffect, useRef, useState } from "react";
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from "react-native";
import { component, motion, radius, size } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Press, T } from "@/ui/primitives";

const ROW = size.hitMin;
/** rows seen: the picked one and two on each side */
const SEEN = 5;

export function Wheel({ items, value, onChange, testID, label }: { items: { key: number; label: string }[]; value: number; onChange: (k: number) => void; testID: string; label: string }) {
  const { c } = useTheme();
  const ref = useRef<ScrollViewInstance>(null);
  const at = Math.max(0, items.findIndex((x) => x.key === value));
  const [y, setY] = useState(at * ROW);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnTo = (i: number, animated = true) => ref.current?.scrollTo({ y: i * ROW, animated });
  // the value from outside (a new sheet, a reset): the wheel turns to it
  useEffect(() => {
    if (Math.round(y / ROW) !== at) turnTo(at, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);
  const pick = (i: number) => {
    const k = Math.min(items.length - 1, Math.max(0, i));
    turnTo(k);
    if (items[k]!.key !== value) onChange(items[k]!.key);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const now = e.nativeEvent.contentOffset.y;
    setY(now);
    // it stopped: settle on the nearest row (the web has no snap of its own)
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => pick(Math.round(now / ROW)), motion.durFast);
  };
  return (
    <View testID={testID} accessibilityRole="radiogroup" accessibilityLabel={label} style={{ width: component.qtyFieldW, height: ROW * SEEN }}>
      {/* the band of the picked row */}
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: ROW * 2, height: ROW, borderRadius: radius.field, backgroundColor: c.ov }} />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={onScroll}
        contentOffset={{ x: 0, y: at * ROW }}
        contentContainerStyle={{ paddingVertical: ROW * 2 }}
        nestedScrollEnabled
      >
        {items.map((x, i) => {
          const off = Math.min(2, Math.abs(i - y / ROW));
          const picked = x.key === value;
          return (
            <Press
              key={x.key}
              onPress={() => pick(i)}
              accessibilityRole="radio"
              accessibilityState={{ checked: picked }}
              // web: a radio is read by aria-checked (as ChoiceChips)
              {...({ "aria-checked": picked } as object)}
              accessibilityLabel={x.label}
              containerStyle={{ height: ROW }}
              style={{ height: ROW, alignItems: "center", justifyContent: "center", opacity: 1 - off * 0.35 }}
            >
              <T v={off < 0.5 ? "title" : "heading"} w={off < 0.5 ? "semibold" : "medium"} tone={off < 0.5 ? "ink" : "mut"} tabular>
                {x.label}
              </T>
            </Press>
          );
        })}
      </ScrollView>
    </View>
  );
}
