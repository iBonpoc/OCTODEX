import { useEffect, useState, type ReactNode } from "react";
import { TextInput, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { component, font, motion, radius, space, statusIcon, type StatusName } from "@octo/design-tokens";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T, type IconKey } from "./primitives";

/* ---------- Button (DS: visible ≤ 36, hit 44) ---------- */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  label,
  onPress,
  variant = "primary",
  size,
  icon,
  disabled,
  full,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  variant?: BtnVariant;
  size?: "sm" | "md" | "phone";
  icon?: IconKey;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const { wide } = useDevice();
  const h = component.button[size ?? (wide ? "md" : "phone")];
  const bg =
    variant === "primary" ? c.acc : variant === "secondary" ? c.surf2 : variant === "danger" ? c.status.bad.fill : "transparent";
  const fg = variant === "primary" ? c.onAcc : variant === "danger" ? c.status.bad.on : c.ink;
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      visibleHeight={h}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        {
          height: h,
          paddingHorizontal: space[4],
          borderRadius: radius.pill,
          backgroundColor: bg,
          borderWidth: variant === "secondary" ? 1 : 0,
          borderColor: c.bd,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: space[2],
          alignSelf: full ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} s={16} color={fg} /> : null}
      <T v="button" style={{ color: fg }} numberOfLines={1}>
        {label}
      </T>
    </Press>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  active,
  tone,
}: {
  icon: IconKey;
  onPress?: () => void;
  label: string;
  active?: boolean;
  tone?: "acc" | "plain";
}) {
  const { c } = useTheme();
  const s = component.dockBtn;
  const filled = tone === "acc" || active;
  return (
    <Press
      onPress={onPress}
      visibleHeight={s}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: s,
        height: s,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: filled ? c.acc : c.surf2,
        borderWidth: filled ? 0 : 1,
        borderColor: c.bd,
      }}
    >
      <Icon name={icon} s={18} color={filled ? c.onAcc : c.ink} />
    </Press>
  );
}

/* ---------- StatusChip (DS: color = status, always icon + word) ---------- */
export function StatusChip({ status, label, soft }: { status: StatusName; label: string; soft?: boolean }) {
  const { c } = useTheme();
  const st = c.status[status];
  const neutral = status === "neutral";
  const bg = soft ? "transparent" : st.fill;
  const fg = soft ? st.text : st.on;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={{
        height: component.chip.h,
        paddingHorizontal: component.chip.px,
        borderRadius: radius.chip,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: neutral || soft ? c.bd : "transparent",
        flexDirection: "row",
        alignItems: "center",
        gap: space[1],
        alignSelf: "flex-start",
      }}
    >
      <Icon name={statusIcon[status]} s={12} color={fg} />
      <T v="caption" w="semibold" style={{ color: fg }} numberOfLines={1}>
        {label}
      </T>
    </View>
  );
}

/* ---------- Toggle (spring knob) ---------- */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const { w, h, knob } = component.switch;
  const pad = (h - knob) / 2 - 1;
  const x = useSharedValue(on ? w - knob - pad * 2 - 2 : 0);
  useEffect(() => {
    const to = on ? w - knob - pad * 2 - 2 : 0;
    x.value = reduce ? to : withSpring(to, motion.spring);
  }, [on, reduce, w, knob, pad, x]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Press
      onPress={() => onChange(!on)}
      visibleHeight={h}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={{
        width: w,
        height: h,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: c.bd,
        backgroundColor: on ? c.acc : c.track,
        padding: pad,
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={[{ width: knob, height: knob, borderRadius: knob / 2, backgroundColor: on ? c.onAcc : c.ink }, a]}
      />
    </Press>
  );
}

/* ---------- Segmented: "liquid" fill stretches to the new item (160ms) then settles with a spring (420ms) ---------- */
export function Segmented<K extends string>({
  items,
  value,
  onChange,
  full,
}: {
  items: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
  full?: boolean;
}) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const [layouts, setLayouts] = useState<Record<string, { x: number; w: number }>>({});
  const left = useSharedValue(0);
  const width = useSharedValue(0);
  const ready = Object.keys(layouts).length === items.length;

  useEffect(() => {
    const l = layouts[value];
    if (!l) return;
    if (reduce || width.value === 0) {
      left.value = l.x;
      width.value = l.w;
      return;
    }
    const fromL = left.value;
    const fromR = left.value + width.value;
    const spanL = Math.min(fromL, l.x);
    const spanR = Math.max(fromR, l.x + l.w);
    const stretch = { duration: motion.liquidStretch, easing: Easing.bezier(...motion.easeOut) };
    const settle = { duration: motion.liquidSettle, easing: Easing.bezier(...motion.easeLiquid) };
    left.value = withSequence(withTiming(spanL, stretch), withTiming(l.x, settle));
    width.value = withSequence(withTiming(spanR - spanL, stretch), withTiming(l.w, settle));
  }, [value, layouts, reduce, left, width]);

  const pill = useAnimatedStyle(() => ({ left: left.value, width: width.value }));
  const { h, pad } = component.segmented;
  return (
    <View
      accessibilityRole="tablist"
      style={{
        height: h,
        padding: pad,
        borderRadius: radius.pill,
        backgroundColor: c.track,
        flexDirection: "row",
        alignSelf: full ? "stretch" : "flex-start",
      }}
    >
      {ready ? (
        <Animated.View
          style={[{ position: "absolute", top: pad, bottom: pad, borderRadius: radius.pill, backgroundColor: c.acc }, pill]}
        />
      ) : null}
      {items.map((it) => {
        const sel = it.key === value;
        return (
          <Press
            key={it.key}
            onPress={() => onChange(it.key)}
            visibleHeight={h}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            onLayout={(e: LayoutChangeEvent) => {
              const { x, width: w } = e.nativeEvent.layout;
              setLayouts((p) => (p[it.key]?.x === x && p[it.key]?.w === w ? p : { ...p, [it.key]: { x, w } }));
            }}
            style={{
              height: h - pad * 2,
              paddingHorizontal: space[3],
              justifyContent: "center",
              borderRadius: radius.pill,
              backgroundColor: !ready && sel ? c.acc : "transparent",
            }}
          >
            <T v="button" style={{ color: sel ? c.onAcc : c.ink }} numberOfLines={1}>
              {it.label}
            </T>
          </Press>
        );
      })}
    </View>
  );
}

/* ---------- Avatar (initials) ---------- */
export function Avatar({ initials, s = component.avatar.md, sub }: { initials: string; s?: number; sub?: boolean }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        width: s,
        height: s,
        borderRadius: s / 2,
        backgroundColor: c.surf2,
        borderWidth: 1,
        borderColor: c.bd,
        borderStyle: sub ? "dashed" : "solid",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <T v={s < 32 ? "micro" : "caption"} w="semibold">
        {initials}
      </T>
    </View>
  );
}

/* ---------- Stepper (visit steps) ---------- */
export function Steps({ labels, current }: { labels: string[]; current: number }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[1] }} accessibilityRole="progressbar">
      {labels.map((l, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <View key={l} style={{ flex: 1, gap: space[1] }}>
            <View
              style={{
                height: 4,
                borderRadius: radius.pill,
                backgroundColor: done ? c.status.ok.fill : now ? c.acc : c.track,
              }}
            />
            <T v="micro" tone={done || now ? "ink" : "mut"} w={now ? "semibold" : "medium"} numberOfLines={1}>
              {l}
            </T>
          </View>
        );
      })}
    </View>
  );
}


/* ---------- TextField (phone 44, wide 34) ---------- */
export function TextField({
  value,
  onChangeText,
  placeholder,
  icon,
  multiline,
}: {
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  icon?: IconKey;
  multiline?: boolean;
}) {
  const { c } = useTheme();
  const { wide } = useDevice();
  const h = wide ? component.field.h : component.field.phone;
  return (
    <View
      style={{
        minHeight: h,
        borderRadius: radius.field,
        borderWidth: 1,
        borderColor: c.bd,
        backgroundColor: c.in,
        flexDirection: "row",
        alignItems: multiline ? "flex-start" : "center",
        paddingHorizontal: space[3],
        paddingVertical: multiline ? space[2] : 0,
        gap: space[2],
      }}
    >
      {icon ? <Icon name={icon} s={16} color={c.mut} /> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.mut}
        multiline={multiline}
        accessibilityLabel={placeholder}
        style={{
          flex: 1,
          minHeight: multiline ? h * 2 : h,
          color: c.ink,
          fontFamily: font.families.regular,
          fontSize: font.size.body + 2,
          textAlignVertical: multiline ? "top" : "center",
          outlineStyle: "none",
        } as object}
      />
    </View>
  );
}
