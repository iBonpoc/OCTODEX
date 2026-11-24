import { useState } from "react";
import { View } from "react-native";
import { icons, size, space, statusIcon } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { ToggleRow } from "@/ui/toggleRow";
import { Icon, T, type IconKey } from "@/ui/primitives";
import { Card, RowView, SectionTitle } from "@/ui/surfaces";
import { useTheme } from "@/theme/ThemeProvider";
import { SECTIONS } from "./registry";

/** the tab bar's five, in order (visual-v2) — the set's first test */
const TABS: IconKey[] = ["home", "plan", "users", "money", "leads"];

/** Значки (DS §18.1, #2350): the whole «Тонкие острые» set live — normal and selected (filled), two sizes, the status glyphs. */
export function IconsSection() {
  const { t } = useI18n();
  const { c } = useTheme();
  const s = SECTIONS.find((x) => x.id === "icons")!;
  const [active, setActive] = useState(false);
  const names = Object.keys(icons) as IconKey[];
  return (
    <View testID="showcase-icons">
      <SectionTitle title={`${t(s.title)} · ${s.ds}`} />
      <Card>
        <ToggleRow testID="showcase-icons-active" label={t("ds.icons.active")} caption={t("ds.icons.activeHint")} value={active} onChange={setActive} />
        <RowView style={{ gap: space[4] }}>
          {TABS.map((k) => (
            <Icon key={k} name={k} s={size.iconLg} color={active ? c.accText : c.ink} active={active} />
          ))}
        </RowView>
        <RowView style={{ gap: space[4] }}>
          {(Object.keys(statusIcon) as (keyof typeof statusIcon)[]).map((k) => (
            <Icon key={k} name={statusIcon[k]} s={size.iconMd} color={k === "neutral" ? c.mut : c.status[k].text} active={active} />
          ))}
        </RowView>
      </Card>
      <Card>
        <T v="heading">{t("ds.icons.all", { n: names.length })}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3] }}>
          {names.map((k) => (
            <View key={k} testID={`showcase-icon-${k}`} style={{ alignItems: "center", gap: space[1] }}>
              <Icon name={k} s={size.iconLg} color={active ? c.accText : c.ink} active={active} />
              <T v="caption" tone="mut" center>{k}</T>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}
