/** Number inputs on top of TextField: the user types freely, the value is parsed by the engine. */
import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { parseMoneyToCents, parsePctToBps, parsePctToPpm, parseQty, ppmToPctText } from "@octo/estimating-engine";
import { useI18n } from "@/i18n";
import { TextField } from "@/ui/controls";
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
type InRow = { a11yLabel?: string; unit?: boolean; focusNow?: number };

export function MoneyField({ cents, onChange, placeholder, big, label, testID, a11yLabel, unit, focusNow }: { cents: number; onChange: (c: number) => void; placeholder?: string; /** the one sum of a sheet, large with «$» (#2217) */ big?: boolean; label?: string; testID?: string } & InRow) {
  const f = useSynced(cents, centsToText, (s) => (s.trim() === "" ? 0 : parseMoneyToCents(s)), onChange);
  return <TextField type="money" value={f.text} onChangeText={f.set} placeholder={placeholder ?? "0"} big={big} prefix={big || unit ? "$" : undefined} label={label} selectOnFocus={big || unit} testID={testID} a11yLabel={a11yLabel} focusNow={focusNow} />;
}

export function PctField({ bps, onChange, placeholder, a11yLabel, unit, focusNow }: { bps: number; onChange: (b: number) => void; placeholder?: string } & InRow) {
  const f = useSynced(bps, bpsToText, (s) => (s.trim() === "" ? 0 : parsePctToBps(s)), onChange);
  return <TextField type="percent" value={f.text} onChangeText={f.set} placeholder={placeholder ?? "0"} suffix={unit ? "%" : undefined} selectOnFocus={unit} a11yLabel={a11yLabel} focusNow={focusNow} />;
}

/** #1219: a tax rate with up to four decimals (8.875 %, 10.2575 %) in ppm. For the estimate editor: the value is
 *  taxRatePpm(s.tax), onChange — setSettings({ tax: taxWithRatePpm(s.tax, p) }) (ratePpm and its basis points together).
 *  A text that is not a rate (letters, above 100 %, more than four decimals) does not change the rate: the field says what to
 *  write under itself, and on leaving shows the rate that is saved (never a number that is not). */
export function RatePctField({ ppm, onChange, placeholder, a11yLabel, unit, focusNow, onBad }: { ppm: number; onChange: (p: number) => void; placeholder?: string; /** in a totals row: the hint goes under the row (the field is too narrow for it), not under the field */ onBad?: (bad: boolean) => void } & InRow) {
  const { t } = useI18n();
  const parse = (s: string) => (s.trim() === "" ? 0 : parsePctToPpm(s));
  const f = useSynced(ppm, ppmToPctText, parse, onChange);
  const bad = f.text.trim() !== "" && parse(f.text) === null;
  useEffect(() => onBad?.(bad), [bad, onBad]);
  return <TextField type="percent" value={f.text} onChangeText={f.set} placeholder={placeholder ?? "0"} error={bad && !onBad ? t("ue.taxRateHint") : undefined} onBlurText={f.reset} suffix={unit ? "%" : undefined} selectOnFocus={unit} a11yLabel={a11yLabel} focusNow={focusNow} />;
}

export function QtyField({ qty, onChange }: { qty: string; onChange: (q: string) => void }) {
  const f = useSynced(qty, (q) => q, (s) => parseQty(s), onChange);
  return <TextField type="number" value={f.text} onChangeText={f.set} placeholder="1" />;
}
