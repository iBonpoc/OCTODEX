import { useState } from "react";
import { View } from "react-native";
import { size, space } from "@octo/design-tokens";
import type { Company, EstimateDoc } from "@/data/types";
import { useI18n } from "@/i18n";
import { DOC_LANG_LABEL, type DocLang } from "@/i18n/translate";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, TextField } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Sheet } from "@/ui/overlays";
import { Card, Divider, ListRow, RowView } from "@/ui/surfaces";
import { TERMS_MAX, cleanTerms } from "@/features/estimateTerms";
import { mentionsArbitration } from "@/features/termsArbitration";
import { firstWords, termsShown, termsToWrite } from "./notesTerms";

/** «согласуйте с юристом» under a Terms text that speaks of arbitration (#1325: a warning only, nothing is blocked) */
export function ArbitrationWarn({ text, testID }: { text: string | undefined; testID?: string }) {
  const { t } = useI18n();
  const { c } = useTheme();
  if (!mentionsArbitration(text)) return null;
  return (
    <View testID={testID}>
      <RowView style={{ alignItems: "flex-start", gap: space[1] }}>
        <Icon name="alert" s={size.iconSm} color={c.status.warn.text} />
        <T v="caption" tone="warn" style={{ flex: 1 }}>
          {t("est.terms.arbitrationWarn")}
        </T>
      </RowView>
    </View>
  );
}

/**
 * «Notes — заметка» and «Terms — условия» (DS §8.12): two rows, each opens a small sheet with a field and «Готово». The
 * row shows the first words, nothing — «Не заполнено». Terms: the language the client reads them in; an estimate made
 * before #1304 shows the company's default and gets its own text only once it is changed here. `noTerms` — a template
 * (it never carries Terms, spec 40 §7); `locked` — a signed estimate (read only).
 */
export function NotesTerms(p: {
  doc: Pick<EstimateDoc, "note" | "terms">;
  company: Pick<Company, "estimate"> | null | undefined;
  lang: DocLang;
  onNote: (v: string) => void;
  onTerms: (v: string) => void;
  noTerms?: boolean;
  locked?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<null | "note" | "terms">(null);
  const [draft, setDraft] = useState("");
  const terms = termsShown(p.doc, p.company, p.lang);
  const show = (which: "note" | "terms") => {
    if (p.locked) return;
    setDraft(which === "note" ? (p.doc.note ?? "") : terms.text);
    setOpen(which);
  };
  const done = () => {
    if (open === "note") {
      if (draft !== (p.doc.note ?? "")) p.onNote(draft);
    } else if (open === "terms") {
      // an old estimate keeps no key until its text is really changed (its client goes on reading the default)
      const v = termsToWrite(p.doc, terms.text, cleanTerms(draft) ?? "");
      if (v !== null) p.onTerms(v);
    }
    setOpen(null);
  };
  const empty = t("est.nt.empty");
  return (
    <View testID="est-notes-terms">
      <Card>
        <View testID="est-notes-row">
          <ListRow title={t("est.nt.notes")} subtitle={firstWords(p.doc.note) ?? empty} onPress={p.locked ? undefined : () => show("note")} />
        </View>
        {p.noTerms ? null : (
          <>
            <Divider />
            <View testID="est-terms-row">
              <ListRow
                title={t("est.nt.terms")}
                subtitle={`${firstWords(terms.text) ?? empty} · ${DOC_LANG_LABEL[p.lang]}`}
                onPress={p.locked ? undefined : () => show("terms")}
              />
            </View>
            <ArbitrationWarn text={terms.text} testID="est-terms-arb" />
          </>
        )}
      </Card>
      <Sheet visible={open !== null} onClose={done} title={open === "terms" ? t("est.nt.terms") : t("est.nt.notes")}>
        <View testID={open === "terms" ? "est-terms-sheet" : "est-notes-sheet"} style={{ gap: space[3] }}>
          <View testID={open === "terms" ? "est-terms-field" : "est-notes-field"}>
            <TextField type="note" value={draft} onChangeText={(v) => setDraft(open === "terms" ? Array.from(v).slice(0, TERMS_MAX).join("") : v)} placeholder={open === "terms" ? t("est.nt.termsHint") : t("est.nt.notesHint")} />
          </View>
          {open === "terms" ? (
            <>
              <T v="caption" tone="mut">
                {t("est.nt.lang", { lang: DOC_LANG_LABEL[p.lang] })}
              </T>
              <ArbitrationWarn text={draft} testID="est-terms-sheet-arb" />
            </>
          ) : null}
          <View testID="est-nt-done">
            <Button label={t("ue.doneLine")} icon="check" full onPress={done} />
          </View>
        </View>
      </Sheet>
    </View>
  );
}
