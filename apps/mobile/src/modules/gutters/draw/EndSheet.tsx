/**
 * «Конец желоба» — the sheet a double tap on a free end opens (spec 33 §3, #1273). A tap on the end only picks the gutter now; what
 * used to happen at once (a flip of the cap's side) is a row here. The choices are rows with a check (DS «Заливка»):
 * the cap is there / no cap (`noCap` — the crew butts the gutter to a wall or a post; the cap is neither drawn nor counted),
 * and «L ↔ R» for the whole line's face. «С выпуском» (an overhang) waits for the object of it (#1247): it is not shown, not broken.
 */
import { View } from "react-native";
import { useI18n } from "@/i18n";
import { component, radius, size as sizes, space } from "@octo/design-tokens";
import { fillStyle } from "@/ui/fill";
import { Icon, T } from "@/ui/primitives";
import { SelectedCheck } from "@/ui/selectedCheck";
import { ListRow } from "@/ui/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

export function EndSheet({ capOff, side, onCap, onFlip }: { capOff: boolean; side: "L" | "R"; onCap: (off: boolean) => void; onFlip: () => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
  // a chosen row: «Заливка» + the check (DS «Выделение выбранного», #1306)
  const choice = (on: boolean, title: string, id: string, press: () => void) => (
    <View testID={id} style={on ? { borderRadius: radius.inner, paddingHorizontal: space[2], ...fillStyle(c) } : { paddingHorizontal: space[2] }}><ListRow title={title} selected={on} chevron={false} minHeight={component.rowOption} right={on ? <SelectedCheck /> : null} onPress={press} /></View>
  );
  return (
    <View testID="end-sheet" style={{ gap: space[2] }}>
      <T v="heading" w="semibold">{t("mod.gutters.end.title")}</T>
      {choice(!capOff, t("mod.gutters.end.capOn"), "end-cap-on", () => onCap(false))}
      {choice(capOff, t("mod.gutters.end.capOff"), "end-cap-off", () => onCap(true))}
      <T v="caption" tone="mut">{t("mod.gutters.end.note")}</T>
      <View testID="end-flip"><ListRow title={t("mod.gutters.end.flip", { s: side === "L" ? "R" : "L" })} left={<Icon name="repeat" s={sizes.iconMd} color={c.ink} />} onPress={onFlip} /></View>
    </View>
  );
}
