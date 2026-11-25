import { GroupRow } from "@/ui/groupedList";
import { View } from "react-native";
import { size } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "@/ui/primitives";
import { Divider, ListRow } from "@/ui/surfaces";
import { applyDownloadedUpdate, checkForUpdate, updatesSupported, useUpdateState } from "./appUpdate";
import { rowState, updateView } from "./updateRules";

/** Settings → «О приложении»: «Версия · Проверить обновление» (phone builds only); a press looks now, or applies a ready update */
export function UpdateRow({ row }: { /** ЧЕРНОВИК #2552: a row of the «О приложении» group */ row?: boolean } = {}) {
  const { t } = useI18n();
  const { c } = useTheme();
  const st = useUpdateState();
  if (!updatesSupported()) return null;
  const view = updateView({ supported: true, downloaded: st.downloaded, needsBuild: st.needsBuild });
  const state = rowState({ checking: st.checking, view, checkedOnce: st.checkedOnce });
  const subtitle = { checking: t("upd.row.checking"), latest: t("upd.row.latest"), ready: t("upd.row.ready"), needsBuild: t("upd.needsBuild.title"), unknown: t("upd.row.unknown") }[state];
  if (row) return <GroupRow testID="update-row" lead={{ icon: "sync" }} title={t("upd.row.title")} subtitle={subtitle} onPress={() => (state === "ready" ? void applyDownloadedUpdate() : void checkForUpdate("manual"))} />;
  return (
    <View testID="update-row">
      <Divider />
      <ListRow
        left={<Icon name="sync" s={size.iconMd} color={c.mut} />}
        chevron={false}
        title={t("upd.row.title")}
        subtitle={subtitle}
        onPress={() => (state === "ready" ? void applyDownloadedUpdate() : void checkForUpdate("manual"))}
      />
    </View>
  );
}
