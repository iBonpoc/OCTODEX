import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useAuth } from "@/cloud/auth";
import type { Role } from "@/data/types";
import { languages, useI18n, type Lang } from "@/i18n";
import { roleHome } from "@/nav/roles";
import { useTheme, type ThemePref } from "@/theme/ThemeProvider";
import { Button, Segmented, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { useHints } from "@/ui/hints";
import { Card, RowView, Screen, SectionTitle } from "@/ui/surfaces";

/**
 * "My settings" (docs/specs/05-menu-and-settings.md §4.1): only what concerns me and this device.
 * Company-wide settings live in "Company settings" (/company).
 */
export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const { role, setRole, online, setOnline, resetDemo, mode, companyName, availableRoles, queue, syncError, refresh, loading } = useStore();
  const auth = useAuth();
  const { pref, setPref } = useTheme();
  const toast = useToast();
  const hints = useHints();
  const changeRole = (r: Role) => {
    setRole(r);
    router.navigate(`/${roleHome[r]}`);
  };
  // "For testing" is shown in the demo and to people who hold several roles (the owner checking each screen)
  const testing = mode === "demo" || availableRoles.length > 1;
  return (
    <Screen title={t("settings.title")}>
      <SectionTitle title={t("account.title")} />
      <Card>
        {mode === "cloud" ? (
          <>
            <T v="body" w="semibold">
              {companyName}
            </T>
            <T v="caption" tone="mut">
              {auth.email}
            </T>
            <T v="caption" tone={syncError ? "bad" : queue.length ? "warn" : "ok"}>
              {syncError ? t("account.error", { msg: syncError }) : queue.length ? t("account.pending", { n: queue.length }) : t("account.synced")}
            </T>
            <RowView style={{ flexWrap: "wrap" }}>
              <Button label={t("account.refresh")} icon="sync" variant="secondary" disabled={loading} onPress={refresh} />
              <Button label={t("account.signOut")} variant="ghost" onPress={auth.signOut} />
            </RowView>
          </>
        ) : auth.session ? (
          <>
            <T v="caption" tone="mut">
              {auth.email} · {t("account.noCompany")}
            </T>
            <RowView style={{ flexWrap: "wrap" }}>
              <Button label={t("company.create")} icon="plus" onPress={() => router.push("/auth/company")} />
              <Button label={t("account.signOut")} variant="ghost" onPress={auth.signOut} />
            </RowView>
          </>
        ) : (
          <>
            <T v="caption" tone="mut">
              {t("account.demo")}
            </T>
            <Button label={t("account.signIn")} icon="user" onPress={() => router.push("/auth/sign-in")} />
          </>
        )}
      </Card>

      <SectionTitle title={t("settings.look")} />
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
        <T v="heading">{t("settings.hints")}</T>
        <T v="caption" tone="mut">
          {t("settings.hintsText")}
        </T>
        <Button label={t("more.showHints")} icon="help" variant="secondary" onPress={hints.reset} />
      </Card>

      {testing ? (
        <>
          <SectionTitle title={t("settings.testing")} />
          <T v="caption" tone="mut">
            {t("settings.testingHint")}
          </T>
          {availableRoles.length > 1 ? (
            <Card>
              <T v="heading">{t("more.role")}</T>
              <Segmented<Role>
                full
                value={role}
                onChange={changeRole}
                items={(["tech", "dispatcher", "director", "sales"] as Role[]).filter((r) => availableRoles.includes(r)).map((r) => ({ key: r, label: t(`role.${r}`) }))}
              />
              <T v="caption" tone="mut">
                {t("role.hint")}
              </T>
            </Card>
          ) : null}
          <Card>
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
            {mode === "demo" ? (
              <Button label={t("more.resetDemo")} icon="sync" variant="secondary" onPress={() => toast.show(t("more.resetDone"), resetDemo())} />
            ) : null}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
