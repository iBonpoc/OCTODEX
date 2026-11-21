/**
 * «Графит» — пилот витрины (#2254): buttons, the phone field, list rows, the glass panel and the status word
 * (handoff §2–§3, §5 п.2, 4, 6, 7). Only three heights: 44 (field, check hit), 52 (buttons), 56 (rows).
 * Yellow fill only on the one main button of the screen (and «＋» in the nav).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";
import { graphite } from "@octo/design-tokens";
import { formatPhoneUS } from "@/ui/inputFormat";
import { Icon, type IconKey } from "@/ui/primitives";
import { useI18n } from "@/i18n";
import { GrLiquid, GrMatte } from "./Glass";
import { GrPress, GrText, useGr } from "./theme";

const S = graphite.size;
const R = graphite.radius;
const SP = graphite.space;

export type GrButtonKind = "primary" | "secondary" | "ghost" | "danger";

/** a spinner that waits `loadDelay` before it shows and stays `spinnerMin` once shown (R15 «время показа») */
export function useWaitShown(loading: boolean): boolean {
  const [shown, setShown] = useState(false);
  const since = useRef(0);
  const m = graphite.motion;
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    if (loading) {
      t = setTimeout(() => {
        since.current = Date.now();
        setShown(true);
      }, m.loadDelay);
    } else {
      t = setTimeout(
        () => setShown(false),
        Math.max(0, m.spinnerMin - (Date.now() - since.current)),
      );
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, [loading, m.loadDelay, m.spinnerMin]);
  return shown;
}

export function GrSpinner({ tone = "text", testID }: { tone?: "text" | "onAcc" | "onDan" | "onBadge" | "bad"; testID?: string }) {
  const { g } = useGr();
  return <ActivityIndicator testID={testID} color={g[tone]} />;
}

/**
 * The button of «Графит» (#2292). `variant` is the variant number of the showcase sheet: 1 — the package (yellow main, matte
 * second, filled danger), 2 — the quieter one (inverse-plate main, outline second, outline danger). Heights are the package's:
 * 52 (a text button 44). `loading`: the spinner after 300 ms, the press is ignored; `disabled`: dimmed, not pressable.
 */
export function GrButton({
  kind,
  label,
  onPress,
  testID,
  variant = 1,
  icon,
  loading,
  disabled,
}: {
  kind: GrButtonKind;
  label: string;
  onPress: () => void;
  testID?: string;
  variant?: 1 | 2;
  icon?: IconKey;
  loading?: boolean;
  disabled?: boolean;
}) {
  const { g } = useGr();
  const wait = useWaitShown(!!loading);
  const off = !!disabled || !!loading;
  const quiet = variant === 2;
  // variant 2 of the main button is the inverse plate (`badge`/`onBadge`: light on dark, dark on light), not a second yellow
  const tone: "onAcc" | "onBadge" | "onDan" | "text" | "bad" =
    kind === "primary"
      ? quiet ? "onBadge" : "onAcc"
      : kind === "danger"
        ? quiet ? "bad" : "onDan"
        : "text";
  const inner = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SP[2] }}>
      {/* a danger colour always has its icon (rule 2): the alert mark unless the button has its own */}
      {wait ? <GrSpinner testID={testID ? `${testID}-spinner` : undefined} tone={tone} /> : (icon ?? (kind === "danger" ? "alert" : null)) ? <Icon name={(icon ?? "alert") as IconKey} s={S.glyph} color={g[tone]} /> : null}
      <GrText v="body" w={kind === "primary" ? "medium" : "regular"} tone={tone} center maxScale={graphite.font.maxScaleButton} style={{ flexShrink: 1 }}>
        {label}
      </GrText>
    </View>
  );
  const box = {
    // a big system text grows the button (and wraps the label) instead of cutting it
    minHeight: kind === "ghost" ? S.control : S.button,
    paddingVertical: SP[2],
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: SP[4],
  };
  let body;
  if (kind === "ghost" && !quiet) {
    body = <View style={box}>{inner}</View>;
  } else if (kind === "ghost") {
    // variant 2 of the text button: a quiet plate (the chip's), so it is seen on the scene
    body = <View style={[box, { borderRadius: R.main, backgroundColor: g.chip, borderWidth: S.edge, borderColor: g.border }]}>{inner}</View>;
  } else if (kind === "secondary" && !quiet) {
    body = (
      // the edge `borderS`: on the light scene the matte plate alone does not stand out
      <GrMatte flat radius={R.main} style={[box, { borderColor: g.borderS }]}>
        {inner}
      </GrMatte>
    );
  } else {
    const fill =
      kind === "primary" ? (quiet ? g.badge : g.acc) : kind === "danger" ? (quiet ? undefined : g.danBg) : undefined;
    body = (
      <View
        style={[
          box,
          {
            borderRadius: R.main,
            backgroundColor: fill,
            borderWidth: fill ? 0 : S.edge,
            borderColor: kind === "danger" ? g.bad : g.fieldEdge,
          },
        ]}
      >
        {inner}
      </View>
    );
  }
  return (
    <GrPress
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: !!loading }}
      {...(loading ? ({ "aria-busy": true } as object) : null)}
      disabled={off}
      onPress={onPress}
      style={disabled ? { opacity: graphite.state.disabledDim } : undefined}
    >
      {body}
    </GrPress>
  );
}

/** the round icon button: 44, `glass` on the liquid glass (the header circle), `matte` flat (the quieter one) */
export function GrIconButton({
  icon,
  label,
  onPress,
  testID,
  variant = 1,
  active,
  disabled,
}: {
  icon: IconKey;
  label: string;
  onPress: () => void;
  testID?: string;
  variant?: 1 | 2;
  active?: boolean;
  disabled?: boolean;
}) {
  const { g } = useGr();
  const size = { width: S.control, height: S.control, alignItems: "center" as const, justifyContent: "center" as const };
  const glyph = <Icon name={icon} s={S.glyph} color={active && variant === 2 ? g.onSel : g.text} />;
  return (
    <GrPress
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      {...(active !== undefined ? ({ "aria-pressed": active } as object) : null)}
      disabled={disabled}
      onPress={onPress}
      style={disabled ? { opacity: graphite.state.disabledDim } : undefined}
    >
      {variant === 1 ? (
        <GrLiquid radius={R.pill} style={[size, { borderColor: g.borderS }]}>
          {/* in its own View: on the web an svg is painted under the glass layers */}
          <View>{glyph}</View>
        </GrLiquid>
      ) : (
        <View style={[size, { borderRadius: R.pill, backgroundColor: active ? g.sel : g.chip, borderWidth: S.edge, borderColor: g.border }]}>{glyph}</View>
      )}
    </GrPress>
  );
}

/** «＋» — create: variant 1 is the 52 yellow circle (the one yellow of its layer, like the button), 2 the inverse plate */
export function GrPlus({ label, onPress, testID, variant = 1 }: { label: string; onPress: () => void; testID?: string; variant?: 1 | 2 }) {
  const { g } = useGr();
  return (
    <GrPress testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      <View style={{ width: S.plus, height: S.plus, borderRadius: R.pill, backgroundColor: variant === 2 ? g.badge : g.acc, alignItems: "center", justifyContent: "center" }}>
        <Icon name="plus" s={S.glyph} color={variant === 2 ? g.onBadge : g.onAcc} />
      </View>
    </GrPress>
  );
}

/** phone digits only (a leading +1 / 1 dropped) */
export const phoneDigits = (s: string): string => {
  const d = s.replace(/\D/g, "");
  return (d.length === 11 && d.startsWith("1") ? d.slice(1) : d).slice(0, 10);
};

/** rest / focus / error; the error shows after leaving the field with 1–9 digits */
export function GrPhoneField({ testID }: { testID?: string }) {
  const { t } = useI18n();
  const { g, name } = useGr();
  const [v, setV] = useState("");
  const [focus, setFocus] = useState(false);
  const [left, setLeft] = useState(false);
  const n = phoneDigits(v).length;
  const err = left && !focus && n > 0 && n < 10;
  return (
    <View style={{ gap: SP[1] }}>
      <GrText v="caption" tone="text2">
        {t("ds.gr.phone")}
      </GrText>
      <View
        style={{
          height: S.control,
          borderRadius: R.control,
          borderWidth: focus ? S.focus : S.edge,
          borderColor: err ? g.bad : focus ? g.focus : g.fieldEdge,
          backgroundColor: g.fieldBg,
          justifyContent: "center",
          paddingHorizontal: SP[3],
        }}
      >
        <TextInput
          testID={testID}
          value={v}
          onChangeText={(s) => setV(formatPhoneUS(s))}
          onFocus={() => setFocus(true)}
          onBlur={() => {
            setFocus(false);
            setLeft(true);
          }}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          keyboardAppearance={name}
          placeholder={t("ds.gr.phonePh")}
          placeholderTextColor={g.text2}
          selectionColor={g.focus}
          accessibilityLabel={t("ds.gr.phone")}
          style={{
            fontFamily: graphite.font.family.regular,
            fontSize: graphite.font.size.sub,
            color: g.text,
            fontVariant: ["tabular-nums"],
            height: S.control,
          }}
        />
      </View>
      {err ? (
        <GrStatus
          tone="bad"
          label={t("ds.gr.phoneErr")}
          testID="gr-phone-err"
        />
      ) : null}
    </View>
  );
}

const STATUS_ICON: Record<"ok" | "info" | "warn" | "bad" | "neutral", IconKey> = {
  neutral: "note",
  ok: "check",
  info: "star",
  warn: "clock",
  bad: "alert",
};

/** a status is always an icon and a word, in the word's colour */
export function GrStatus({
  tone,
  label,
  testID,
}: {
  tone: "ok" | "info" | "warn" | "bad" | "neutral";
  label: string;
  testID?: string;
}) {
  const { g } = useGr();
  return (
    <View
      testID={testID}
      style={{ flexDirection: "row", alignItems: "center", gap: SP[1] }}
    >
      <Icon
        name={STATUS_ICON[tone]}
        s={graphite.font.size.caption}
        color={g[`${tone}Ic`]}
      />
      <GrText v="caption" tone={tone}>
        {label}
      </GrText>
    </View>
  );
}

/** a list row, 56: the 34 square icon, name, second line, the amount or time on the right; a 0.5 divider under it */
export function GrRow({
  icon,
  title,
  sub,
  right,
  last,
  testID,
  onPress,
}: {
  icon: IconKey;
  title: string;
  sub: string;
  right?: string;
  last?: boolean;
  testID?: string;
  onPress?: () => void;
}) {
  const { g } = useGr();
  return (
    <GrPress
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
    >
      <View
        style={{
          minHeight: S.row,
          flexDirection: "row",
          alignItems: "center",
          gap: SP[3],
          borderBottomWidth: last ? 0 : S.hairline,
          borderBottomColor: g.div,
        }}
      >
        <View
          style={{
            width: S.icon,
            height: S.icon,
            borderRadius: R.icon,
            backgroundColor: g.giBg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} s={S.glyph} color={g.text} />
        </View>
        <View style={{ flex: 1 }}>
          <GrText v="body" lines={1}>
            {title}
          </GrText>
          <GrText v="caption" tone="text2" lines={1}>
            {sub}
          </GrText>
        </View>
        {right ? (
          <GrText v="body" w="medium">
            {right}
          </GrText>
        ) : null}
        <Icon name="chevronRight" s={S.glyph} color={g.text3} />
      </View>
    </GrPress>
  );
}

/** «строка-задача» (handoff §3 п.16): a check on the left (24 seen, 44 hit) instead of the icon; «›» on the right only */
export function GrTaskRow({
  title,
  sub,
  testID,
  last,
}: {
  title: string;
  sub: string;
  testID?: string;
  last?: boolean;
}) {
  const { g } = useGr();
  const [done, setDone] = useState(false);
  return (
    <View
      style={{
        minHeight: S.row,
        flexDirection: "row",
        alignItems: "center",
        gap: SP[3],
        borderBottomWidth: last ? 0 : S.hairline,
        borderBottomColor: g.div,
      }}
    >
      <GrPress
        testID={`${testID}-check`}
        accessibilityRole="button"
        accessibilityState={{ selected: done }}
        {...({ "aria-pressed": done } as object)}
        accessibilityLabel={title}
        visible={S.check}
        onPress={() => setDone((d) => !d)}
      >
        <View
          style={{
            width: S.icon,
            height: S.icon,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: S.check,
              height: S.check,
              borderRadius: R.xs,
              borderWidth: S.focus,
              borderColor: done ? g.sel : g.fieldEdge,
              backgroundColor: done ? g.sel : undefined,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {done ? (
              <Icon name="check" s={graphite.font.size.micro} color={g.onSel} />
            ) : null}
          </View>
        </View>
      </GrPress>
      <View style={{ flex: 1 }}>
        <GrText v="body" tone={done ? "text2" : "text"} lines={1}>
          {title}
        </GrText>
        <GrText v="caption" tone="text2" lines={1}>
          {sub}
        </GrText>
      </View>
      <Icon name="chevronRight" s={S.glyph} color={g.text3} />
    </View>
  );
}

/** a glass panel with a heading and an optional counter on the right */
export function GrPanel({
  title,
  count,
  children,
  testID,
}: {
  title: string;
  count?: string;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <GrMatte
      testID={testID}
      style={{ paddingHorizontal: SP[4], paddingVertical: SP[3], gap: SP[2] }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <GrText v="title">{title}</GrText>
        {count ? (
          <GrText v="caption" tone="text2">
            {count}
          </GrText>
        ) : null}
      </View>
      {children}
    </GrMatte>
  );
}
