import { FieldsSection } from "@/features/showcase/Fields";
import { View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { T } from "@/ui/primitives";
import { Screen, SectionTitle } from "@/ui/surfaces";
import { canSeeShowcase } from "@/features/showcase/access";
import { SCREENS } from "@/features/showcase/registry";
import { TokenSections } from "@/features/showcase/Tokens";
import { ShowcaseThemeSwitch } from "@/features/showcase/ThemeSwitch";
import { WindowsSection } from "@/features/showcase/Windows";
import { SelectorsSection } from "@/features/showcase/Selectors";
import { ButtonsSection } from "@/features/showcase/Buttons";
import { NoticesSection } from "@/features/showcase/Notices";
import { HapticsSection } from "@/features/showcase/Haptics";
import { RowsSection } from "@/features/showcase/Rows";
import { BrandSection } from "@/features/showcase/Brand";
import { IconsSection } from "@/features/showcase/Icons";
import { ChoiceSection } from "@/features/showcase/Choice";
import { ProtoObject } from "@/features/showcase/ProtoObject";
import { ProtoLists } from "@/features/showcase/ProtoLists";
import { ProtoV2 } from "@/features/showcase/ProtoV2";
import { GraphiteSheet } from "@/features/showcase/graphite/sheet/GraphiteSheet";
import { useGraphiteFlag } from "@/features/showcase/graphite/flag";

/** One section of the showcase on its own screen (#1150). The id is the registry's `SCREENS[].id`. */
export default function DesignSystemSection() {
  const { t } = useI18n();
  const { mode, role } = useStore();
  const { section } = useLocalSearchParams<{ section: string }>();
  const [graphite, , flagRead] = useGraphiteFlag();
  if (!canSeeShowcase(mode, role)) return <Redirect href="/settings" />;
  const s = SCREENS.find((x) => x.id === section);
  if (!s) return <Redirect href="/settings/design-system" />;
  // «Графит» (пилот #2254): without the switch its address goes back to the list
  if (s.pilot && flagRead && !graphite) return <Redirect href="/settings/design-system" />;
  // «Графит» is ONE sheet that only scrolls (#2292): its own screen, with the sticky strip
  if (s.id === "graphite")
    return <GraphiteSheet title={t(s.title)} caption={`${t("ds.rule", { ds: s.ds })} · ${t(s.where)}`} onBack={() => router.replace("/settings/design-system")} />;
  return (
    <Screen title={t(s.title)} back={() => router.replace("/settings/design-system")}>
      <View testID={`showcase-screen-${s.id}`} style={{ gap: 0 }}>
        <T v="caption" tone="mut">{`${t("ds.rule", { ds: s.ds })} · ${t(s.where)}`}</T>
      </View>
      {/* #2745: both themes are compared on the page itself */}
      <ShowcaseThemeSwitch />
      {s.id === "base" ? <TokenSections screen="base" /> : null}
      {s.id === "spacing" ? <TokenSections screen="spacing" /> : null}
      {s.id === "motion" ? <TokenSections screen="motion" /> : null}
      {s.id === "buttons" ? <ButtonsSection /> : null}
      {s.id === "selectors" ? <SelectorsSection /> : null}
      {s.id === "windows" ? <WindowsSection /> : null}
      {s.id === "notices" ? <NoticesSection /> : null}
      {s.id === "haptics" ? <HapticsSection /> : null}
      {s.id === "rows" ? <RowsSection /> : null}
      {s.id === "fields" ? <FieldsSection /> : null}
      {s.id === "choice" ? <ChoiceSection /> : null}
      {s.id === "brand" ? <BrandSection /> : null}
      {s.id === "icons" ? <IconsSection /> : null}
      {s.id === "proto" ? (
        <View style={{ gap: 0 }}>
          <SectionTitle title={t("ds.sec.protoObject")} />
          <ProtoObject />
          <SectionTitle title={t("ds.sec.protoLists")} />
          <ProtoLists />
          <SectionTitle title={t("ds.sec.protoV2")} />
          <ProtoV2 />
        </View>
      ) : null}
    </Screen>
  );
}
