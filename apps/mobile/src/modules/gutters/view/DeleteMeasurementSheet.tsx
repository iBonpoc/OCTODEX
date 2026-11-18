/**
 * «Удалить замер?» (#2013; spec 33-gutters-workflow «Удалить замер»): asked only when an open estimate stands on the measurement. A draft
 * keeps its lines as ordinary ones (the same sum); a sent one stays with the client as it is. «Удалить замер» (danger) · «Отмена».
 * The core's sheet and buttons only (rule 29).
 */
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import type { Estimate } from "@/data/types";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { Sheet } from "@/ui/overlays";
import { T } from "@/ui/primitives";

/** nothing to say (the question is closed) */
export const NO_ESTIMATES: { drafts: Estimate[]; sent: Estimate[] } = { drafts: [], sent: [] };

export function DeleteMeasurementSheet({ visible, on, onDelete, onClose }: { visible: boolean; on: { drafts: Estimate[]; sent: Estimate[] }; onDelete: () => void; onClose: () => void }) {
  const { t, money } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={t("mod.gutters.del.title")}>
      <View style={{ gap: space[3] }} testID="m-delete-ask">
        {on.drafts.map((e) => (
          <View key={e.id} testID="m-delete-draft"><T v="body">{t("mod.gutters.del.draft", { sum: money(e.totalCents) })}</T></View>
        ))}
        {on.sent.map((e) => (
          <View key={e.id} testID="m-delete-sent"><T v="body">{t("mod.gutters.del.sent", { sum: money(e.totalCents) })}</T></View>
        ))}
        <View testID="m-delete-yes"><Button label={t("mod.gutters.del.yes")} variant="danger" full onPress={onDelete} /></View>
        <View testID="m-delete-no"><Button label={t("common.cancel")} variant="secondary" full onPress={onClose} /></View>
      </View>
    </Sheet>
  );
}
