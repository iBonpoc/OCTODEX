import { View } from "react-native";
import { Redirect } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { T } from "@/ui/primitives";
import { Screen } from "@/ui/surfaces";
import { TokenSections } from "@/features/showcase/Tokens";
import { SelectorsSection } from "@/features/showcase/Selectors";
import { WindowsSection } from "@/features/showcase/Windows";

/**
 * «Дизайн-система» — the showcase (#1093, founder 11.11.2026): the same components and tokens as the app, live, in both
 * themes and on every width. Registry and guard: features/showcase/registry.ts, test/designSystem.test.ts.
 */
export default function DesignSystemShowcase() {
  const { t } = useI18n();
  const { mode, role } = useStore();
  // the showcase is the company owner's (and the demo's): the Settings row is hidden for others, the address checks too
  if (mode !== "demo" && role !== "director") return <Redirect href="/settings" />;
  return (
    <Screen title={t("ds.title")}>
      <View testID="showcase-intro">
        <T v="caption" tone="mut">{t("ds.intro")}</T>
      </View>
      <WindowsSection />
      <SelectorsSection />
      <TokenSections />
    </Screen>
  );
}
