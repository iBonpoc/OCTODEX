import { useState } from "react";
import { View } from "react-native";
import { component, size, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { BrandIntro, BrandLogo, BrandMark, BrandQuick, BrandWait } from "@/ui/brand";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, RowView, SectionTitle } from "@/ui/surfaces";

/** «Бренд GoRix» (DS §18.2, #1156): the mark in its sizes and both dots, the logo, the dot's three moves with «Проиграть» */
export function BrandSection() {
  const { t } = useI18n();
  // a new key remounts the moves: «Проиграть» plays them again from the start
  const [run, setRun] = useState(0);
  return (
    <View testID="showcase-brand" style={{ gap: space[3] }}>
      <T v="caption" tone="mut">
        {t("ds.brand.hint")}
      </T>
      <SectionTitle title={t("ds.brand.marks")} />
      <Card>
        <RowView style={{ flexWrap: "wrap", alignItems: "flex-end", gap: space[6] }}>
          <View testID="showcase-brand-mark-24">
            <BrandMark size={size.iconLg} />
          </View>
          <View testID="showcase-brand-mark-48">
            <BrandMark size={component.brand.mark} />
          </View>
          <View testID="showcase-brand-mark-ink">
            <BrandMark size={component.brand.mark} screenHasPrimary />
          </View>
          <View testID="showcase-brand-mark-56">
            <BrandMark size={component.brand.wait} />
          </View>
        </RowView>
      </Card>
      <SectionTitle title={t("ds.brand.logo")} />
      <Card>
        <View testID="showcase-brand-logo" style={{ alignItems: "center" }}>
          <BrandLogo width={component.brand.about} />
        </View>
      </Card>
      <SectionTitle title={t("ds.brand.moves")} />
      <Card>
        <View key={run} style={{ gap: space[4], alignItems: "center" }}>
          <BrandQuick size={component.brand.wait} testID="showcase-brand-quick" />
          <BrandWait size={component.brand.wait} testID="showcase-brand-wait" />
          <BrandIntro width={component.brand.intro} testID="showcase-brand-intro" />
        </View>
        <View testID="showcase-brand-replay">
          <Button label={t("ds.brand.replay")} icon="refresh" variant="secondary" onPress={() => setRun((n) => n + 1)} />
        </View>
      </Card>
    </View>
  );
}
