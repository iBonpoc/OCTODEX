import { View } from "react-native";
import { useI18n } from "@/i18n";
import { useTheme, type ThemePref } from "@/theme/ThemeProvider";
import { SelectField } from "@/ui/selectField";
import { HeaderButton } from "@/ui/headerIcon";

/**
 * The theme of the showcase (#2745, founder 25.11 #2744): both themes are compared without leaving the showcase.
 * One stored preference with Настройки → «Оформление» — the whole app follows.
 * The first screen: the field «Тема ⌄» (DS §9 А16: a stored value is a `SelectField`, not a segment).
 */
export function ShowcaseThemeField() {
  const { t } = useI18n();
  const { pref, setPref } = useTheme();
  return (
    <View testID="showcase-theme">
      <SelectField<ThemePref>
        label={t("more.theme")}
        value={pref}
        onChange={setPref}
        items={[
          { key: "system", label: t("more.themeSystem") },
          { key: "dark", label: t("more.dark") },
          { key: "light", label: t("more.light") },
        ]}
      />
    </View>
  );
}

/**
 * A section's header: one tap turns the other theme on, wherever the page is scrolled (crm-reviewer 25.11: the field at the top of a
 * long page scrolls away, a detail at the bottom could not be compared). The sun in the dark theme, the moon in the light one.
 */
export function ShowcaseThemeButton() {
  const { t } = useI18n();
  const { name, setPref } = useTheme();
  const next = name === "dark" ? "light" : "dark";
  return (
    <HeaderButton
      testID="showcase-theme-toggle"
      icon={name === "dark" ? "sun" : "moon"}
      label={t("ds.theme.to", { name: t(next === "light" ? "more.light" : "more.dark") })}
      onPress={() => setPref(next)}
    />
  );
}
