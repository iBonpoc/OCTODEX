/**
 * The fraction of an inch by buttons (#1316, founder 13.11: «дробь — ряд кнопок под полем вместо ввода цифрами»): the main row —
 * eighths (0 ⅛ ¼ ⅜ ½ ⅝ ¾ ⅞), «1/16» opens the odd sixteenths (1/16 3/16 … 15/16) — fifteen buttons do not fit one phone row. A separate
 * part: if the founder does not like it, this file and its one place in AttrPanel go away in one PR («не понравится — кнопки убираем»);
 * its rows' constants live in fracSlot.ts (pure, for the unit test).
 */
import { useState } from "react";
import { View } from "react-native";
import { useI18n } from "@/i18n";
import type { DictKey } from "@/i18n";
import { component, radius, space } from "@octo/design-tokens";
import { ChoiceChips } from "@/ui/controls";
import { Press, T } from "@/ui/primitives";
import { fillStyle } from "@/ui/fill";
import { useTheme } from "@/theme/ThemeProvider";
import { ScrollFadeRow } from "@/ui/scrollFade";
import { fracLabel } from "../canvas/format";
import { EIGHTHS, ODD_SIXTEENTHS, eighthKey, sixteenthBehind, sixteenthsOpenAtStart } from "./fracSlot";

// the rows' constants are pure (fracSlot.ts): a unit test reads them without the row's scroll and its fade (#3080)
export { EIGHTHS, ODD_SIXTEENTHS, eighthKey } from "./fracSlot";

const NONE = "-";


export function FracPicker({ value, onChange, active, testID }: {
  /** the fraction in sixteenths, 0..15 */
  value: number;
  onChange: (e16: number) => void;
  /** the entry has come to the fraction: the row stands on the field's ground (`in`) — no ink frame (DS «Выделение выбранного»: a frame is not a way to mark a choice) */
  active: boolean;
  testID: string;
}) {
  const { t } = useI18n();
  const { c } = useTheme();
  // the second row: open when the window opens on an odd sixteenth, then by the user's tap only — a sixteenth from the tape
  // does not open it (the row grew over the tape under the finger, #2414); «1/16» looks chosen instead
  const [more, setMore] = useState(sixteenthsOpenAtStart(value));
  const behind = sixteenthBehind(value, more);
  const eighth = eighthKey(value);
  // the fade's colour on a phone: the field's ground at the fraction, else the window's glass (the web fades the chips themselves)
  const ground = active ? c.in : c.ov;
  // design-review #3066 №11: both rows fade at an edge with more chips past it (DS «ScrollFade» — the row was cut at the window's edge)
  return (
    // the same padding either way (the rows do not shift): the ground only changes
    <View
      testID={testID}
      style={{ gap: space[2], padding: space[1], borderRadius: radius.field, backgroundColor: active ? ground : "transparent" }}
    >
      <ScrollFadeRow ground={ground}>
        <View style={{ flexDirection: "row", gap: space[2], alignItems: "center" }}>
          <ChoiceChips
            nowrap
            items={EIGHTHS.map((i) => ({ key: String(i), label: i === 0 ? "0" : fracLabel(i * 2) }))}
            value={eighth ?? NONE}
            onChange={(key) => onChange(Number(key) * 2)}
          />
          {/* «1/16»: a chip like the others («Заливка» when open — never the accent, that is «Применить»'s), read as «Шестнадцатые» */}
          <Press
            testID={`${testID}-more`}
            onPress={() => setMore(!more)}
            visibleHeight={component.button.sm}
            accessibilityRole="button"
            accessibilityLabel={t("mod.gutters.attr.fracMoreA11y" as DictKey)}
            accessibilityState={{ expanded: more, selected: behind }}
            style={{ height: component.button.sm, paddingHorizontal: space[3], borderRadius: radius.pill, justifyContent: "center", ...(more || behind ? fillStyle(c) : { backgroundColor: "transparent" }), borderWidth: component.hairline, borderColor: more || behind ? "transparent" : c.bd }}
          >
            <T v="button" w={more || behind ? "semibold" : undefined} style={{ color: more || behind ? c.ink : c.mut }}>{t("mod.gutters.attr.fracMore" as DictKey)}</T>
          </Press>
        </View>
      </ScrollFadeRow>
      {more ? (
        <ScrollFadeRow ground={ground} testID={`${testID}-sixteenths`}>
          <ChoiceChips
            nowrap
            items={ODD_SIXTEENTHS.map((i) => ({ key: String(i), label: fracLabel(i) }))}
            value={eighth === null ? String(value) : NONE}
            onChange={(key) => onChange(Number(key))}
          />
        </ScrollFadeRow>
      ) : null}
    </View>
  );
}
