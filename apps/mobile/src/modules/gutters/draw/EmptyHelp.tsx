/**
 * «Как рисовать» — how the canvas is used (founder 18.11, #2186: «когда я открываю чертеж, то обязательно на пустом экране
 * должна быть инструкция, как пользоваться чертежом»). Four steps, a picture and a line each: draw a gutter, put a
 * downspout on it, the length, two fingers to zoom and move. On an empty canvas it stands in the middle and lets every
 * touch through (the first stroke draws at once); gone after the first line; the same steps under «?» in the header.
 * Built of src/ui only (rule 29): Card, RowView, Icon, T.
 */
import { View } from "react-native";
import { component, space } from "@octo/design-tokens";
import { useI18n, type DictKey } from "@/i18n";
import { Icon, T, type IconKey } from "@/ui/primitives";
import { Card, RowView } from "@/ui/surfaces";

const k = (s: string) => `mod.gutters.draw.help.${s}` as DictKey;
/** the steps, in the order of the work; a gutter's and a downspout's picture is the toolbar's own (design review #2186:
 *  the person looks for the same picture below — DS §19а, the tool's icon is the chosen profile / kind) */
export const HELP_STEPS: { key: string; icon: IconKey | "tool:line" | "tool:ds" }[] = [
  { key: "line", icon: "tool:line" },
  { key: "ds", icon: "tool:ds" },
  { key: "len", icon: "pencil" },
  { key: "zoom", icon: "search" },
];

/** the steps as one text — the «?» sheet's (HelpButton takes a text) */
export const helpText = (t: (k: DictKey) => string) => HELP_STEPS.map((s, i) => `${i + 1}. ${t(k(s.key))}`).join("\n");

/** the card on the empty canvas: never takes a touch — drawing starts through it */
export function EmptyHelp({ lineIcon, dsIcon }: { lineIcon: IconKey; dsIcon: IconKey }) {
  const { t } = useI18n();
  return (
    <View pointerEvents="none" testID="draw-empty-help" style={{ width: "100%", maxWidth: component.modalW }}>
      <Card style={{ gap: space[3] }}>
        <T v="heading" w="semibold">{t(k("title"))}</T>
        {HELP_STEPS.map((s) => (
          <View key={s.key} testID={`draw-help-${s.key}`}>
            <RowView style={{ gap: space[3], alignItems: "flex-start" }}>
              <Icon name={s.icon === "tool:line" ? lineIcon : s.icon === "tool:ds" ? dsIcon : s.icon} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T v="body">{t(k(s.key))}</T>
              </View>
            </RowView>
          </View>
        ))}
        <T v="caption" tone="mut">{t(k("more"))}</T>
      </Card>
    </View>
  );
}
