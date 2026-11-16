import { Platform, View } from "react-native";
import { component, layout, radius, size, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { Button } from "./controls";
import { fillStyleFlat } from "./fill";
import { NumberField } from "./numberField";
import { Press, T } from "./primitives";
import { useReadOnly } from "./readOnly";
import { rovingKeyDown } from "./rovingKeys";
import { Card } from "./surfaces";

export type PctUsdUnit = "pct" | "usd";

/**
 * A sum set in percent or in dollars (DS §9 А1е, spec 55 §4в; the founder 16.11.2026: «переключатель, процент доллар») — only in
 * the places the guard lists (an item's own markup, an estimate line's markup, the estimate's discount and deposit,
 * `ContractStatement`); a company's markup is percent only. One `NumberField` and, right beside it (`space[2]`), the switch
 * «%» · «$»: 44 high level with the field, `pad` 4, each item ≥ 44; chosen — «Заливка» `surf2` without a shadow, `ink` 600.
 * The unit is shown by the switch, not twice: no «$» / «%» inside the field; in dollars the field ends with «/ <unit>».
 * A `radiogroup` («Единица наценки»), items `radio` «в процентах» / «в долларах»; the field's spoken name follows the unit.
 * No money here: the screen hands the value (bps or cents), the second line and, for $ → % without an exact percent, the card.
 */
export function PctUsdField({
  label,
  unit,
  onUnit,
  value,
  onChange,
  perUnitLabel,
  secondLine,
  groupLabel,
  inexact,
  testID,
}: {
  label: string;
  unit: PctUsdUnit;
  /** the switch moved: the screen keeps the price and counts the other value (the change itself never moves the price) */
  onUnit: (u: PctUsdUnit) => void;
  /** basis points in percent, cents in dollars */
  value: number;
  onChange: (v: number) => void;
  /** «/ hr», «/ ft» — after the number in dollars */
  perUnitLabel?: string;
  /** the other value, counted by the screen: «= +$10.00 / hr · клиенту $35.00 / hr» — under the field on a phone, beside it from 820 */
  secondLine?: string;
  /** the group's name for the screen reader (default «Единица наценки»; «Единица скидки», «Единица аванса») */
  groupLabel?: string;
  /** $ → % with no exact percent (spec 55 §4в): the price does not move by itself — the card asks */
  inexact?: { pct: string; price: string; dir: "more" | "less"; onPct: () => void; onKeep: () => void } | null;
  /** the field — `<testID>-field`, the switch — `<testID>-unit`, its items `<testID>-unit-pct` / `-usd`, the card `<testID>-inexact` */
  testID?: string;
}) {
  const { t } = useI18n();
  const { c } = useTheme();
  const { wide } = useDevice();
  const ro = useReadOnly();
  // level with the field: 44 on a phone, the field's 34 from 820 (the tap zone stays 44 — `minWidth: size.hitMin`, Press hit slop)
  const h = wide ? component.field.h : component.field.phone;
  const pad = component.segmented.pad;
  const units: { key: PctUsdUnit; sign: string; word: string }[] = [
    { key: "pct", sign: "%", word: t("ui.pctUsd.pct") },
    { key: "usd", sign: "$", word: t("ui.pctUsd.usd") },
  ];
  const word = units.find((u) => u.key === unit)!.word;
  const web = Platform.OS === "web";
  const field =
    unit === "pct" ? (
      <NumberField kind="percent" bare label={label} unitWord={word} bps={value} onChange={onChange} testID={testID ? `${testID}-field` : undefined} />
    ) : (
      <NumberField kind="money" bare label={label} unitWord={word} unit={perUnitLabel} cents={value} onChange={onChange} testID={testID ? `${testID}-field` : undefined} />
    );
  const second = secondLine ? (
    <View testID={testID ? `${testID}-second` : undefined} style={wide ? { flexShrink: 1, justifyContent: "center", minHeight: h } : undefined}>
      <T v="caption" tone="mut">
        {secondLine}
      </T>
    </View>
  ) : null;
  return (
    <View testID={testID} style={{ gap: space[2], maxWidth: layout.formMax }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space[2] }}>
        {/* the field keyed by the unit: a new kind of number, a fresh text in it */}
        <View key={unit} style={{ flex: 1, minWidth: 0 }}>
          {field}
        </View>
        <View
          testID={testID ? `${testID}-unit` : undefined}
          accessibilityRole="radiogroup"
          accessibilityLabel={groupLabel ?? t("ui.pctUsd.group")}
          {...(web ? ({ onKeyDown: (e: Parameters<typeof rovingKeyDown>[0]) => rovingKeyDown(e, '[role="radio"]', (i) => !ro && onUnit(units[i]!.key), "horizontal") } as object) : null)}
          style={{ height: h, padding: pad, borderRadius: radius.pill, backgroundColor: c.track, flexDirection: "row" }}
        >
          {units.map((u) => {
            const on = u.key === unit;
            return (
              <Press
                key={u.key}
                testID={testID ? `${testID}-unit-${u.key}` : undefined}
                onPress={() => !on && onUnit(u.key)}
                disabled={ro}
                visibleHeight={h}
                accessibilityRole="radio"
                accessibilityLabel={u.word}
                accessibilityState={{ selected: on, disabled: ro }}
                {...(web ? ({ "aria-checked": on } as object) : null)}
                style={{
                  minWidth: size.hitMin,
                  height: h - pad * 2,
                  borderRadius: radius.pill,
                  alignItems: "center",
                  justifyContent: "center",
                  ...(on ? fillStyleFlat(c) : { backgroundColor: "transparent" }),
                }}
              >
                <T v="button" w={on ? "semibold" : "regular"} style={{ color: on ? c.ink : c.mut }}>
                  {u.sign}
                </T>
              </Press>
            );
          })}
        </View>
        {wide ? second : null}
      </View>
      {wide ? null : second}
      {inexact ? (
        <View testID={testID ? `${testID}-inexact` : undefined} accessibilityLiveRegion="polite">
          <Card inner>
            <T v="body">{t(inexact.dir === "more" ? "ui.pctUsd.inexactMore" : "ui.pctUsd.inexactLess", { pct: inexact.pct, price: inexact.price })}</T>
            <View style={{ flexDirection: "row", gap: space[3] }}>
              <Button variant="secondary" label={t("ui.pctUsd.toPct")} onPress={inexact.onPct} testID={testID ? `${testID}-to-pct` : undefined} />
              <Button variant="secondary" label={t("ui.pctUsd.keepUsd")} onPress={inexact.onKeep} testID={testID ? `${testID}-keep-usd` : undefined} />
            </View>
          </Card>
        </View>
      ) : null}
    </View>
  );
}
