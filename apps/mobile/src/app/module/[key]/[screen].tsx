/**
 * A module's own screen (spec 33 П20.3): /module/<key>/<screen>. The core knows no trade —
 * the module lists its screens in its ModuleDef (src/modules/registry.ts). Unknown module or screen → an empty state.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useI18n } from "@/i18n";
import { moduleScreen } from "@/modules/registry";
import { Empty, Screen } from "@/ui/surfaces";

export default function ModuleScreenRoute() {
  const { key, screen } = useLocalSearchParams<{ key: string; screen: string }>();
  const { t } = useI18n();
  const load = moduleScreen(key, screen);
  if (!load) {
    const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
    return (
      <Screen title={t("mod.title")} back={back}>
        <Empty icon="sliders" title={t("mod.noScreen")} />
      </Screen>
    );
  }
  const Comp = load();
  return <Comp />;
}
