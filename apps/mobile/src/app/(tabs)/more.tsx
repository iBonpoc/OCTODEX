import { View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Role } from "@/data/types";
import { languages, useI18n, type Lang } from "@/i18n";
import { roleHome } from "@/nav/roles";
import { useTheme, type ThemePref } from "@/theme/ThemeProvider";
import { Segmented, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, RowView, Screen } from "@/ui/surfaces";

/** Settings for this device: role, theme, language, offline test switch. */
export default function More() {
  const { t, lang, setLang } = useI18n();
  const { role, setRole, online, setOnline } = useStore();
  const { pref, setPref } = useTheme();
  const toast = useToast();
  const changeRole = (r: Role) => {
    setRole(r);
    router.navigate(`/${roleHome[r]}`);
  };
  return (
    <Screen title={t("more.title")}>
      <Card>
        <T v="heading">{t("more.role")}</T>
        <Segmented<Role>
          full
          value={role}
          onChange={changeRole}
          items={[
            { key: "tech", label: t("role.tech") },
            { key: "dispatcher", label: t("role.dispatcher") },
            { key: "director", label: t("role.director") },
          ]}
        />
        <T v="caption" tone="mut">
          {t("role.hint")}
        </T>
      </Card>
      <Card>
        <T v="heading">{t("more.theme")}</T>
        <Segmented<ThemePref>
          full
          value={pref}
          onChange={setPref}
          items={[
            { key: "system", label: t("more.themeSystem") },
            { key: "dark", label: t("more.dark") },
            { key: "light", label: t("more.light") },
          ]}
        />
      </Card>
      <Card>
        <T v="heading">{t("more.language")}</T>
        <Segmented<Lang> full value={lang} onChange={setLang} items={languages.map((l) => ({ key: l.id, label: l.label }))} />
      </Card>
      <Card>
        <T v="heading">{t("more.data")}</T>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="body" style={{ flex: 1 }}>
            {t("offline.toggle")}
          </T>
          <Toggle
            label={t("offline.toggle")}
            on={!online}
            onChange={(off) => {
              const sent = setOnline(!off);
              if (!off) toast.show(t("offline.synced", { n: sent }));
            }}
          />
        </RowView>
      </Card>
      <View style={{ paddingHorizontal: space[2] }}>
        <T v="caption" tone="mut">
          {t("more.version", { v: Constants.expoConfig?.version ?? "1.0.0" })}
        </T>
      </View>
    </Screen>
  );
}
