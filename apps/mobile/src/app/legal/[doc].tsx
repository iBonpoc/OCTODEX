import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space } from "@octo/design-tokens";
import { editionLabel, isLegalDoc, LEGAL_VERSIONS, type LegalDoc } from "@/features/legal";
import { useI18n, type DictKey } from "@/i18n";
import { StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, Empty, Screen } from "@/ui/surfaces";
import { NotFound } from "@/ui/emptyStates";

/** the sections of each draft (i18n legal.<doc>.<n>.t / .b) — the outline of legal/01 §3.2 (Terms) and §3.3 (Privacy) */
const SECTIONS: Record<LegalDoc, number> = { terms: 8, privacy: 7 };

/**
 * /legal/terms, /legal/privacy (7а-1): the DRAFT of the Terms of Service and the Privacy Policy, inside the app until
 * the documents have their own web address (docs/specs/19 §5.5 q.1). Open without signing in. The English text governs.
 * A new edition: a new date in features/legal.ts LEGAL_VERSIONS + a new migration (app.legal_current_version).
 */
export default function LegalDocument() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const { t, lang } = useI18n();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/help"));
  if (!isLegalDoc(doc))
    return (
      <Screen title={t("support.documents")} back={back}>
        <NotFound testID="legal-not-found" title={t("legal.notFound")} listLabel={t("empty.toDocs")} onList={back} />
      </Screen>
    );
  const n = Array.from({ length: SECTIONS[doc] }, (_, i) => i + 1);
  return (
    <Screen title={t(`legal.${doc}.title`)} back={back}>
      <View testID={`legal-${doc}`} style={{ gap: space[3] }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] }}>
          <StatusChip status="warn" label={t("legal.draft")} />
          <T v="caption" tone="mut">
            {t("legal.edition", { date: editionLabel(LEGAL_VERSIONS[doc]) })}
          </T>
        </View>
        {lang !== "en" ? (
          <T v="caption" tone="mut">
            {t("legal.englishGoverns")}
          </T>
        ) : null}
        <Card>
          <View style={{ gap: space[3] }}>
            {n.map((i) => (
              <View key={i} style={{ gap: space[1] }}>
                <T v="heading">{t(`legal.${doc}.${i}.t` as DictKey)}</T>
                <T v="body">{t(`legal.${doc}.${i}.b` as DictKey)}</T>
              </View>
            ))}
          </View>
        </Card>
        <T v="caption" tone="mut">
          {t(`legal.${doc}.basis`)}
        </T>
      </View>
    </Screen>
  );
}
