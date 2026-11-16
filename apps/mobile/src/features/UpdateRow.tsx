import { View } from "react-native";
import { useI18n } from "@/i18n";
import { Divider, ListRow } from "@/ui/surfaces";
import { applyDownloadedUpdate, checkForUpdate, updatesSupported, useUpdateState } from "./appUpdate";
import { rowState, updateView } from "./updateRules";

/** Settings → «О приложении»: «Версия · Проверить обновление» (phone builds only); a press looks now, or applies a ready update */
export function UpdateRow() {
  const { t } = useI18n();
  const st = useUpdateState();
  if (!updatesSupported()) return null;
  const view = updateView({ supported: true, downloaded: st.downloaded, needsBuild: st.needsBuild });
  const state = rowState({ checking: st.checking, view, checkedOnce: st.checkedOnce });
  const subtitle = { checking: t("upd.row.checking"), latest: t("upd.row.latest"), ready: t("upd.row.ready"), needsBuild: t("upd.needsBuild.title"), unknown: t("upd.row.unknown") }[state];
  return (
    <View testID="update-row">
      <Divider />
      <ListRow
      title={t("upd.row.title")}
      subtitle={subtitle}
      onPress={() => (state === "ready" ? void applyDownloadedUpdate() : void checkForUpdate("manual"))}
      />
    </View>
  );
}
