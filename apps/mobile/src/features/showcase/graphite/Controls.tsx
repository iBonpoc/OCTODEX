/**
 * «Графит» — пилот витрины (#2254): buttons, the phone field, list rows, the glass panel and the status word
 * (handoff §2–§3, §5 п.2, 4, 6, 7). Only three heights: 44 (field, check hit), 52 (buttons), 56 (rows).
 * Yellow fill only on the one main button of the screen (and «＋» in the nav).
 */
import { useState, type ReactNode } from "react";
import { TextInput, View } from "react-native";
import { graphite } from "@octo/design-tokens";
import { formatPhoneUS } from "@/ui/inputFormat";
import { Icon, type IconKey } from "@/ui/primitives";
import { useI18n } from "@/i18n";
import { GrMatte } from "./Glass";
import { GrPress, GrText, useGr } from "./theme";

const S = graphite.size;
const R = graphite.radius;
const SP = graphite.space;

export function GrButton({
  kind,
  label,
  onPress,
  testID,
}: {
  kind: "primary" | "secondary";
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { g } = useGr();
  const inner = (
    <GrText
      v="body"
      w={kind === "primary" ? "medium" : "regular"}
      tone={kind === "primary" ? "onAcc" : "text"}
      center
      lines={1}
    >
      {label}
    </GrText>
  );
  return (
    <GrPress
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
    >
      {kind === "primary" ? (
        <View
          style={{
            height: S.button,
            borderRadius: R.main,
            backgroundColor: g.acc,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: SP[4],
          }}
        >
          {inner}
        </View>
      ) : (
        <GrMatte
          flat
          radius={R.main}
          style={{
            height: S.button,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: SP[4],
          }}
        >
          {inner}
        </GrMatte>
      )}
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

const STATUS_ICON: Record<"ok" | "info" | "warn" | "bad", IconKey> = {
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
  tone: "ok" | "info" | "warn" | "bad";
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
