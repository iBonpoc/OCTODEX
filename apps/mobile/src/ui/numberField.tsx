import { useEffect, useId, useState } from "react";
import { InputAccessoryView, Keyboard, Platform, View } from "react-native";
import { component, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { TextField } from "./controls";
import { Press, T, Icon } from "./primitives";
import type { FieldBinding } from "./requiredForm";
import {
  formatBps,
  formatCents,
  finishText,
  formatWhole,
  needsResync,
  parseBps,
  parseCents,
  parseQuantity,
  parseWhole,
  type NumberKind,
  type Parsed,
} from "./numberInput";

/**
 * NumberField (DS А6.2): money · percent · qty · integer. The person types freely; the engine parses (rule 8).
 * «-100», «abc», «1e5», «12,50» — the error under the field, never a quiet zero. On leaving: the US format `1,234.50`.
 * The unit sign sits inside the field ($ before; % / ft / ea after). iOS: the bar «‹ ›  Готово» above the number keyboard;
 * Android: the keyboard's own «done»; web: Enter goes on to the next field (`onNext`).
 */
type Common = {
  label: string;
  /** the sign inside the field: «ft», «ea» for a quantity; money and percent have theirs */
  unit?: string;
  /** read aloud with the label: «Цена, долларов» */
  unitWord?: string;
  placeholder?: string;
  field?: FieldBinding;
  testID?: string;
  /** the bar's «‹» and «›» and Enter on the web: the neighbours in the form; none — the arrow is off */
  onPrev?: () => void;
  onNext?: () => void;
  autoFocus?: boolean;
  selectOnFocus?: boolean;
  /** the text is not a number now (the value did not move): a row that holds it must not close over it */
  onBad?: (bad: boolean) => void;
};
export type NumberFieldProps = Common &
  (
    | {
        kind: "money";
        /** none (undefined) = unknown, shown empty (a cost the person has not written) */
        cents: number | undefined;
        onChange: (cents: number) => void;
        /** the field may stand empty and then the value is none, not $0 (a cost); without it an empty field is $0 */
        onClear?: () => void;
      }
    | { kind: "percent"; bps: number; onChange: (bps: number) => void }
    | { kind: "qty"; qty: string; onChange: (qty: string) => void }
    | { kind: "integer"; value: number; onChange: (n: number) => void }
  );

type Spec = {
  value: number | string;
  parse: (t: string) => Parsed<number | string>;
  toText: (v: number | string) => string;
  empty: number | string | undefined;
  emit: (v: number | string) => void;
};

function specOf(p: NumberFieldProps): Spec {
  switch (p.kind) {
    case "money":
      return { value: p.cents as number, parse: parseCents, toText: (v) => (v === undefined ? "" : formatCents(v as number)), empty: p.onClear ? undefined : 0, emit: (v) => p.onChange(v as number) };
    case "percent":
      return { value: p.bps, parse: parseBps, toText: (v) => formatBps(v as number), empty: 0, emit: (v) => p.onChange(v as number) };
    case "qty":
      return { value: p.qty, parse: parseQuantity, toText: (v) => String(v), empty: undefined, emit: (v) => p.onChange(v as string) };
    case "integer":
      return { value: p.value, parse: parseWhole, toText: (v) => formatWhole(v as number), empty: 0, emit: (v) => p.onChange(v as number) };
  }
}

const ERROR_KEY = { money: "num.bad.money", percent: "num.bad.percent", qty: "num.bad.qty", integer: "num.bad.integer" } as const;
const SIGN: Record<NumberKind, { before?: string; after?: string }> = { money: { before: "$" }, percent: { after: "%" }, qty: {}, integer: {} };

export function NumberField(props: NumberFieldProps) {
  const { t } = useI18n();
  const spec = specOf(props);
  // the shown text follows an outer change (a catalog pick, undo), but not what the person is typing (see the effect)
  const [text, setText] = useState(() => spec.toText(spec.value));
  const parsed = spec.parse(text);
  useEffect(() => {
    if (needsResync(spec.parse(text), spec.value, spec.empty)) setText(spec.toText(spec.value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.value]);
  const accessoryID = `num-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // an empty quantity is an error too (a line without a quantity is no line): the screen keeps the last right value, so the
  // text must not stand empty while the row thinks it is 2.5 — the row cannot close over it (onBad)
  const needed = props.kind === "qty" && parsed.state === "empty";
  const bad = parsed.state === "bad" || needed;
  const onBad = props.onBad;
  useEffect(() => {
    onBad?.(bad);
    return () => onBad?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bad]);
  const sign = SIGN[props.kind];
  const unit = props.unit ?? sign.after;
  return (
    <View style={{ gap: space[1] }}>
      <T v="caption" tone="mut">
        {props.label}
      </T>
      <TextField
        type={props.kind === "money" ? "money" : props.kind === "percent" ? "percent" : props.kind === "integer" ? "integer" : "number"}
        value={text}
        onChangeText={(s) => {
          setText(s);
          const p = spec.parse(s);
          if (p.state === "ok") spec.emit(p.value);
          else if (p.state === "empty") {
            if (props.kind === "money" && props.onClear) props.onClear();
            else if (spec.empty !== undefined) spec.emit(spec.empty);
          }
        }}
        placeholder={props.placeholder ?? "0"}
        label={props.label}
        a11yLabel={props.unitWord ? `${props.label}, ${props.unitWord}` : props.label}
        prefix={sign.before}
        suffix={unit}
        error={needed ? t("num.need.qty") : bad ? t(ERROR_KEY[props.kind]) : undefined}
        field={props.field}
        testID={props.testID}
        autoFocus={props.autoFocus}
        selectOnFocus={props.selectOnFocus}
        accessoryID={Platform.OS === "ios" ? accessoryID : undefined}
        onSubmit={props.onNext ?? (() => Keyboard.dismiss())}
        onBlurText={() => {
          let p = spec.parse(text);
          if (p.state === "partial") {
            const done = finishText(text);
            p = spec.parse(done);
            if (p.state === "ok") spec.emit(p.value);
          }
          if (p.state === "ok") setText(spec.toText(p.value));
          else if (p.state === "partial") setText("");
        }}
      />
      {Platform.OS === "ios" ? <NumberBar id={accessoryID} onPrev={props.onPrev} onNext={props.onNext} /> : null}
    </View>
  );
}

/** the bar above the iOS number keyboard: «‹ ›» on the left, «Готово» on the right (DS А6.2) */
function NumberBar({ id, onPrev, onNext }: { id: string; onPrev?: () => void; onNext?: () => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const arrow = (name: "chevronLeft" | "chevronRight", on: (() => void) | undefined, label: string) => (
    <Press onPress={on} disabled={!on} accessibilityLabel={label} visibleHeight={component.field.phone}>
      <View style={{ paddingHorizontal: space[3], minHeight: component.field.phone, justifyContent: "center" }}>
        <Icon name={name} color={on ? c.ink : c.mut} />
      </View>
    </Press>
  );
  return (
    <InputAccessoryView nativeID={id}>
      <View
        testID={`${id}-bar`}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: c.bg, paddingHorizontal: space[2], borderTopWidth: component.hairline, borderTopColor: c.bd }}
      >
        <View style={{ flexDirection: "row" }}>
          {arrow("chevronLeft", onPrev, t("num.prev"))}
          {arrow("chevronRight", onNext, t("num.next"))}
        </View>
        <Press onPress={() => Keyboard.dismiss()} accessibilityLabel={t("num.done")} visibleHeight={component.field.phone}>
          <View style={{ paddingHorizontal: space[3], minHeight: component.field.phone, justifyContent: "center" }}>
            <T w="semibold">{t("num.done")}</T>
          </View>
        </Press>
      </View>
    </InputAccessoryView>
  );
}
