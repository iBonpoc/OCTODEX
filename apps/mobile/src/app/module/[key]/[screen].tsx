/**
 * A module's own screen (spec 33 П20.3): /module/<key>/<screen>. The core knows no trade —
 * the module lists its screens in its ModuleDef (src/modules/registry.ts). Unknown module or screen → an empty state.
 * The app's bottom tabs and side menu stay over a module's lists and cards; its full-screen ones (the canvas) hide them.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useI18n } from "@/i18n";
import { moduleFullScreen, moduleScreen } from "@/modules/registry";
import { useHideTabBar } from "@/nav/tabBarHide";
import { Empty, Screen } from "@/ui/surfaces";

export default function ModuleScreenRoute() {
  const { key, screen } = useLocalSearchParams<{ key: string; screen: string }>();
  const { t } = useI18n();
  const load = moduleScreen(key, screen);
  // a canvas takes the whole screen (ModuleDef.fullScreen; DS Б11): no bottom tabs on the phone, no side menu from 820 (#1426)
  useHideTabBar(moduleFullScreen(key, screen));
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
