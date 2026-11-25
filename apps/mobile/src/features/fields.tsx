/** Number inputs on top of TextField: the user types freely, the value is parsed by the engine. */
import { useEffect, useId, useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import { space } from "@octo/design-tokens";
import { parseMoneyToCents, parsePctToBps, parsePctToPpm, parseQty, ppmToPctText } from "@octo/estimating-engine";
import { useI18n } from "@/i18n";
import { TextField } from "@/ui/controls";
import { NumberBar } from "@/ui/numberField";
import { T } from "@/ui/primitives";
import { useFieldColumn } from "@/ui/surfaces";

export function Labeled({ label, children, flex = 1 }: { label: string; children: ReactNode; flex?: number }) {
  // in a column of fields (`FieldGroup`) the field takes its own height; in a row it shares the width (#1411)
  const column = useFieldColumn();
  return (
    <View style={{ flex: column ? undefined : flex, gap: space[1] }}>
      <T v="caption" tone="mut">
        {label}
      </T>
      {children}
    </View>
  );
}

const centsToText = (c: number) => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));
const bpsToText = (b: number) => String(b / 100);

function useSynced<T>(value: T, toText: (v: T) => string, parse: (s: string) => T | null, onChange: (v: T) => void) {
  const [text, setText] = useState(() => toText(value));
  useEffect(() => {
    // external change (catalog pick, undo) → show it; keep what the user is typing when it parses to the same value
    if (parse(text) !== value) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return {
    text,
    /** show the saved value again (the person leaves a field whose text did not parse) */
    reset: () => setText(toText(value)),
    set: (s: string) => {
      setText(s);
      const v = parse(s);
      if (v !== null) onChange(v);
    },
  };
}

/** what a field in a totals row takes (DS §8.7а): the word read by the screen reader (the row's word is not tied to the field), its unit
 *  in the field («$» before, «%» after), the focus asked for when the person picks «%» or «$» (the text is selected — typed over) */
type InRow = {
  a11yLabel?: string;
  unit?: boolean;
  focusNow?: number;
  /** #2455: the field is typed in / left — the screen keeps the new total in sight while the keyboard hides its bar */
  onTyping?: (on: boolean) => void;
  /** #2455: «Итого $794.49» for the iOS keyboard's own bar (`totalWhileTyping` = "bar"): the word shows above the keys, live */
  barNote?: string;
};

/** the iOS keyboard's bar with the screen's total in the middle («Готово» on the right); none elsewhere (the screen's own note) */
function useTotalBar(note: string | undefined) {
  const id = `tot-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const on = Platform.OS === "ios" && !!note;
  return { accessoryID: on ? id : undefined, bar: on ? <NumberBar id={id} arrows={false} note={note} /> : null };
}

export function MoneyField({ cents, onChange, placeholder, big, label, testID, a11yLabel, unit, focusNow, onTyping, barNote }: { cents: number; onChange: (c: number) => void; placeholder?: string; /** the one sum of a sheet, large with «$» (#2217) */ big?: boolean; label?: string; testID?: string } & InRow) {
  const f = useSynced(cents, centsToText, (s) => (s.trim() === "" ? 0 : parseMoneyToCents(s)), onChange);
  const tb = useTotalBar(barNote);
  return (
    <>
      <TextField type="money" value={f.text} onChangeText={f.set} placeholder={placeholder ?? "0"} big={big} prefix={big || unit ? "$" : undefined} label={label} selectOnFocus={big || unit} testID={testID} a11yLabel={a11yLabel} focusNow={focusNow} onFocus={onTyping && (() => onTyping(true))} onBlurText={onTyping && (() => onTyping(false))} accessoryID={tb.accessoryID} />
      {tb.bar}
    </>
  );
}

export function PctField({ bps, onChange, placeholder, a11yLabel, unit, focusNow, onTyping, barNote }: { bps: number; onChange: (b: number) => void; placeholder?: string } & InRow) {
  const f = useSynced(bps, bpsToText, (s) => (s.trim() === "" ? 0 : parsePctToBps(s)), onChange);
  const tb = useTotalBar(barNote);
  return (
    <>
      <TextField type="percent" value={f.text} onChangeText={f.set} placeholder={placeholder ?? "0"} suffix={unit ? "%" : undefined} selectOnFocus={unit} a11yLabel={a11yLabel} focusNow={focusNow} onFocus={onTyping && (() => onTyping(true))} onBlurText={onTyping && (() => onTyping(false))} accessoryID={tb.accessoryID} />
      {tb.bar}
    </>
  );
}

/** #1219: a tax rate with up to four decimals (8.875 %, 10.2575 %) in ppm. For the estimate editor: the value is
 *  taxRatePpm(s.tax), onChange — setSettings({ tax: taxWithRatePpm(s.tax, p) }) (ratePpm and its basis points together).
 *  A text that is not a rate (letters, above 100 %, more than four decimals) does not change the rate: the field says what to
 *  write under itself, and on leaving shows the rate that is saved (never a number that is not). */
export function RatePctField({ ppm, onChange, placeholder, a11yLabel, unit, focusNow, onBad, onTyping, barNote }: { ppm: number; onChange: (p: number) => void; placeholder?: string; /** in a totals row: the hint goes under the row (the field is too narrow for it), not under the field */ onBad?: (bad: boolean) => void } & InRow) {
  const { t } = useI18n();
  const parse = (s: string) => (s.trim() === "" ? 0 : parsePctToPpm(s));
  const f = useSynced(ppm, ppmToPctText, parse, onChange);
  const bad = f.text.trim() !== "" && parse(f.text) === null;
  useEffect(() => onBad?.(bad), [bad, onBad]);
  const tb = useTotalBar(barNote);
  return (
    <>
      <TextField type="percent" value={f.text} onChangeText={f.set} placeholder={placeholder ?? "0"} error={bad && !onBad ? t("ue.taxRateHint") : undefined} onFocus={onTyping && (() => onTyping(true))} onBlurText={() => { f.reset(); onTyping?.(false); }} suffix={unit ? "%" : undefined} selectOnFocus={unit} a11yLabel={a11yLabel} focusNow={focusNow} accessoryID={tb.accessoryID} />
      {tb.bar}
    </>
  );
}

export function QtyField({ qty, onChange }: { qty: string; onChange: (q: string) => void }) {
  const f = useSynced(qty, (q) => q, (s) => parseQty(s), onChange);
  return <TextField type="number" value={f.text} onChangeText={f.set} placeholder="1" />;
}
