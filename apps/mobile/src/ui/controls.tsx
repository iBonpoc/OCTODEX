import { useEffect, useState, type ReactNode } from "react";
import { ScrollView, TextInput, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { component, font, motion, radius, space, statusIcon, type StatusName, size as sizes } from "@octo/design-tokens";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T, type IconKey } from "./primitives";
import { FIELD, type FieldType } from "./fieldTypes";
export { fieldSpec, type FieldType } from "./fieldTypes";

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
      {icon ? <Icon name={icon} s={sizes.iconSm} color={fg} /> : null}
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
      <Icon name={icon} s={sizes.iconMd} color={filled ? c.onAcc : c.ink} />
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
      <Icon name={statusIcon[status]} s={sizes.iconSm} color={fg} />
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
  scroll,
}: {
  items: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
  full?: boolean;
  /** many tabs: one line that scrolls sideways on a narrow phone (the page itself never scrolls sideways) */
  scroll?: boolean;
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
  const bar = (
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
          // selected: ink frame on a raised surface — yellow is kept for the one main action (rule 2, unslop 05.11 №1)
          style={[{ position: "absolute", top: pad, bottom: pad, borderRadius: radius.pill, backgroundColor: c.surf2, borderWidth: 1, borderColor: c.ink }, pill]}
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
              backgroundColor: !ready && sel ? c.surf2 : "transparent",
              borderWidth: !ready && sel ? 1 : 0,
              borderColor: c.ink,
            }}
          >
            <T v="button" w={sel ? "bold" : undefined} style={{ color: c.ink }} numberOfLines={1}>
              {it.label}
            </T>
          </Press>
        );
      })}
    </View>
  );
  // scroll: a fixed capsule the width of the screen; the tabs slide inside it, its rounded ends never get cut
  return scroll ? (
    <View style={{ alignSelf: "stretch", borderRadius: radius.pill, overflow: "hidden", backgroundColor: c.track }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        {bar}
      </ScrollView>
    </View>
  ) : (
    bar
  );
}

/* ---------- Tag: neutral label on a client (never coloured: colour is only for statuses) ---------- */
export function TagChip({ label, onPress }: { label: string; onPress?: () => void }) {
  const { c } = useTheme();
  const body = (
    <View
      style={{
        height: component.button.sm,
        paddingHorizontal: space[3],
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: c.bd,
        backgroundColor: c.surf2,
        justifyContent: "center",
      }}
    >
      <T v="caption" numberOfLines={1}>
        {label}
      </T>
    </View>
  );
  if (!onPress) return body;
  return (
    <Press onPress={onPress} visibleHeight={component.button.sm} accessibilityRole="button" accessibilityLabel={label}>
      {body}
    </Press>
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

/* ---------- MetaTag: a neutral count or fact (not a status — rule 2); its own icon (spec 06 §0a) ---------- */
export function MetaTag({ label, icon }: { label: string; icon?: IconKey }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[1], height: component.chip.h, paddingHorizontal: component.chip.px, borderRadius: radius.chip, borderWidth: component.hairline, borderColor: c.bd }}>
      {icon ? <Icon name={icon} s={sizes.iconXs} color={c.mut} /> : null}
      <T v="caption" w="medium" style={{ color: icon ? c.ink : c.mut }}>
        {label}
      </T>
    </View>
  );
}

/* ---------- ProgressBar: "5 of 8" as a thin bar, not a colored chip ---------- */
export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const { c } = useTheme();
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <View style={{ gap: space[1] }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: value }}>
      <View style={{ height: component.stepBar, borderRadius: radius.pill, backgroundColor: c.track, overflow: "hidden" }}>
        <View style={{ width: `${pct}%`, height: "100%", backgroundColor: c.status.ok.fill }} />
      </View>
      {label ? (
        <T v="caption" tone="mut">
          {label}
        </T>
      ) : null}
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
                height: component.stepBar,
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
  type,
  placeholder,
  label,
  icon,
  multiline,
  onSubmit,
}: {
  value: string;
  onChangeText: (s: string) => void;
  /** what the field holds: keyboard, autofill and formatting follow from it */
  type: FieldType;
  placeholder?: string;
  /** screen-reader name when the placeholder is an example ("(555) 555-0100") */
  label?: string;
  icon?: IconKey;
  multiline?: boolean;
  /** return key on the keyboard */
  onSubmit?: () => void;
}) {
  const { c } = useTheme();
  const { wide } = useDevice();
  const f = FIELD[type];
  const multi = multiline ?? f.multiline ?? false;
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
        alignItems: multi ? "flex-start" : "center",
        paddingHorizontal: space[3],
        paddingVertical: multi ? space[2] : 0,
        gap: space[2],
      }}
    >
      {icon ? <Icon name={icon} s={sizes.iconSm} color={c.mut} /> : null}
      <TextInput
        value={value}
        onChangeText={(v) => onChangeText(f.fmt ? f.fmt(v) : v)}
        placeholder={placeholder}
        placeholderTextColor={c.mut}
        multiline={multi}
        keyboardType={f.kb ?? "default"}
        inputMode={f.kb === "decimal-pad" ? "decimal" : f.kb === "number-pad" ? "numeric" : f.kb === "phone-pad" ? "tel" : f.kb === "email-address" ? "email" : f.kb === "url" ? "url" : type === "search" ? "search" : "text"}
        autoComplete={f.ac}
        textContentType={f.tc ?? "none"}
        autoCapitalize={f.cap}
        autoCorrect={f.correct ?? true}
        spellCheck={f.correct ?? true}
        secureTextEntry={f.secure}
        maxLength={f.max}
        returnKeyType={multi ? "default" : f.ret ?? (onSubmit ? "done" : "next")}
        onSubmitEditing={onSubmit}
        submitBehavior={multi ? "newline" : "blurAndSubmit"}
        accessibilityLabel={label ?? placeholder}
        style={{
          flex: 1,
          minHeight: multi ? h * 2 : h,
          color: c.ink,
          fontFamily: font.families.regular,
          fontSize: font.size.body + 2,
          textAlignVertical: multi ? "top" : "center",
          outlineStyle: "none",
        } as object}
      />
    </View>
  );
}

/* ---------- Stepper: − value + (buttons 36, hit 44) ---------- */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  label,
  unit,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  label: string;
  unit?: string;
}) {
  const { c } = useTheme();
  const b = component.dockBtn;
  const btn = (icon: IconKey, delta: number, a11y: string) => (
    <Press
      onPress={() => onChange(Math.min(max, Math.max(min, value + delta)))}
      disabled={delta < 0 ? value <= min : value >= max}
      visibleHeight={b}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={{ width: b, height: b, borderRadius: radius.pill, backgroundColor: c.surf2, borderWidth: 1, borderColor: c.bd, alignItems: "center", justifyContent: "center" }}
    >
      <Icon name={icon} s={sizes.iconSm} />
    </Press>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: sizes.hitMin }} accessibilityLabel={label}>
      <T v="body" style={{ flex: 1 }}>
        {label}
      </T>
      {btn("minus", -step, `${label} −${step}`)}
      <T v="heading" tabular style={{ minWidth: component.stepperValueW, textAlign: "center" }}>
        {value}
        {unit ? <T v="caption" tone="mut">{` ${unit}`}</T> : null}
      </T>
      {btn("plus", step, `${label} +${step}`)}
    </View>
  );
}

/* ---------- ChoiceChips: wrapping single choice (when a segmented control would overflow) ---------- */
export function ChoiceChips<K extends string>({
  items,
  value,
  onChange,
  nowrap,
}: {
  items: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
  /** one line (put inside a horizontal ScrollView) */
  nowrap?: boolean;
}) {
  const { c } = useTheme();
  const h = component.button.sm;
  return (
    <View style={{ flexDirection: "row", flexWrap: nowrap ? "nowrap" : "wrap", gap: space[2] }} accessibilityRole="radiogroup">
      {items.map((it) => {
        const sel = it.key === value;
        return (
          <Press
            key={it.key}
            onPress={() => onChange(it.key)}
            visibleHeight={h}
            accessibilityRole="radio"
            accessibilityState={{ selected: sel }}
            accessibilityLabel={it.label}
            style={{
              height: h,
              paddingHorizontal: space[3],
              borderRadius: radius.pill,
              justifyContent: "center",
              // selected: ink frame on the same surface — yellow is kept for the one main action (rule 2, spec 06 «Аудит» №1)
              backgroundColor: c.surf2,
              borderWidth: sel ? component.selectedBorder : 1,
              borderColor: sel ? c.ink : c.bd,
            }}
          >
            <T v="button" w={sel ? "bold" : undefined} style={{ color: c.ink }}>
              {it.label}
            </T>
          </Press>
        );
      })}
    </View>
  );
}

/* ---------- MultiChips: wrapping multi choice (same look as ChoiceChips) ---------- */
export function MultiChips<K extends string>({
  items,
  value,
  onChange,
}: {
  items: { key: K; label: string }[];
  value: K[];
  onChange: (v: K[]) => void;
}) {
  const { c } = useTheme();
  const h = component.button.sm;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
      {items.map((it) => {
        const sel = value.includes(it.key);
        return (
          <Press
            key={it.key}
            onPress={() => onChange(sel ? value.filter((x) => x !== it.key) : [...value, it.key])}
            visibleHeight={h}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: sel }}
            accessibilityLabel={it.label}
            style={{
              height: h,
              paddingHorizontal: space[3],
              borderRadius: radius.pill,
              justifyContent: "center",
              backgroundColor: sel ? c.acc : c.surf2,
              borderWidth: sel ? 0 : 1,
              borderColor: c.bd,
            }}
          >
            <T v="button" style={{ color: sel ? c.onAcc : c.ink }}>
              {sel ? "✓ " : ""}
              {it.label}
            </T>
          </Press>
        );
      })}
    </View>
  );
}
