import { View } from "react-native";
import { useI18n } from "@/i18n";
import { T } from "@/ui/primitives";
import { Card, SectionTitle } from "@/ui/surfaces";
import { SECTIONS } from "./registry";

/** Haptics (DS §15.6): the vibration module and its samples come with #1009 (merged into this PR below). */
export function HapticsSection() {
  const { t } = useI18n();
  const s = SECTIONS.find((x) => x.id === "haptics")!;
  return (
    <View testID="showcase-haptics">
      <SectionTitle title={`${t(s.title)} · ${s.ds}`} />
      <Card>
        <T v="caption" tone="mut">{t("ds.hap.soon")}</T>
      </Card>
    </View>
  );
}
