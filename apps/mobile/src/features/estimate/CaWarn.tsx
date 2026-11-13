import { View } from "react-native";
import { size, space, statusIcon } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, T } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";

/**
 * «Выше лимита CA для home improvement» under the deposit (#1377): a warning colour is always an icon and a word
 * (rule 2, DS §8.3) — `warn`'s icon, then the text; nothing is blocked, the owner decides.
 */
export function CaWarn({ limitCents, testID }: { limitCents: number; testID: string }) {
  const { t, money } = useI18n();
  const { c } = useTheme();
  return (
    <View testID={testID}>
      <RowView style={{ alignItems: "flex-start", gap: space[1] }}>
        <View testID={`${testID}-icon`}>
          <Icon name={statusIcon.warn} s={size.iconSm} color={c.status.warn.text} />
        </View>
        <T v="caption" tone="warn" style={{ flex: 1 }}>
          {t("ue.caWarn", { limit: money(limitCents) })}
        </T>
      </RowView>
    </View>
  );
}
