/**
 * The fraction of an inch by buttons (#1316, founder 13.11: «дробь — ряд кнопок под полем вместо ввода цифрами»): the main row —
 * eighths (0 ⅛ ¼ ⅜ ½ ⅝ ¾ ⅞), «1/16» opens the odd sixteenths (1/16 3/16 … 15/16) — fifteen buttons do not fit one phone row. A separate
 * part: if the founder does not like it, this file and its one place in AttrPanel go away in one PR («не понравится — кнопки убираем»).
 */
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useI18n } from "@/i18n";
import type { DictKey } from "@/i18n";
import { component, radius, space } from "@octo/design-tokens";
import { Button, ChoiceChips } from "@/ui/controls";
import { useTheme } from "@/theme/ThemeProvider";
import { fracLabel } from "../canvas/format";
import { EIGHTHS, ODD_SIXTEENTHS, eighthKey } from "./lengthEntry";

const NONE = "-";

export function FracPicker({ value, onChange, active, testID }: {
  /** the fraction in sixteenths, 0..15 */
  value: number;
  onChange: (e16: number) => void;
  /** the entry has come to the fraction: the row is framed (an ink frame, not a colour, rule 2) */
  active: boolean;
  testID: string;
}) {
  const { t } = useI18n();
  const { c } = useTheme();
  const [more, setMore] = useState(false);
  // an odd sixteenth is set (from the tape, or typed before): the second row is open, it has the selected one
  const open = more || value % 2 === 1;
  const eighth = eighthKey(value);
  return (
    <View
      testID={testID}
      style={{ gap: space[2], padding: space[2], borderRadius: radius.field, borderWidth: active ? component.selectedBorder : 1, borderColor: active ? c.ink : "transparent" }}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
        <View style={{ flexDirection: "row", gap: space[2], alignItems: "center" }}>
          <ChoiceChips
            nowrap
            items={EIGHTHS.map((i) => ({ key: String(i), label: i === 0 ? "0" : fracLabel(i * 2) }))}
            value={eighth ?? NONE}
            onChange={(key) => onChange(Number(key) * 2)}
          />
          <Button label={t("mod.gutters.attr.fracMore" as DictKey)} size="sm" variant={open ? "primary" : "secondary"} onPress={() => setMore(!open)} />
        </View>
      </ScrollView>
      {open ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" testID={`${testID}-sixteenths`}>
          <ChoiceChips
            nowrap
            items={ODD_SIXTEENTHS.map((i) => ({ key: String(i), label: fracLabel(i) }))}
            value={eighth === null ? String(value) : NONE}
            onChange={(key) => onChange(Number(key))}
          />
        </ScrollView>
      ) : null}
    </View>
  );
}
