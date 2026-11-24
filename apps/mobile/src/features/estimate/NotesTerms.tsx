import { GroupRow, ListGroup } from "@/ui/groupedList";
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
import { firstWords, termsFallbackToEnglish, termsShown, termsToWrite } from "./notesTerms";

/** «согласуйте с юристом» under a Terms text that speaks of arbitration (#1325: a warning only, nothing is blocked) */
export function ArbitrationWarn({ text, testID, short }: { text: string | undefined; testID?: string; short?: boolean }) {
  const { t } = useI18n();
  const { c } = useTheme();
  if (!mentionsArbitration(text)) return null;
  return (
    <View testID={testID}>
      <RowView style={{ alignItems: "flex-start", gap: space[1] }}>
        <Icon name="alert" s={size.iconSm} color={c.status.warn.text} />
        <T v="caption" tone="warn" style={{ flex: 1 }}>
          {t(short ? "est.nt.arbShort" : "est.terms.arbitrationWarn")}
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
  /** signed by the client (as /p/ and the card count it): an old one without its own text shows what was signed */
  signed?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<null | "note" | "terms">(null);
  const [draft, setDraft] = useState("");
  const terms = termsShown(p.doc, p.company, p.lang, p.signed);
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
      {/* #2387: the note and the terms are a group of GroupRows, as the totals above (one look); the client's language a quiet mark */}
      <ListGroup inset={space[4]}>
        <View testID="est-notes-row">
          <GroupRow wrap title={t("est.nt.notes")} subtitle={firstWords(p.doc.note) ?? empty} chevron={!p.locked} onPress={p.locked ? undefined : () => show("note")} />
        </View>
        {p.noTerms ? null : (
          <View testID="est-terms-row">
            <GroupRow
              wrap
              title={t("est.nt.terms")}
              subtitle={firstWords(terms.text) ?? empty}
              value={p.lang.toUpperCase()}
              valueTestID="est-terms-lang"
              valueMark
              chevron={!p.locked}
              onPress={p.locked ? undefined : () => show("terms")}
            />
          </View>
        )}
      </ListGroup>
      {p.noTerms ? null : <ArbitrationWarn text={terms.text} testID="est-terms-arb" short />}
      {/* DS Б1: a form sheet's «Сохранить» is its footer (never a button in the body); «✕» and a swipe keep the text too (as before) */}
      <Sheet
        visible={open !== null}
        onClose={done}
        title={open === "terms" ? t("est.nt.terms") : t("est.nt.notes")}
        footer={
          <View testID="est-nt-done">
            <Button label={t("ue.save")} icon="check" full onPress={done} />
          </View>
        }
      >
        <View testID={open === "terms" ? "est-terms-sheet" : "est-notes-sheet"} style={{ gap: space[3] }}>
          <View testID={open === "terms" ? "est-terms-field" : "est-notes-field"}>
            <TextField type="note" value={draft} onChangeText={(v) => setDraft(open === "terms" ? Array.from(v).slice(0, TERMS_MAX).join("") : v)} placeholder={open === "terms" ? t("est.nt.termsHint") : t("est.nt.notesHint")} />
          </View>
          {open === "terms" ? (
            <>
              <T v="caption" tone="mut">
                {t("est.nt.lang", { lang: DOC_LANG_LABEL[p.lang] })}
              </T>
              {/* the company has no Terms in the client's language: the English ones came (one line, the director's call 13.11) */}
              {termsFallbackToEnglish({ terms: draft }, p.company, p.lang) ? (
                <View testID="est-terms-fallback">
                  <T v="caption" tone="mut">
                    {t("est.nt.fallbackEn")}
                  </T>
                </View>
              ) : null}
              <ArbitrationWarn text={draft} testID="est-terms-sheet-arb" />
            </>
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}
