/**
 * «Обновить» (#1912, DS §15.3а): the strip under the header of every screen — «Доступна новая версия · Обновить» — and the driver that looks for
 * updates. The strip is a state of the app, not a result of an action (so not a toast): one at a time, closable, comes back at the next launch.
 */
import { useEffect } from "react";
import { AppState } from "react-native";
import * as Updates from "expo-updates";
import { useI18n } from "@/i18n";
import { Banner } from "@/ui/banner";
import { applyDownloadedUpdate, checkForUpdate, hideStrip, noteDownloaded, updatesSupported, useUpdateState } from "./appUpdate";
import { CHECK_EVERY_MS, updateView } from "./updateRules";

/** mounted once in the shell: the first look, a look at every return to the app and one every `CHECK_EVERY_MS` while it is open */
export function UpdateDriver() {
  if (!updatesSupported()) return null;
  return <NativeDriver />;
}

function NativeDriver() {
  const { isUpdatePending } = Updates.useUpdates();
  useEffect(() => noteDownloaded(isUpdatePending), [isUpdatePending]);
  useEffect(() => {
    void checkForUpdate("foreground");
    const sub = AppState.addEventListener("change", (s) => s === "active" && void checkForUpdate("foreground"));
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void checkForUpdate("timer");
    }, CHECK_EVERY_MS);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);
  return null;
}

export function UpdateBar() {
  const { t } = useI18n();
  const st = useUpdateState();
  const view = updateView({ supported: updatesSupported(), downloaded: st.downloaded, needsBuild: st.needsBuild });
  if (view === "none" || (view === "ready" && st.hidden)) return null;
  if (view === "needsBuild") {
    // a build too old for the published code: a button would never work — the words say where to get the new build
    return <Banner tone="warn" testID="update-bar" title={t("upd.needsBuild.title")} hint={t("upd.needsBuild.hint")} />;
  }
  return (
    <Banner
      tone="info"
      testID="update-bar"
      title={t(st.applying ? "upd.applying" : "upd.ready.title")}
      hint={st.applying ? undefined : t("upd.ready.hint")}
      action={st.applying ? undefined : { label: t("upd.apply"), onPress: () => void applyDownloadedUpdate() }}
      onClose={st.applying ? undefined : hideStrip}
    />
  );
}
