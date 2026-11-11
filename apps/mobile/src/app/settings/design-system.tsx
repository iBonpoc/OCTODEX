import { View } from "react-native";
import { useI18n } from "@/i18n";
import { T } from "@/ui/primitives";
import { Screen } from "@/ui/surfaces";
import { TokenSections } from "@/features/showcase/Tokens";

/**
 * «Дизайн-система» — the showcase (#1093, founder 11.11.2026): the same components and tokens as the app, live, in both
 * themes and on every width. Registry and guard: features/showcase/registry.ts, test/designSystem.test.ts.
 */
export default function DesignSystemShowcase() {
  const { t } = useI18n();
  return (
    <Screen title={t("ds.title")}>
      <View testID="showcase-intro">
        <T v="caption" tone="mut">{t("ds.intro")}</T>
      </View>
      <TokenSections />
    </Screen>
  );
}
