import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { FieldBinding } from "./requiredForm";
import { Platform, ScrollView, TextInput, View, type LayoutChangeEvent, type ScrollViewInstance, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { component, spaceHalf, font, motion, radius, space, statusIcon, type StatusName, size as sizes } from "@octo/design-tokens";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { fillStyle, fillStyleFlat } from "./fill";
import { Icon, Press, T, type IconKey } from "./primitives";
import { SelectField } from "./selectField";
import { FIELD, type FieldType } from "./fieldTypes";
import { focusPlan } from "./fieldFocus";
import { offsetToShow } from "./segmentedScroll";

/**
 * «Только просмотр» (spec 26 §3, 07.11: the office sees the company settings but only the director changes them).
 * Inside <ReadOnly value> fields do not take text and choice controls do not change (shown dimmed, a11y disabled).
 * Off by default — every existing screen behaves as before. Buttons that save are hidden by the screen itself.
 */
export { ReadOnly, useReadOnly } from "./readOnly";
import { useReadOnly } from "./readOnly";
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
  testID,
}: {
  label: string;
  onPress?: () => void;
  variant?: BtnVariant;
  /** "bar": a button of the pinned action bar (DS §8.9) — 44 high, a label in two lines grows it instead of being cut */
  size?: "sm" | "md" | "phone" | "bar";
  icon?: IconKey;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { c } = useTheme();
  const { wide } = useDevice();
  const bar = size === "bar";
  const h = bar ? component.button.hit : component.button[size ?? (wide ? "md" : "phone")];
  const bg =
    variant === "primary" ? c.acc : variant === "secondary" ? c.surf2 : variant === "danger" ? c.status.bad.fill : "transparent";
  const fg = variant === "primary" ? c.onAcc : variant === "danger" ? c.status.bad.on : c.ink;
  return (
    <Press
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      visibleHeight={h}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        {
          minHeight: h,
          paddingHorizontal: space[4],
          borderRadius: radius.pill,
          ...(bar ? { paddingVertical: space[1] } : null),
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
      <T v="button" style={bar ? { color: fg, flexShrink: 1, textAlign: "center" } : { color: fg }} numberOfLines={bar ? 2 : 1}>
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
        minHeight: component.chip.h,
        paddingHorizontal: component.chip.px,
        borderRadius: radius.chip,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: neutral || soft ? c.bd : "transparent",
        flexDirection: "row",
        alignItems: "center",
        gap: space[1],
        alignSelf: "flex-start",
        // a long word (RU / ES, a bigger system font) wraps inside the chip, it is never cut (#1303)
        maxWidth: "100%",
        paddingVertical: spaceHalf.hair,
      }}
    >
      <Icon name={statusIcon[status]} s={sizes.iconSm} color={fg} />
      <T v="caption" w="semibold" style={{ color: fg, flexShrink: 1 }}>
        {label}
      </T>
    </View>
  );
}

/* ---------- Toggle (spring knob) ---------- */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; /** the switch is there but does not answer (a client without tax): pale, skipped by Tab, read as «disabled» */ disabled?: boolean }) {
  const { c } = useTheme();
  const ro = useReadOnly();
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
      disabled={ro || disabled}
      visibleHeight={h}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: ro || !!disabled }}
      // web: a switch is read by aria-checked (as the radio below); without it the state is silent there (P4c)
      {...({ "aria-checked": on, "aria-disabled": ro || !!disabled || undefined } as object)}
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
        opacity: disabled ? component.dimOpacity : 1,
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
  testID,
  radio,
  label,
  equal,
}: {
  items: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
  full?: boolean;
  /** each tab gets `<testID>-<key>` (tests find a tab by it, not by its words — CHECKS §9 п.2) */
  testID?: string;
  /** many tabs: one line that scrolls sideways on a narrow phone (the page itself never scrolls sideways) */
  scroll?: boolean;
  /** a choice of a value in a form (not tabs of a screen): read as a radio group (#1095: ChoiceChips with a few options) */
  radio?: boolean;
  /** what the group is a choice of — read with the group (the caption above it is not tied to it) */
  label?: string;
  /** with `full`: every segment the same width — a column under each lines up with it (the totals of the options, DS §8.10) */
  equal?: boolean;
}) {
  const ro = useReadOnly();
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const [layouts, setLayouts] = useState<Record<string, { x: number; w: number }>>({});
  const left = useSharedValue(0);
  const width = useSharedValue(0);
  const ready = Object.keys(layouts).length === items.length;
  // scroll: the line follows the selected tab (a remembered tab past the edge is brought into view)
  const strip = useRef<ScrollViewInstance>(null);
  const view = useRef({ w: 0, offset: 0 });
  const [viewW, setViewW] = useState(0);
  useEffect(() => {
    const l = layouts[value];
    if (!scroll || !l || !viewW) return;
    // the line's width from the tabs themselves (not a separate content-size event that may come later)
    const content = Math.max(...Object.values(layouts).map((x) => x.x + x.w)) + component.segmented.pad;
    const to = offsetToShow(l, { ...view.current, content }, space[3]);
    if (to !== null) strip.current?.scrollTo({ x: to, animated: !reduce });
  }, [scroll, value, layouts, viewW, reduce]);

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
      accessibilityRole={radio ? "radiogroup" : "tablist"}
      accessibilityLabel={label}
      style={{
        minHeight: h,
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
          style={[{ position: "absolute", top: pad, bottom: pad, borderRadius: radius.pill }, fillStyleFlat(c), pill]}
        />
      ) : null}
      {items.map((it) => {
        const sel = it.key === value;
        return (
          <Press
            key={it.key}
            testID={testID ? `${testID}-${it.key}` : undefined}
            onPress={() => onChange(it.key)}
            disabled={ro}
            visibleHeight={h}
            containerStyle={equal ? { flex: 1 } : undefined}
            accessibilityRole={radio ? "radio" : "tab"}
            accessibilityState={radio ? { selected: sel, checked: sel } : { selected: sel }}
            {...(radio ? ({ "aria-checked": sel } as object) : null)}
            onLayout={(e: LayoutChangeEvent) => {
              const { x, width: w } = e.nativeEvent.layout;
              setLayouts((p) => (p[it.key]?.x === x && p[it.key]?.w === w ? p : { ...p, [it.key]: { x, w } }));
            }}
            style={{
              minHeight: h - pad * 2,
              paddingHorizontal: space[3],
              justifyContent: "center",
              ...(equal ? { alignItems: "center" } : null),
              // a choice in a form never grows past its card: the labels give way, they do not push the segment out
              ...(radio ? { flexShrink: 1 } : null),
              borderRadius: radius.pill,
              ...(!ready && sel ? fillStyle(c) : { backgroundColor: "transparent" }),
            }}
          >
            <T v="button" w={sel ? "semibold" : undefined} style={{ color: sel ? c.ink : c.mut }} numberOfLines={1}>
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
      <ScrollView
        ref={strip}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        scrollEventThrottle={16}
        onScroll={(e) => {
          view.current.offset = e.nativeEvent.contentOffset.x;
        }}
        onLayout={(e) => {
          view.current.w = e.nativeEvent.layout.width;
          setViewW(e.nativeEvent.layout.width);
        }}
      >
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
        minHeight: component.button.sm,
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
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[1], minHeight: component.chip.h, paddingHorizontal: component.chip.px, borderRadius: radius.chip, borderWidth: component.hairline, borderColor: c.bd }}>
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
                // the current step is a status (info), not the accent: yellow is kept for the main action (rule 2)
                backgroundColor: done ? c.status.ok.fill : now ? c.status.info.fill : c.track,
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
  rows,
  onSubmit,
  autoFocus,
  selectOnFocus,
  focusNow,
  chain,
  onFocus,
  field,
  error,
  testID,
  prefix,
  suffix,
  accessoryID,
  onBlurText,
  a11yLabel,
  action,
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
  /** a multi-line field: how many lines it shows empty (2 by default); it grows with the text either way */
  rows?: 1 | 2;
  /** return key on the keyboard */
  onSubmit?: () => void;
  /** focus (and the keyboard) as soon as the field appears — a sheet opened for one value */
  autoFocus?: boolean;
  /** the text is selected when the field gets the focus: a typed digit replaces a prefilled value */
  selectOnFocus?: boolean;
  /** a counter: each time it grows the field takes the focus AT ONCE (no sheet-opening wait) and selects its text — the next field of a chain; the keyboard stays up (#1316) */
  focusNow?: number;
  /** a field of a chain (feet → inches): the keyboard's key says «next» and keeps the focus on submit — no close-and-open of the keyboard (Android, #1316) */
  chain?: boolean;
  /** the field took the focus (a tap, or `focusNow`) */
  onFocus?: () => void;
  /** a required field of a form (`useRequiredForm().field(id)`): its error, its place for the scroll, its focus */
  field?: FieldBinding;
  /** «что вписать» under the field: alert + text, the frame `status.bad` (DS §11 п.2; the form gives it through `field`) */
  error?: string;
  testID?: string;
  /** the unit sign inside the field: «$» before the number, «%» / «ft» / «ea» after it (`mut`, DS А6.2) */
  prefix?: string;
  suffix?: string;
  /** iOS: the bar above the keyboard (`nativeID` of an InputAccessoryView), the number keyboard has no «Готово» */
  accessoryID?: string;
  /** the person leaves the field */
  onBlurText?: () => void;
  /** screen-reader name with the unit («Цена, долларов») */
  a11yLabel?: string;
  /**
   * the field's helper action («Вставить», «Очистить», «Показать»): an icon inside the field on the right, no words, no plate;
   * a real 44 × 44 touch box (the web has no hitSlop), `label` for the screen reader and the web's hover hint (DS §11 п.18, #1411)
   */
  action?: { icon: IconKey; label: string; onPress: () => void; testID?: string };
}) {
  const ro = useReadOnly();
  const { c } = useTheme();
  const { wide } = useDevice();
  const f = FIELD[type];
  const multi = multiline ?? f.multiline ?? false;
  const h = wide ? component.field.h : component.field.phone;
  // a multi-line field grows with its text (the browser's textarea does not by itself)
  const [textH, setTextH] = useState(0);
  // one line empty: the text's own line height, the frame padded to the field's height (44 phone / 36 wide)
  const line = Math.round(font.size.input * font.lineHeight.body);
  const one = multi && rows === 1;
  const minH = one ? line : multi ? h * (rows ?? 2) : h;
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const len = useRef(value.length);
  len.current = value.length;
  // a field that opens in a sheet: on a phone focus once the sheet is up and select by hand (#691, ./fieldFocus)
  const plan = focusPlan(Platform.OS, { autoFocus, selectOnFocus, readOnly: ro });
  const selectAll = () => input.current?.setSelection?.(0, len.current);
  const shownError = error ?? field?.error;
  const tid = testID ?? field?.testID;
  useEffect(() => {
    if (!focusNow) return;
    input.current?.focus();
    // all of the text selected AT ONCE (a digit typed right after replaces it): by hand on a phone, `select()` on the web's field
    input.current?.setSelection?.(0, len.current);
    (input.current as unknown as { select?: () => void } | null)?.select?.();
  }, [focusNow]);
  useEffect(() => {
    if (plan.focusAfterMs === null) return;
    const id = setTimeout(() => input.current?.focus(), plan.focusAfterMs);
    return () => clearTimeout(id);
  }, [plan.focusAfterMs]);
  return (
    <View ref={field?.anchorRef} testID={tid} collapsable={false} style={{ gap: space[1] }}>
    <View
      style={{
        minHeight: h,
        borderRadius: radius.field,
        borderWidth: 1,
        borderColor: shownError ? c.status.bad.fill : c.bd,
        backgroundColor: c.in,
        flexDirection: "row",
        alignItems: multi ? "flex-start" : "center",
        paddingHorizontal: space[3],
        // the same frame as a one-line field of this height (e2e 343 compares them)
        paddingVertical: one ? Math.max(0, (h - line) / 2) : multi ? space[2] : 0,
        gap: space[2],
      }}
    >
      {icon ? <Icon name={icon} s={sizes.iconSm} color={c.mut} /> : null}
      {prefix ? <T tone="mut">{prefix}</T> : null}
      <TextInput
        ref={(n) => {
          input.current = n;
          field?.inputRef(n);
        }}
        value={value}
        editable={!ro}
        onFocus={plan.selectByHand || onFocus ? () => { onFocus?.(); if (plan.selectByHand) setTimeout(selectAll, 0); } : undefined}
        onBlur={field || onBlurText ? () => { field?.blur(value); onBlurText?.(); } : undefined}
        inputAccessoryViewID={accessoryID}
        aria-disabled={ro || undefined}
        onChangeText={(v) => {
          const nv = f.fmt ? f.fmt(v) : v;
          // text taken away: measure again from the smallest height (a textarea's scrollHeight never drops below its height)
          if (multi && nv.length < len.current) setTextH(0);
          field?.edit(nv);
          onChangeText(nv);
        }}
        placeholder={placeholder}
        placeholderTextColor={c.mut}
        multiline={multi}
        onContentSizeChange={multi && Platform.OS === "web" ? (e) => setTextH(Math.ceil(e.nativeEvent.contentSize.height)) : undefined}
        keyboardType={f.kb ?? "default"}
        inputMode={f.kb === "decimal-pad" ? "decimal" : f.kb === "number-pad" ? "numeric" : f.kb === "phone-pad" ? "tel" : f.kb === "email-address" ? "email" : f.kb === "url" ? "url" : type === "search" ? "search" : "text"}
        autoComplete={f.ac}
        textContentType={f.tc ?? "none"}
        autoCapitalize={f.cap}
        autoCorrect={f.correct ?? true}
        spellCheck={f.correct ?? true}
        secureTextEntry={f.secure}
        maxLength={f.max}
        returnKeyType={multi ? "default" : chain ? "next" : f.ret ?? (onSubmit ? "done" : "next")}
        onSubmitEditing={onSubmit}
        autoFocus={plan.autoFocus}
        selectTextOnFocus={selectOnFocus}
        submitBehavior={multi ? "newline" : chain ? "submit" : "blurAndSubmit"}
        accessibilityLabel={a11yLabel ?? label ?? placeholder}
        aria-invalid={shownError ? true : undefined}
        style={{
          flex: 1,
          minHeight: minH,
          // the browser's textarea does not grow by itself; a phone's multi-line field does (minHeight is enough there)
          height: multi && Platform.OS === "web" ? Math.max(minH, textH) : undefined,
          color: c.ink,
          fontFamily: font.families.regular,
          fontSize: font.size.input,
          lineHeight: one ? line : undefined,
          textAlignVertical: multi ? "top" : "center",
          fontVariant: type === "money" || type === "number" || type === "integer" || type === "percent" ? ["tabular-nums"] : undefined,
          outlineStyle: "none",
        } as object}
      />
      {suffix ? <T tone="mut">{suffix}</T> : null}
      {action ? (
        <Press
          onPress={action.onPress}
          disabled={ro}
          visibleHeight={sizes.hitMin}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          testID={action.testID}
          {...({ title: action.label } as object)}
          // the touch box is 44 × 44 even in a 34 field (it overhangs the frame), the icon sits `space[3]` from the frame's edge
          containerStyle={{ marginVertical: (Math.min(h, sizes.hitMin) - sizes.hitMin) / 2, marginRight: -space[3], alignSelf: multi ? "flex-start" : "center" }}
          style={{ width: sizes.hitMin, height: sizes.hitMin, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name={action.icon} s={sizes.iconMd} color={c.mut} />
        </Press>
      ) : null}
    </View>
    {shownError ? (
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }} accessibilityLiveRegion="polite" testID={tid ? `${tid}-error` : undefined}>
        <Icon name="alert" s={sizes.iconSm} color={c.status.bad.text} />
        <T v="caption" tone="bad">
          {shownError}
        </T>
      </View>
    ) : null}
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
  const ro = useReadOnly();
  const { c } = useTheme();
  const b = component.dockBtn;
  const btn = (icon: IconKey, delta: number, a11y: string) => (
    <Press
      onPress={() => onChange(Math.min(max, Math.max(min, value + delta)))}
      disabled={ro || (delta < 0 ? value <= min : value >= max)}
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
export { fitsSegment } from "./segmentFit";
import { fitsSegment } from "./segmentFit";

export function ChoiceChips<K extends string>({
  items,
  value,
  onChange,
  nowrap,
  label,
  testID,
}: {
  items: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
  /** one line (put inside a horizontal ScrollView) */
  nowrap?: boolean;
  /** a segment gives each option `<testID>-<key>`; a field — `<testID>` (the row), `<testID>-button`, `<testID>-<key>` (menu items) */
  testID?: string;
  /** the field's name: the row of a `SelectField` when the options do not fit one line */
  label?: string;
}) {
  // never a second line of chips (#1095): a few short options — a segment in one line, otherwise a field with a menu.
  // Screens move over one by one, each naming its field with `label` (test/chipsLabel.test.ts keeps the list of the
  // others from growing); without `label` — and in a horizontal scroll (`nowrap`) — the chips are as they were.
  if (nowrap || !label) return <ChipsRow items={items} value={value} onChange={onChange} nowrap={nowrap} />;
  if (fitsSegment(items.map((i) => i.label))) {
    const seg = <Segmented radio full label={label} testID={testID} items={items} value={value} onChange={onChange} />;
    // with a `label` the field names itself: a caption over the segment, the row's label in a field
    return label ? (
      <View style={{ gap: space[1] }}>
        <T v="caption" tone="mut" w="semibold">
          {label}
        </T>
        {seg}
      </View>
    ) : (
      seg
    );
  }
  return <SelectField label={label} testID={testID} value={value} items={items} onChange={onChange} />;
}

/** the chips of one line, inside a horizontal scroll (filters) */
function ChipsRow<K extends string>({ items, value, onChange, nowrap }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void; nowrap?: boolean }) {
  const ro = useReadOnly();
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
            disabled={ro}
            visibleHeight={h}
            accessibilityRole="radio"
            // web: a radio is read by aria-checked, not aria-selected (BOARD debt «Работы» №3)
            accessibilityState={{ selected: sel, checked: sel }}
            {...({ "aria-checked": sel } as object)}
            accessibilityLabel={it.label}
            style={{
              minHeight: h,
              paddingHorizontal: space[3],
              borderRadius: radius.pill,
              justifyContent: "center",
              // chosen: «Заливка» (DS «Выделение выбранного»); the unchosen keeps a hairline, no fill; yellow is the main action's alone (rule 2)
              ...(sel ? fillStyle(c) : { backgroundColor: "transparent" }),
              borderWidth: component.hairline,
              borderColor: sel ? "transparent" : c.bd,
            }}
          >
            <T v="button" w={sel ? "semibold" : undefined} style={{ color: sel ? c.ink : c.mut }}>
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
  const ro = useReadOnly();
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
            disabled={ro}
            visibleHeight={h}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: sel }}
            accessibilityLabel={it.label}
            style={{
              minHeight: h,
              paddingHorizontal: space[3],
              borderRadius: radius.pill,
              justifyContent: "center",
              ...(sel ? fillStyle(c) : { backgroundColor: "transparent" }),
              flexDirection: "row",
              alignItems: "center",
              gap: space[1],
              borderWidth: component.hairline,
              borderColor: sel ? "transparent" : c.bd,
            }}
          >
            {sel ? <Icon name="check" s={sizes.iconSm} color={c.ink} /> : null}
            <T v="button" w={sel ? "semibold" : undefined} style={{ color: sel ? c.ink : c.mut }}>
              {it.label}
            </T>
          </Press>
        );
      })}
    </View>
  );
}
