import { useState } from "react";
import { Platform, View } from "react-native";
import { space } from "@octo/design-tokens";
import { useI18n, type DictKey } from "@/i18n";
import { Button, Toggle } from "@/ui/controls";
import { haptics, useHapticsEnabled } from "@/ui/haptics";
import { T } from "@/ui/primitives";
import { Card, RowView, SectionTitle } from "@/ui/surfaces";
import { SECTIONS } from "./registry";

type Kind = "selection" | "light" | "medium" | "success" | "warning" | "error";
const KINDS: { kind: Kind; name: DictKey; where: DictKey }[] = [
  { kind: "selection", name: "ds.hap.selection", where: "ds.hap.selectionWhere" },
  { kind: "light", name: "ds.hap.light", where: "ds.hap.lightWhere" },
  { kind: "medium", name: "ds.hap.medium", where: "ds.hap.mediumWhere" },
  { kind: "success", name: "ds.hap.success", where: "ds.hap.successWhere" },
  { kind: "warning", name: "ds.hap.warning", where: "ds.hap.warningWhere" },
  { kind: "error", name: "ds.hap.error", where: "ds.hap.errorWhere" },
];

/** Haptics (DS §15.6): every response of the map on its own button — «feel it» — with where the app gives it. */
export function HapticsSection() {
  const { t } = useI18n();
  const s = SECTIONS.find((x) => x.id === "haptics")!;
  const [on, setOn] = useHapticsEnabled();
  const [last, setLast] = useState<Kind | null>(null);
  const web = Platform.OS === "web";
  return (
    <View testID="showcase-haptics">
      <SectionTitle title={`${t(s.title)} · ${s.ds}`} />
      <Card>
        <RowView style={{ justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <T v="heading">{t("haptics.title")}</T>
            <T v="caption" tone="mut">{web ? t("ds.hap.web") : t("haptics.hint")}</T>
          </View>
          {web ? null : (
            <View testID="showcase-hap-switch">
              <Toggle label={t("haptics.title")} on={on} onChange={setOn} />
            </View>
          )}
        </RowView>
      </Card>
      <Card>
        <T v="heading">{t("ds.hap.map")}</T>
        <T v="caption" tone="mut">{t("ds.hap.mapHint")}</T>
        {KINDS.map(({ kind, name, where }) => (
          <View key={kind} testID={`showcase-hap-${kind}`} style={{ gap: space[1] }}>
            <Button
              label={`${t("ds.hap.feel")}: ${t(name)}`}
              variant="secondary"
              icon="phone"
              onPress={() => {
                haptics[kind]();
                setLast(kind);
              }}
            />
            <T v="caption" tone="mut">{t(where)}</T>
          </View>
        ))}
        <View testID="showcase-hap-last">
          <T v="caption">{last ? t("ds.hap.last", { name: t(KINDS.find((k) => k.kind === last)!.name) }) : t("ds.hap.none")}</T>
        </View>
      </Card>
    </View>
  );
}
