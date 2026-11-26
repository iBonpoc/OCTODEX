import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFieldScroll, type FieldBinding } from "./requiredForm";
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
import { component, spaceHalf, font, motion, radius, space, statusGlyph, type StatusName, size as sizes } from "@octo/design-tokens";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { fillStyle } from "./fill";
import { Icon, Press, T, type IconKey } from "./primitives";
import { SelectField } from "./selectField";
import { FIELD, type FieldType } from "./fieldTypes";
import { focusPlan, lateSelectOk } from "./fieldFocus";
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
/** `outline` (review 27.11, #2935 п.3): no fill, a `hairline` edge in `dash` (≥ 3:1 on the bar's cell `surf2` and on the screen, contrast.test.ts),
 *  `ink` words — the second step beside the yellow one where the ground is itself `surf2` (the estimate bar's «Готово» by «Отправить»):
 *  a `secondary` there is the bar's own colour and reads as a bare word */
type BtnVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
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
  selected,
  testID,
  grow,
}: {
  /** takes the rest of its row (`flex: 1` of the touch target): the main one of a two-line editor bar (round 2 М1) */
  grow?: boolean;
  label: string;
  onPress?: () => void;
  variant?: BtnVariant;
  /** a quick choice that is the chosen one (DateField's «Завтра»): read as pressed / selected */
  selected?: boolean;
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
  // visual v2 («Кнопки»): a capsule 40, 15/700, the icon 18; the pair — the filled yellow + the dark cell `surf2` with yellow words
  // (`accText`, ≥ 4.5:1 in both themes, contrast.test.ts) + a round icon 40; no frames
  const bg =
    variant === "primary" ? c.acc : variant === "secondary" ? c.surf2 : variant === "danger" ? c.status.bad.fill : "transparent";
  const fg = variant === "primary" ? c.onAcc : variant === "secondary" ? c.accText : variant === "danger" ? c.status.bad.on : c.ink;
  return (
    <Press
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      visibleHeight={h}
      containerStyle={grow ? { flex: 1 } : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      {...(selected !== undefined ? ({ accessibilityState: { selected, disabled: !!disabled }, "aria-pressed": selected } as object) : null)}
      style={[
        {
          minHeight: h,
          paddingHorizontal: space[4],
          borderRadius: radius.pill,
          ...(bar ? { paddingVertical: space[1] } : null),
          backgroundColor: bg,
          // v2: no frame on any button — the words identify it (WCAG 1.4.11 asks no edge of a control told by its label); the one
          // exception is `outline` (no fill of its own on a `surf2` ground — its edge is what shows it, Д-кнопка-7);
          // #2363 F36: the yellow fill looks the same in both themes, the dark `accEdge` line in the light one is gone
          borderWidth: variant === "outline" ? component.hairline : 0,
          borderColor: variant === "outline" ? c.dash : "transparent",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: space[2],
          alignSelf: full || grow ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      {/* the icon keeps its size: in a narrow button (the left one of a pinned bar) the words wrap, the icon never shrinks to a dot (#1474) */}
      {icon ? (
        <View style={{ flexShrink: 0 }}>
          <Icon name={icon} s={component.button.glyph} color={fg} />
        </View>
      ) : null}
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
  bare,
  size,
  testID,
}: {
  icon: IconKey;
  onPress?: () => void;
  label: string;
  active?: boolean;
  /** «bad»: a dangerous small action (the «⊖» of a repeated value, DS §9 А14а) — the icon `status.bad.text` */
  tone?: "acc" | "plain" | "bad";
  /** no plate: the icon alone, visible `valueIcon` 22, the box 44 × 44 (iOS Contacts' «⊖», DS §9 А14а) */
  bare?: boolean;
  /** visual v2 «Круглые кнопки»: `card` — 32 inside a card (the timer's «⌃», a row's call); default 40 (the zone is 44 either way) */
  size?: "card";
  testID?: string;
}) {
  const { c } = useTheme();
  const s = size === "card" ? component.roundButton.card : component.roundButton.header;
  if (bare)
    return (
      <Press
        testID={testID}
        onPress={onPress}
        visibleHeight={s}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ width: sizes.hitMin, minHeight: sizes.hitMin, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name={icon} s={component.valueIcon} color={tone === "bad" ? c.status.bad.text : c.ink} />
      </Press>
    );
  // yellow is the main action only (tone «acc»); a switched-on button (a pinned note) is «Заливка», like every chosen thing (DS §9,
  // «Выделение выбранного», #1416)
  const filled = tone === "acc";
  return (
    <Press
      testID={testID}
      onPress={onPress}
      visibleHeight={s}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active !== undefined ? { selected: active } : undefined}
      style={{
        width: s,
        height: s,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
        // v2: a round button is a cell on its card, no frame
        backgroundColor: filled ? c.acc : c.surf2,
        borderWidth: 0,
        // a toggle: off — no plate, `mut` icon; on — «Заливка» (the same as a chosen chip or tab)
        ...(active === false ? { backgroundColor: "transparent", borderWidth: 0 } : null),
        ...(active && !filled ? fillStyle(c) : null),
      }}
    >
      <Icon name={icon} s={size === "card" ? component.button.glyph : sizes.iconMd} color={filled ? c.onAcc : tone === "bad" ? c.status.bad.text : active === false ? c.mut : c.ink} />
    </Press>
  );
}

/* ---------- StatusChip (DS: color = status, always icon + word) ---------- */
export function StatusChip({ status, label, soft, draft }: { status: StatusName; label: string; soft?: boolean; draft?: boolean }) {
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
      <Icon name={statusGlyph(status, draft)} s={sizes.iconSm} color={fg} />
      <T v="caption" w="semibold" style={{ color: fg, flexShrink: 1 }}>
        {label}
      </T>
    </View>
  );
}

/* ---------- Toggle (spring knob) ---------- */
/**
 * The switch (DS §9 А5): 42 × 24, knob 18 (`component.switch`), on — the yellow track and the dark knob `onAcc` (≈ 18:1; white on
 * yellow ≈ 1.08:1 — never). Only inside `ToggleRow` (spec 56 wave 1а, guard choiceControls.test.ts): the row is the one element
 * a finger and the screen reader meet; there the switch is `part` — drawn, not pressed. The old places alone keep the pressable one.
 */
export function Toggle({ on, onChange, label, disabled, part }: { on: boolean; onChange?: (v: boolean) => void; label: string; /** the switch is there but does not answer (a client without tax): pale, skipped by Tab, read as «disabled» */ disabled?: boolean; /** drawn inside `ToggleRow`: the row presses and speaks, the switch is a picture */ part?: boolean }) {
  const { c } = useTheme();
  const ro = useReadOnly();
  const reduce = useReducedMotion();
  const { w, h, knob } = component.switch;
  // inside the 1-px edge: (24 − 18) / 2 − 1 = 2 on each side; the knob travels the rest of the width
  const pad = (h - knob) / 2 - 1;
  const travel = w - knob - pad * 2 - 2;
  const x = useSharedValue(on ? travel : 0);
  useEffect(() => {
    const to = on ? travel : 0;
    x.value = reduce ? to : withSpring(to, motion.spring);
  }, [on, reduce, travel, x]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const track: ViewStyle = {
    width: w,
    height: h,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.bd,
    backgroundColor: on ? c.acc : c.track,
    padding: pad,
    justifyContent: "center",
  };
  const knobView = <Animated.View style={[{ width: knob, height: knob, borderRadius: knob / 2, backgroundColor: on ? c.onAcc : c.ink }, a]} />;
  if (part)
    return (
      <View testID="toggle-part" pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={track}>
        {knobView}
      </View>
    );
  return (
    <Press
      onPress={() => onChange?.(!on)}
      disabled={ro || disabled}
      visibleHeight={h}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: ro || !!disabled }}
      // web: a switch is read by aria-checked (as the radio below); without it the state is silent there (P4c)
      {...({ "aria-checked": on, "aria-disabled": ro || !!disabled || undefined } as object)}
      accessibilityLabel={label}
      style={[track, { opacity: disabled ? component.dimOpacity : 1 }]}
    >
      {knobView}
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
  accent,
  onCard,
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
  /** visual v2: the chosen segment is the screen's ONE yellow fill (the Plan's «День»); without it the chosen is the neutral cell
   *  `surf3` — a screen has one yellow fill (oneAccent.test.ts counts it) */
  accent?: boolean;
  /** inside a card (a totals row, DS §8.7а): the track is `track` (the card's `surf` would hide it) and no segment is narrower than
   *  `size.hitMin` (a one-sign «%» / «$» next to «Выкл.» — a miss must not switch a value off) */
  onCard?: boolean;
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
  // on a card's `track` the neutral chosen is the card's own `surf` framed by `bdField` (≥ 3:1, WCAG 1.4.11) — `surf3` on `track`
  // read about 1:1 in the dark (design review of #2454)
  const chosenBg = accent ? c.acc : onCard ? c.surf : c.surf3;
  // visual v2: a segment across the width shares it equally (a form's radio keeps its labels' widths, they give way instead)
  const same = equal || (full && !scroll && !radio);
  const chosenFg = accent ? c.onAcc : c.ink;
  const bar = (
    <View
      accessibilityRole={radio ? "radiogroup" : "tablist"}
      accessibilityLabel={label}
      style={{
        minHeight: h,
        padding: pad,
        borderRadius: radius.pill,
        // visual v2 «Сегмент»: the track is a card (`surf` + the top highlight), 3 inside
        backgroundColor: onCard ? c.track : c.surf,
        borderTopWidth: onCard ? 0 : component.hairline,
        borderTopColor: c.hl,
        flexDirection: "row",
        alignSelf: full ? "stretch" : "flex-start",
      }}
    >
      {ready ? (
        <Animated.View
          // the chosen: the yellow with `accent` (the screen's one fill), else the chosen cell `surf3`
          style={[{ position: "absolute", top: pad, bottom: pad, borderRadius: radius.pill, backgroundColor: chosenBg, ...(onCard && !accent ? { borderWidth: component.hairline, borderColor: c.bdField } : null) }, pill]}
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
            containerStyle={same ? { flex: 1 } : onCard ? { minWidth: sizes.hitMin } : undefined}
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
              ...(same || onCard ? { alignItems: "center" } : null),
              // a choice in a form never grows past its card: the labels give way, they do not push the segment out (a totals row's
              // three short labels never need it — shrunk, the track ended before «$», CRM review of #2454)
              ...(radio && !onCard ? { flexShrink: 1 } : null),
              borderRadius: radius.pill,
              backgroundColor: !ready && sel ? chosenBg : "transparent",
            }}
          >
            <T v="caption" w="semibold" style={{ color: sel ? chosenFg : c.mut }} numberOfLines={1}>
              {it.label}
            </T>
          </Press>
        );
      })}
    </View>
  );
  // scroll: a fixed capsule the width of the screen; the tabs slide inside it, its rounded ends never get cut
  return scroll ? (
    <View style={{ alignSelf: "stretch", borderRadius: radius.pill, overflow: "hidden", backgroundColor: c.surf }}>
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

/* ---------- ProgressBar: progress in words and a number, never a bar (founder 21.11: «полосу прогресса убрать вообще») ---------- */
export function progressText(value: number, max: number, label?: string): string {
  const pct = max ? Math.round(Math.min(100, (value / max) * 100)) : 0;
  // #2363 F38: nothing done yet — no «· 0 %» (the caller says «4 пункта»); the number and «%» never part (U+202F narrow no-break
  // space), «·» stays with its neighbours (U+00A0)
  if (value === 0 && label) return label;
  return `${label ?? `${value} / ${max}`}\u00A0· ${pct}\u202F%`;
}
/** visual v2 «Прогресс»: only words and a number — «3 из 5 · 62 %» 15/700 on the right, what it is of («Работа», `caption`) 12/600 `mut` on the left */
export function ProgressBar({ value, max, label, caption }: { value: number; max: number; label?: string; caption?: string }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={caption} accessibilityValue={{ min: 0, max, now: value }} style={{ flexDirection: "row", alignItems: "baseline", justifyContent: caption ? "space-between" : "flex-start", gap: space[3] }}>
      {caption ? (
        <T v="micro" tone="mut" numberOfLines={1} style={{ flexShrink: 1 }}>
          {caption}
        </T>
      ) : null}
      <T v="body" w="bold" numberOfLines={1}>
        {progressText(value, max, label)}
      </T>
    </View>
  );
}

/* ---------- Stepper (visit steps): a line of words, done ones with a check — no bars ---------- */
export function Steps({ labels, current }: { labels: string[]; current: number }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[1] }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: labels.length, now: current }}>
      {labels.map((l, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: spaceHalf.hair }}>
            {i > 0 ? <Icon name="chevronRight" s={sizes.iconXs} color={c.mut} /> : null}
            {done ? <Icon name="check" s={sizes.iconXs} color={c.status.ok.text} /> : null}
            <T v="caption" tone={now ? "ink" : "mut"} w={now ? "semibold" : "medium"} numberOfLines={1}>
              {l}
            </T>
          </View>
        );
      })}
    </View>
  );
}


/* ---------- TextField (phone 44, wide 34) ---------- */

/**
 * an icon inside a field on the right (DS §11 п.18): a helper («Вставить», «Очистить») or, in a composer, the field's own
 * «Отправить» (`strong` — `ink`, the rest `mut`; `disabled` — nothing typed yet) and a menu button (`menu`: «Кто видит»)
 */
export interface FieldAction {
  icon: IconKey;
  label: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  strong?: boolean;
  menu?: boolean;
}

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
  big,
  plate,
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
  action?: FieldAction | FieldAction[];
  /** visual v2 «Шторка» (the sum of «Принять оплату», #2217): the one value of a sheet typed large — 22/700 tabular, the frame as tall
   *  as a pinned button (`button.hit` 44 on every width) */
  big?: boolean;
  /** visual v2 №5 «Смета, редактор» (образец №2 «поле-плашка вместо рамки»): the field is a plate on `surf` with the top highlight,
   *  no frame (an error still draws the `status.bad` frame), its text 15/600 */
  plate?: boolean;
}) {
  const ro = useReadOnly();
  const { c } = useTheme();
  const { wide } = useDevice();
  const f = FIELD[type];
  const multi = multiline ?? f.multiline ?? false;
  const h = big ? component.button.hit : wide ? component.field.h : component.field.phone;
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
  // #2469: a key typed since the field took the focus — a late select (below) never takes what was typed
  const typed = useRef(false);
  const isFocused = () => !!input.current?.isFocused?.();
  const selectNow = () => {
    selectAll();
    (input.current as unknown as { select?: () => void } | null)?.select?.();
  };
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
  useFieldScroll(field);
  return (
    <View ref={field?.anchorRef} testID={tid} collapsable={false} style={{ gap: space[1] }}>
    <View
      style={{
        minHeight: h,
        borderRadius: radius.field,
        borderWidth: 1,
        borderColor: shownError ? c.status.bad.fill : plate ? "transparent" : c.bdField,
        borderTopColor: shownError ? c.status.bad.fill : plate ? c.hl : c.bdField,
        backgroundColor: plate ? c.surf : c.in,
        flexDirection: "row",
        alignItems: multi ? "flex-start" : "center",
        paddingHorizontal: space[3],
        // the same frame as a one-line field of this height (e2e 343 compares them)
        paddingVertical: one ? Math.max(0, (h - line) / 2) : multi ? space[2] : 0,
        gap: space[2],
      }}
    >
      {icon ? <Icon name={icon} s={sizes.iconSm} color={c.mut} /> : null}
      {prefix ? <T v={big ? "title" : undefined} tone="mut">{prefix}</T> : null}
      <TextInput
        ref={(n) => {
          input.current = n;
          field?.inputRef(n);
        }}
        value={value}
        editable={!ro}
        onFocus={selectOnFocus || onFocus ? () => {
          onFocus?.();
          if (!selectOnFocus || ro) return;
          // all selected AT the focus (a digit typed at once replaces it), again a moment later (Safari's click, iOS) — but only while
          // nothing has been typed since (#2469: a late select took the first digit on a slow device, «150» → «50»)
          typed.current = false;
          selectNow();
          // the late one: the web (Safari's click puts the caret back) and a phone that selects by hand (iOS does not select a number)
          if (Platform.OS !== "web" && !plan.selectByHand) return;
          setTimeout(() => {
            if (lateSelectOk(typed.current, isFocused())) selectNow();
          }, 0);
        } : undefined}
        onBlur={field || onBlurText ? () => { field?.blur(value); onBlurText?.(); } : undefined}
        inputAccessoryViewID={accessoryID}
        aria-disabled={ro || undefined}
        // a key counts as typed even when it leaves the same text («1» over «1»: React sends no change then — code review of #2469)
        onKeyPress={() => {
          typed.current = true;
        }}
        onChangeText={(v) => {
          typed.current = true;
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
        // the phone's own select-on-focus (no round trip to the app); not the web's: it selects only a moment later, and then over a
        // digit already typed (#2469)
        selectTextOnFocus={Platform.OS !== "web" && selectOnFocus}
        submitBehavior={multi ? "newline" : chain ? "submit" : "blurAndSubmit"}
        accessibilityLabel={a11yLabel ?? label ?? placeholder}
        aria-invalid={shownError ? true : undefined}
        style={{
          flex: 1,
          // the browser's <input> keeps its own width (~20 characters) and pushed the unit out of a narrow frame (#1990);
          // a phone's TextInput already shrinks — 0 changes nothing there
          minWidth: 0,
          minHeight: minH,
          // the browser's textarea does not grow by itself; a phone's multi-line field does (minHeight is enough there)
          height: multi && Platform.OS === "web" ? Math.max(minH, textH) : undefined,
          color: c.ink,
          fontFamily: big ? font.families.bold : plate ? font.families.semibold : font.families.regular,
          fontSize: big ? font.size.title : font.size.input,
          lineHeight: one ? line : undefined,
          textAlignVertical: multi ? "top" : "center",
          fontVariant: type === "money" || type === "number" || type === "integer" || type === "percent" ? ["tabular-nums"] : undefined,
          outlineStyle: "none",
        } as object}
      />
      {suffix ? <T tone="mut">{suffix}</T> : null}
      {(action ? (Array.isArray(action) ? action : [action]) : []).map((a, i, all) => (
        <Press
          key={a.testID ?? a.label}
          onPress={a.onPress}
          disabled={ro || a.disabled}
          visibleHeight={sizes.hitMin}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          accessibilityState={a.disabled ? { disabled: true } : undefined}
          testID={a.testID}
          {...({ title: a.label, ...(a.menu ? { "aria-haspopup": "menu" } : null) } as object)}
          // the touch box is 44 × 44 even in a 34 field (it overhangs the frame), the icon sits `space[3]` from the frame's edge;
          // two icons (a composer: who sees it · send) touch each other's boxes, no gap between them
          containerStyle={{
            marginVertical: (Math.min(h, sizes.hitMin) - sizes.hitMin) / 2,
            marginRight: i === all.length - 1 ? -space[3] : 0,
            marginLeft: i > 0 ? -space[2] : 0,
            alignSelf: multi ? "flex-start" : "center",
          }}
          style={{ width: sizes.hitMin, height: sizes.hitMin, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name={a.icon} s={sizes.iconMd} color={a.disabled ? c.bd : a.strong ? c.ink : c.mut} />
        </Press>
      ))}
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
  hideLabel,
  compact,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  label: string;
  unit?: string;
  /** a row names the count by itself (a part's count row «Elbow A · 75° ⌄ · − n +», DS §9б.2): the word is not drawn here, but still read aloud
   *  («Колено A +1») */
  hideLabel?: boolean;
  /** a narrower number and gap: the stepper shares a row with a field (a part's count row, DS §9б.2) */
  compact?: boolean;
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
    <View style={{ flexDirection: "row", alignItems: "center", gap: compact ? space[2] : space[3], minHeight: sizes.hitMin }} accessibilityLabel={label} accessibilityValue={{ now: value }}>
      {hideLabel ? null : (
        <T v="body" style={{ flex: 1 }}>
          {label}
        </T>
      )}
      {btn("minus", -step, `${label} −${step}`)}
      <T v="heading" tabular style={{ minWidth: compact ? component.stepperValueCompactW : component.stepperValueW, textAlign: "center" }}>
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
  layout = "wrap",
}: {
  items: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
  /** one line (put inside a horizontal ScrollView) */
  nowrap?: boolean;
  /** «strip» (BUILD-SPEC §1, the chips of a list): one row of chips that scrolls sideways — its own horizontal ScrollView,
   *  never a segment or a field; «wrap» (default) — as before */
  layout?: "wrap" | "strip";
  /** a segment gives each option `<testID>-<key>`; a field — `<testID>` (the row), `<testID>-button`, `<testID>-<key>` (menu items) */
  testID?: string;
  /** the field's name: the row of a `SelectField` when the options do not fit one line */
  label?: string;
}) {
  // never a second line of chips (#1095): a few short options — a segment in one line, otherwise a field with a menu.
  // Screens move over one by one, each naming its field with `label` (test/chipsLabel.test.ts keeps the list of the
  // others from growing); without `label` — and in a horizontal scroll (`nowrap`) — the chips are as they were.
  if (layout === "strip") return <ChipStrip testID={testID}><ChipsRow items={items} value={value} onChange={onChange} nowrap /></ChipStrip>;
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

/** one row of chips that scrolls sideways (`layout="strip"`): no scroll bar, the row keeps its height */
function ChipStrip({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" testID={testID} style={{ flexGrow: 0 }} contentContainerStyle={{ alignItems: "center" }}>
      {children}
    </ScrollView>
  );
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
  layout = "wrap",
  testID,
}: {
  items: { key: K; label: string }[];
  value: K[];
  onChange: (v: K[]) => void;
  /** «strip»: one row that scrolls sideways (as `ChoiceChips`); «wrap» (default) — as before */
  layout?: "wrap" | "strip";
  testID?: string;
}) {
  const ro = useReadOnly();
  const { c } = useTheme();
  const h = component.button.sm;
  const strip = layout === "strip";
  const row = (
    <View style={{ flexDirection: "row", flexWrap: strip ? "nowrap" : "wrap", gap: space[2] }} testID={strip ? undefined : testID}>
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
  return strip ? <ChipStrip testID={testID}>{row}</ChipStrip> : row;
}
