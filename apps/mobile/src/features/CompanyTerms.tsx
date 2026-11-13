import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import type { Company } from "@/data/types";
import { DOC_LANG_LABEL, DOC_LANGS, useI18n, type DocLang } from "@/i18n";
import { Button, TextField, useReadOnly } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";
import { ArbitrationWarn } from "@/features/estimate/NotesTerms";
import { companyTermsWrite, termsLangsShown } from "@/features/estimate/notesTerms";

/**
 * The company's default Terms by the client's language (DS §8.12, spec 40 §6, #1304): English always on the screen (the
 * fallback — a new estimate takes the client's language, else English), «Добавить: Español / Русский» adds a field; each
 * says «согласуйте с юристом» when it speaks of arbitration. Writes `termsByLang` (the store keeps the old single `terms`
 * equal to English, rule 16 step 1).
 */
export function CompanyTerms({ est, onChange }: { est: Company["estimate"]; onChange: (next: Company["estimate"]) => void }) {
  const { t } = useI18n();
  const ro = useReadOnly();
  const [added, setAdded] = useState<DocLang[]>([]);
  const shown = termsLangsShown(est, added);
  const valueOf = (l: DocLang) => est.termsByLang?.[l] ?? (l === "en" ? (est.terms ?? "") : "");
  const write = (l: DocLang, v: string) => onChange({ ...est, termsByLang: companyTermsWrite(est, l, v) });
  return (
    <View testID="co-terms" style={{ gap: space[2] }}>
      <T v="heading">{t("co.tl.title")}</T>
      <T v="caption" tone="mut">
        {t("co.tl.hint")}
      </T>
      {shown.map((l) => (
        <View key={l} testID={`co-terms-${l}`} style={{ gap: space[1] }}>
          {/* the language above its field, on the screen (design review: two fields with no name get mixed up) */}
          <T v="caption" w="semibold">
            {DOC_LANG_LABEL[l]}
          </T>
          <TextField type="note" label={t("co.tl.field", { lang: DOC_LANG_LABEL[l] })} value={valueOf(l)} onChangeText={(v) => write(l, v)} />
          <ArbitrationWarn text={valueOf(l)} testID={`co-terms-arb-${l}`} />
        </View>
      ))}
      {ro ? null : (
        <RowView style={{ flexWrap: "wrap", gap: space[3] }}>
          {DOC_LANGS.filter((l) => !shown.includes(l)).map((l) => (
            <View key={l} testID={`co-terms-add-${l}`}>
              <Button label={t("co.tl.add", { lang: DOC_LANG_LABEL[l] })} icon="plus" variant="ghost" size="sm" onPress={() => setAdded((a) => [...a, l])} />
            </View>
          ))}
        </RowView>
      )}
    </View>
  );
}
