/**
 * The fraction of an inch by buttons (#1316, founder 13.11: «дробь — ряд кнопок под полем вместо ввода цифрами»): the main row —
 * eighths (0 ⅛ ¼ ⅜ ½ ⅝ ¾ ⅞), «1/16» opens the odd sixteenths (1/16 3/16 … 15/16) — fifteen buttons do not fit one phone row. A separate
 * part: if the founder does not like it, this file and its one place in AttrPanel go away in one PR («не понравится — кнопки убираем»);
 * its rows' constants live here for that.
 */
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useI18n } from "@/i18n";
import type { DictKey } from "@/i18n";
import { component, radius, space } from "@octo/design-tokens";
import { ChoiceChips } from "@/ui/controls";
import { Press, T } from "@/ui/primitives";
import { useTheme } from "@/theme/ThemeProvider";
import { fracLabel } from "../canvas/format";

/** the main row: eighths, 0 … 7 of 8 (a fraction in sixteenths = 2 × this) */
export const EIGHTHS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
/** the second row, behind «1/16»: the odd sixteenths */
export const ODD_SIXTEENTHS = [1, 3, 5, 7, 9, 11, 13, 15] as const;
/** a fraction in sixteenths (0..15) → the key of its button in the eighths row, or null when it is a sixteenth (odd) */
export const eighthKey = (e16: number): string | null => (e16 % 2 === 0 ? String(e16 / 2) : null);

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
  // the second row: open by the user's tap, and by itself when an odd sixteenth comes in (from the tape) — the tap closes it again
  const [more, setMore] = useState(value % 2 === 1);
  useEffect(() => {
    if (value % 2 === 1) setMore(true);
  }, [value]);
  const eighth = eighthKey(value);
  return (
    // the frame is always as thick (transparent when the entry is not here): the rows do not shift
    <View
      testID={testID}
      style={{ gap: space[2], padding: 0, borderRadius: radius.field, borderWidth: component.selectedBorder, borderColor: active ? c.ink : "transparent" }}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
        <View style={{ flexDirection: "row", gap: space[2], alignItems: "center" }}>
          <ChoiceChips
            nowrap
            items={EIGHTHS.map((i) => ({ key: String(i), label: i === 0 ? "0" : fracLabel(i * 2) }))}
            value={eighth ?? NONE}
            onChange={(key) => onChange(Number(key) * 2)}
          />
          {/* «1/16»: a chip like the others (the ink frame when open — never the accent, that is «Применить»'s), read as «Шестнадцатые» */}
          <Press
            testID={`${testID}-more`}
            onPress={() => setMore(!more)}
            visibleHeight={component.button.sm}
            accessibilityRole="button"
            accessibilityLabel={t("mod.gutters.attr.fracMoreA11y" as DictKey)}
            accessibilityState={{ expanded: more }}
            style={{ height: component.button.sm, paddingHorizontal: space[3], borderRadius: radius.pill, justifyContent: "center", backgroundColor: c.surf2, borderWidth: more ? component.selectedBorder : 1, borderColor: more ? c.ink : c.bd }}
          >
            <T v="button" w={more ? "bold" : undefined} style={{ color: c.ink }}>{t("mod.gutters.attr.fracMore" as DictKey)}</T>
          </Press>
        </View>
      </ScrollView>
      {more ? (
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
