/**
 * A free end of a gutter — the sheet a double tap on the end opens (spec 33 §3, #1273; spec 56 §3а.2, wave G, founder 16.11).
 * The head says what it is and which one: «End Cap · Left» while the cap is there, «Конец gutter · Left» when it is off
 * («жёлоб» is never written; Left / Right in English in every language), and its «?» says when to turn the cap off.
 * 1) `ToggleRow` «End Cap» — on: the cap is drawn and counted; off: the gutter butts a wall, a post or another gutter.
 * 2) A row-action «Поменять сторону → Right»: the whole line's face flips at once, the owner shows «Вернуть».
 * No buttons: a change is saved at once. Only components of src/ui (rule 29).
 */
import { View } from "react-native";
import { size as sizes, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { HelpButton } from "@/ui/overlays";
import { Icon, T } from "@/ui/primitives";
import { ToggleRow } from "@/ui/toggleRow";
import { ListRow, RowView } from "@/ui/surfaces";

export function EndSheet({ capOff, side, onCap, onFlip }: {
  capOff: boolean;
  /** the letter this end's cap carries on the canvas */
  side: "L" | "R";
  onCap: (off: boolean) => void;
  onFlip: () => void;
}) {
  const { t } = useI18n();
  const { c } = useTheme();
  const word = (s: "L" | "R") => t(s === "L" ? "mod.gutters.end.left" : "mod.gutters.end.right");
  const title = t(capOff ? "mod.gutters.end.titleBare" : "mod.gutters.end.titleCap", { s: word(side) });
  return (
    <View testID="end-sheet" style={{ gap: space[2] }}>
      {/* the title and its «?» right after it (DS Б7) */}
      <RowView style={{ gap: space[2], alignItems: "center" }}>
        <View testID="end-title" style={{ flexShrink: 1 }}><T v="heading" w="semibold" numberOfLines={1}>{title}</T></View>
        <HelpButton title={t("mod.gutters.end.cap")} text={t("mod.gutters.end.help")} testID="end-help" />
      </RowView>
      <ToggleRow label={t("mod.gutters.end.cap")} caption={t("mod.gutters.end.caption")} value={!capOff} onChange={(on) => onCap(!on)} testID="end-cap" />
      <View testID="end-flip">
        <ListRow title={t("mod.gutters.end.flipTo", { s: word(side === "L" ? "R" : "L") })} left={<Icon name="repeat" s={sizes.iconMd} color={c.ink} />} chevron={false} onPress={onFlip} />
      </View>
    </View>
  );
}
