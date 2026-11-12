import { View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { T } from "@/ui/primitives";
import { Screen } from "@/ui/surfaces";
import { canSeeShowcase } from "@/features/showcase/access";
import { SCREENS } from "@/features/showcase/registry";
import { TokenSections } from "@/features/showcase/Tokens";
import { WindowsSection } from "@/features/showcase/Windows";
import { SelectorsSection } from "@/features/showcase/Selectors";
import { ButtonsSection } from "@/features/showcase/Buttons";
import { NoticesSection } from "@/features/showcase/Notices";
import { HapticsSection } from "@/features/showcase/Haptics";

/** One section of the showcase on its own screen (#1150). The id is the registry's `SCREENS[].id`. */
export default function DesignSystemSection() {
  const { t } = useI18n();
  const { mode, role } = useStore();
  const { section } = useLocalSearchParams<{ section: string }>();
  if (!canSeeShowcase(mode, role)) return <Redirect href="/settings" />;
  const s = SCREENS.find((x) => x.id === section);
  if (!s) return <Redirect href="/settings/design-system" />;
  return (
    <Screen title={t(s.title)} back={() => router.replace("/settings/design-system")}>
      <View testID={`showcase-screen-${s.id}`} style={{ gap: 0 }}>
        <T v="caption" tone="mut">{`${t("ds.rule", { ds: s.ds })} · ${t(s.where)}`}</T>
      </View>
      {s.id === "base" ? <TokenSections screen="base" /> : null}
      {s.id === "spacing" ? <TokenSections screen="spacing" /> : null}
      {s.id === "motion" ? <TokenSections screen="motion" /> : null}
      {s.id === "buttons" ? <ButtonsSection /> : null}
      {s.id === "selectors" ? <SelectorsSection /> : null}
      {s.id === "windows" ? <WindowsSection /> : null}
      {s.id === "notices" ? <NoticesSection /> : null}
      {s.id === "haptics" ? <HapticsSection /> : null}
    </Screen>
  );
}
