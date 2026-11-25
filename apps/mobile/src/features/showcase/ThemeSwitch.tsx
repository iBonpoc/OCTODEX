import { View } from "react-native";
import { useI18n } from "@/i18n";
import { useTheme, type ThemePref } from "@/theme/ThemeProvider";
import { Segmented } from "@/ui/controls";

/**
 * The theme switch of the showcase (#2745, founder 25.11 #2744): both themes are compared without leaving the showcase.
 * The same choice as Настройки → «Оформление» (one stored preference, the whole app follows).
 */
export function ShowcaseThemeSwitch() {
  const { t } = useI18n();
  const { pref, setPref } = useTheme();
  return (
    <View testID="showcase-theme">
      <Segmented<ThemePref>
        full
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
