import { View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useAuth } from "@/cloud/auth";
import type { Role } from "@/data/types";
import { languages, useI18n, type Lang } from "@/i18n";
import { roleHome } from "@/nav/roles";
import { useTheme, type ThemePref } from "@/theme/ThemeProvider";
import { Button, ChoiceChips, Segmented, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { useHints } from "@/ui/hints";
import { usePlanShowDone } from "@/features/prefs";
import { LocationSetting } from "@/features/LocationParts";
import { PushSettingsSection } from "@/features/PushSettings";
import { Card, Divider, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { editionLabel, LEGAL_VERSIONS, legalHref } from "@/features/legal";

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
  const [showDone, setShowDone] = usePlanShowDone();
  const changeRole = (r: Role) => {
    setRole(r);
    router.navigate(`/${roleHome[r]}`);
  };
  // «Для проверки» (offline, reset) — demo only (docs/specs/13 §2.3). Several roles: the role switch is its own card
  // until «Сменить роль» moves to the profile in ☰ (wave 2).
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
        {/* E2b-2 (docs/specs/07): the employee's own signature for contracts */}
        <Button label={t("est.sig.settingsRow")} icon="pencil" variant="secondary" onPress={() => router.push("/estimate/signature")} />
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
      {/* wave 7б-1: personal, the same on every device (docs/specs/03 §12) */}
      <SectionTitle title={t("pref7b.plan")} />
      <Card>
        <T v="heading">{t("plan5.showDone")}</T>
        <T v="caption" tone="mut">{t("pref7b.showDoneHint")}</T>
        <ChoiceChips
          value={showDone ? "show" : "hide"}
          onChange={(k) => setShowDone(k === "show")}
          items={[
            { key: "hide", label: t("plan5.hideDone") },
            { key: "show", label: t("plan5.showDone") },
          ]}
        />
      </Card>
      {/* wave 7б-2: location during visits — only when the company allows it (docs/specs/03 §12) */}
      <LocationSetting />
      <Card>
        <T v="heading">{t("settings.hints")}</T>
        <T v="caption" tone="mut">
          {t("settings.hintsText")}
        </T>
        <Button label={t("more.showHints")} icon="help" variant="secondary" onPress={hints.reset} />
      </Card>

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

      {/* 7а-1 (legal/01 §3.5 «Мои настройки → О приложении»): the documents with their editions, help */}
      <PushSettingsSection />
      <SectionTitle title={t("settings.about")} />
      <Card>
        <View testID="settings-about">
          <ListRow title={t("legal.terms.title")} subtitle={t("legal.edition", { date: editionLabel(LEGAL_VERSIONS.terms) })} onPress={() => router.push(legalHref("terms"))} />
          <Divider />
          <ListRow title={t("legal.privacy.title")} subtitle={t("legal.edition", { date: editionLabel(LEGAL_VERSIONS.privacy) })} onPress={() => router.push(legalHref("privacy"))} />
          <Divider />
          <ListRow title={t("support.title")} subtitle={t("support.subtitle")} onPress={() => router.push("/help")} />
        </View>
      </Card>

      {mode === "demo" ? (
        <>
          <SectionTitle title={t("settings.testing")} />
          <T v="caption" tone="mut">
            {t("settings.testingHint")}
          </T>
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
            <Button label={t("more.resetDemo")} icon="sync" variant="secondary" onPress={() => toast.show(t("more.resetDone"), resetDemo())} />
          </Card>
        </>
      ) : null}

      {/* 7а-2b (S22, Apple 5.1.1(v)): the very bottom; signed in with or without a company, and in the demo (it explains) */}
      <Card>
        <View testID="settings-delete-account">
          <ListRow title={t("acct.title")} subtitle={t("acct.row")} onPress={() => router.push("/settings/delete-account")} />
        </View>
      </Card>
    </Screen>
  );
}
