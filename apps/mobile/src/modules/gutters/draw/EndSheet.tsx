/**
 * A free end of a gutter — the sheet a double tap on the end opens (spec 33 §3, #1273; spec 56 §3а.2, wave G, founder 16.11).
 * The sheet's own head (`Sheet title` + `help`, DS Б1/Б7) says what it is and which one: «End Cap · Left» while the cap is there,
 * «Конец gutter · Left» when it is off (Left / Right in English in every language) — `endSheetTitle`; its «?» says when to turn the cap off.
 * 1) `ToggleRow` «End Cap» — on: the cap is drawn and counted; off: the gutter butts a wall, a post or another gutter.
 * 2) A row-action «Поменять сторону → Right»: the whole line's face flips at once, the owner shows «Вернуть».
 * No buttons: a change is saved at once. Only components of src/ui (rule 29).
 */
import { View } from "react-native";
import { size as sizes, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, T } from "@/ui/primitives";
import { ToggleRow } from "@/ui/toggleRow";
import { ListRow } from "@/ui/surfaces";

type T = ReturnType<typeof useI18n>["t"];
const sideWord = (t: T, s: "L" | "R") => t(s === "L" ? "mod.gutters.end.left" : "mod.gutters.end.right");
/** the sheet's title — also the row of «⋯» that opens it */
export const endSheetTitle = (t: T, capOff: boolean, side: "L" | "R") => t(capOff ? "mod.gutters.end.titleBare" : "mod.gutters.end.titleCap", { s: sideWord(t, side) });

export function EndSheet({ capOff, side, onCap, onFlip }: {
  capOff: boolean;
  /** the letter this end's cap carries on the canvas */
  side: "L" | "R";
  onCap: (off: boolean) => void;
  onFlip: () => void;
}) {
  const { t } = useI18n();
  const { c } = useTheme();
  return (
    <View testID="end-sheet" style={{ gap: space[2] }}>
      <ToggleRow label={t("mod.gutters.end.cap")} caption={t("mod.gutters.end.caption")} value={!capOff} onChange={(on) => onCap(!on)} testID="end-cap" />
      <View testID="end-flip">
        <ListRow title={t("mod.gutters.end.flipTo", { s: sideWord(t, side === "L" ? "R" : "L") })} left={<Icon name="repeat" s={sizes.iconMd} color={c.ink} />} chevron={false} onPress={onFlip} />
      </View>
    </View>
  );
}
