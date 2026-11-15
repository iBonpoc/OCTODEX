import { Platform, View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { languages, useI18n, type Lang } from "@/i18n";
import { useTheme, type ThemePref } from "@/theme/ThemeProvider";
import { Button, ChoiceChips, Segmented, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { useHints } from "@/ui/hints";
import { canSeeShowcase } from "@/features/showcase/access";
import { useHapticsEnabled } from "@/ui/haptics";
import { usePlanShowDone } from "@/features/prefs";
import { LocationSetting } from "@/features/LocationParts";
import { PushSettingsSection } from "@/features/PushSettings";
import { Card, Divider, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { editionLabel, LEGAL_VERSIONS, legalHref } from "@/features/legal";
import Constants from "expo-constants";
import { component, space } from "@octo/design-tokens";
import { BUILD } from "@/config/version";
import { BrandLogo } from "@/ui/brand";

/**
 * «Настройки приложения» (spec 26; was «Мои настройки», docs/specs/05 §4.1): how the app looks and behaves for me —
 * theme, language, the Plan, location, tips, about, «Для проверки» in the demo. The account, my signature, the role and
 * deleting the account are in «Профиль и аккаунт» (/settings/profile). Company-wide settings live in /company.
 */
export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const { online, setOnline, resetDemo, mode, role } = useStore();
  const { pref, setPref } = useTheme();
  const toast = useToast();
  const hints = useHints();
  const [showDone, setShowDone] = usePlanShowDone();
  const [hapticsOn, setHapticsOn] = useHapticsEnabled();
  // «Для проверки» (offline, reset) — demo only (docs/specs/13 §2.3)
  return (
    <Screen title={t("nav.mySettings")}>
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
      {/* «Дизайн-система» (#1093): the showcase — the owner's (and the demo's) view of every token and component */}
      {canSeeShowcase(mode, role) ? (
        <Card>
          <View testID="settings-design-system">
            <ListRow title={t("ds.title")} subtitle={t("ds.rowHint")} onPress={() => router.push("/settings/design-system")} />
          </View>
        </Card>
      ) : null}
      {/* «Вибрация» (DS §15.6, В-20): a setting of this device, on by default; the web has no vibration, so no switch there */}
      {Platform.OS !== "web" ? (
        <Card>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="heading" style={{ flex: 1 }}>
              {t("haptics.title")}
            </T>
            <Toggle label={t("haptics.title")} on={hapticsOn} onChange={setHapticsOn} />
          </RowView>
          <T v="caption" tone="mut">{t("haptics.hint")}</T>
        </Card>
      ) : null}
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

      {/* «Уведомления» (spec 27 §5, push №1): its own group, shown only where the switch works */}
      <PushSettingsSection />
      {/* 7а-1 (legal/01 §3.5 «О приложении»): the documents with their editions, help */}
      <SectionTitle title={t("settings.about")} />
      <Card>
        <View testID="settings-about">
          {/* GoRix «О приложении» (DS §18.2): the logo, the version and the build — still, no move */}
          <View testID="about-brand" style={{ alignItems: "center", gap: space[2], paddingVertical: space[4] }}>
            <BrandLogo width={component.brand.about} />
            <T v="caption" tone="mut" tabular>
              {t("brand.about.version", { v: Constants.expoConfig?.version ?? "1.0.0", b: BUILD || "dev" })}
            </T>
          </View>
          <Divider />
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

    </Screen>
  );
}
