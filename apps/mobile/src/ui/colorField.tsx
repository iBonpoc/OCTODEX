import { SelectField } from "./selectField";
import type { PickerItem } from "./pickerSheet";

/** one colour of a palette: its name always beside its sample (rule 2, 3rd exception) */
export interface ColorChoice<K extends string> {
  key: K;
  label: string;
  /** the sample; none — «no colour» (a struck-through ring) */
  hex?: string;
  /** «As the other part», «Unpainted»: their own group first */
  top?: boolean;
}

/**
 * The one colour field (DS §9б.6, founder 23.11.2026: one colour field for every part of a module): the field shows the sample and the
 * name with «›»; the tap opens the list — the special ones first as their own group, then the palette, a sample and a name in each
 * row, a check at the chosen one. Samples of a colour are drawn only here (CLAUDE.md rule 2, 3rd exception; the guard
 * `selectRules.test.ts` keeps `{ swatch: … }` in this file).
 */
export function ColorField<K extends string>({
  label,
  value,
  colors,
  onChange,
  placeholder,
  error,
  labelAbove,
  testID,
}: {
  label: string;
  value: K | null | undefined;
  colors: ColorChoice<K>[];
  onChange: (k: K) => void;
  placeholder?: string;
  error?: string;
  labelAbove?: boolean;
  testID?: string;
}) {
  const items: PickerItem<K>[] = colors.map((x) => ({ key: x.key, label: x.label, top: x.top, leading: x.hex ? { swatch: x.hex } : { none: true } }));
  return <SelectField label={label} value={value} items={items} onChange={onChange} placeholder={placeholder} error={error} labelAbove={labelAbove} testID={testID} />;
}
