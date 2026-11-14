import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { component, motion, size, space } from "@octo/design-tokens";
import { useBootLeave } from "@/features/boot";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { BrandIntro, BrandLogo, BrandMark, BrandWait } from "@/ui/brand";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, RowView, SectionTitle } from "@/ui/surfaces";

/** the launch as the app does it (DS §18.2 «Запуск» v4.3, #1394): the still mark on the theme's bg, then it grows to
 *  `brandExitScale` and fades in `durBase` over «the first screen» (the same hook as the boot layer) */
function LaunchDemo() {
  const { t } = useI18n();
  const { c } = useTheme();
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const onGone = useCallback(() => setGone(true), []);
  const leave = useBootLeave(leaving, onGone);
  useEffect(() => {
    const id = setTimeout(() => setLeaving(true), motion.durBrandQuick);
    return () => clearTimeout(id);
  }, []);
  return (
    <View testID="showcase-brand-launch" style={{ alignSelf: "stretch", height: component.brand.intro, alignItems: "center", justifyContent: "center" }}>
      <T v="body" tone="mut">
        {t("ds.brand.firstScreen")}
      </T>
      {gone ? null : (
        <Animated.View testID={leaving ? "showcase-brand-launch-leaving" : "showcase-brand-launch-still"} pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }, leave.layer]}>
          <Animated.View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }, leave.mark]}>
            <BrandMark size={component.brand.wait} />
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

/** «Бренд GoRix» (DS §18.2, #1156, #1394): the mark in its sizes and both dots, the logo, the launch and the dot's moves with «Проиграть» */
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
        <RowView style={{ flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-around", gap: space[4] }}>
          <View testID="showcase-brand-mark-24" style={{ alignItems: "center", gap: space[1] }}>
            <BrandMark size={size.iconLg} />
            <T v="caption" tone="mut">{`${size.iconLg}`}</T>
          </View>
          <View testID="showcase-brand-mark-48" style={{ alignItems: "center", gap: space[1] }}>
            <BrandMark size={component.brand.mark} />
            <T v="caption" tone="mut">{`${component.brand.mark} · acc`}</T>
          </View>
          <View testID="showcase-brand-mark-ink" style={{ alignItems: "center", gap: space[1] }}>
            <BrandMark size={component.brand.mark} screenHasPrimary />
            <T v="caption" tone="mut">{`${component.brand.mark} · ink`}</T>
          </View>
          <View testID="showcase-brand-mark-56" style={{ alignItems: "center", gap: space[1] }}>
            <BrandMark size={component.brand.wait} />
            <T v="caption" tone="mut">{`${component.brand.wait}`}</T>
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
          <LaunchDemo />
          <T v="caption" tone="mut">{t("ds.brand.launch")}</T>
          <BrandWait size={component.brand.wait} testID="showcase-brand-wait" />
          <T v="caption" tone="mut">{t("ds.brand.wait")}</T>
          <BrandIntro width={component.brand.intro} testID="showcase-brand-intro" />
          <T v="caption" tone="mut">{t("ds.brand.intro")}</T>
        </View>
        <View testID="showcase-brand-replay">
          <Button label={t("ds.brand.replay")} icon="refresh" variant="secondary" onPress={() => setRun((n) => n + 1)} />
        </View>
      </Card>
    </View>
  );
}
