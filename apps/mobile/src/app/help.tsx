import { Linking, Platform, View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { mailto, SUPPORT_EMAIL, SUPPORT_PLACEHOLDER } from "@/config/support";
import { editionLabel, LEGAL_VERSIONS, legalHref } from "@/features/legal";
import { useVersionLabel } from "@/features/version";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, Divider, ListRow, Screen, SectionTitle } from "@/ui/surfaces";
import { StatusNote } from "@/ui/statusNote";

/**
 * «Помощь и поддержка» (7а-1; App Store 1.5 — a way to reach the developer, docs/specs/14-app-store.md §1 п.3;
 * 05 §2): the support address, «Написать в поддержку», «Сообщить о проблеме» (an email with the app version and the
 * platform), the documents. Support explains how the app works — not what the law requires (legal/01 §3.2а).
 * Open without signing in.
 */
export default function Help() {
  const { t } = useI18n();
  const version = useVersionLabel();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  const open = (url: string) => Linking.openURL(url).catch(() => {});
  return (
    <Screen title={t("support.title")} back={back}>
      <View testID="help-screen" style={{ gap: space[3] }}>
        <Card>
          <View style={{ gap: space[2] }}>
            <T v="caption" tone="mut">
              {t("support.writeHint")}
            </T>
            <T v="body" w="semibold">
              {SUPPORT_EMAIL}
            </T>
            {SUPPORT_PLACEHOLDER ? (
              <StatusNote tone="warn">{t("support.placeholder")}</StatusNote>
            ) : null}
            <Button label={t("support.write")} icon="mail" full onPress={() => open(mailto(SUPPORT_EMAIL, t("support.writeSubject")))} />
            <Button
              label={t("support.report")}
              icon="alert"
              variant="secondary"
              full
              onPress={() => open(mailto(SUPPORT_EMAIL, t("support.reportSubject"), t("support.reportBody", { version, platform: Platform.OS })))}
            />
          </View>
        </Card>
        <T v="caption" tone="mut">
          {t("support.noAdvice")}
        </T>
        <SectionTitle title={t("support.documents")} />
        <Card>
          <ListRow title={t("legal.terms.title")} subtitle={t("legal.edition", { date: editionLabel(LEGAL_VERSIONS.terms) })} onPress={() => router.push(legalHref("terms"))} />
          <Divider />
          <ListRow title={t("legal.privacy.title")} subtitle={t("legal.edition", { date: editionLabel(LEGAL_VERSIONS.privacy) })} onPress={() => router.push(legalHref("privacy"))} />
        </Card>
        <T v="micro" tone="mut">
          {version}
        </T>
      </View>
    </Screen>
  );
}
