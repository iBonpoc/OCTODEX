import { Fragment } from "react";
import { ScrollView } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { relatedOf, type RelatedKind, type RelatedOf } from "@/features/related";
import { Button } from "@/ui/controls";
import { T, type IconKey } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";

const WORD: Record<RelatedKind, DictKey> = {
  lead: "job3.rel.lead",
  customer: "job3.rel.customer",
  property: "job3.rel.property",
  estimate: "job3.rel.estimate",
  job: "job3.rel.job",
  invoice: "job3.rel.invoice",
};
/** the client and the property are known by their icon and name — the word is only for the screen reader (founder 16.11, #1844) */
const NAMED: RelatedKind[] = ["customer", "property"];
const ICON: Record<RelatedKind, IconKey> = { lead: "inbox", customer: "user", property: "pin", estimate: "invoice", job: "wrench", invoice: "dollar" };

/**
 * «Связано» (13 §2.7): «Работа JOB-0012 › · Клиент Smith › · 12 Oak St ›», and the one thing it lacks, if the screen names it
 * (`action`). Never more than one row (founder 21.11, #2350: «не делать полотна с кнопками… переносятся по строкам — полотно из
 * чипов»): what does not fit scrolls sideways. `line` — the quiet form under a block (a visit's notes): small words with their
 * icons, «·» between them, no plates; `hide` — what the screen already shows (its header names the client and the address:
 * «одна и та же информация на экране — один раз»). Nothing to show → nothing.
 */
export function RelatedBlock({
  of,
  action,
  line,
  hide = [],
}: {
  of: RelatedOf;
  action?: { label: string; onPress: () => void; testID: string };
  line?: boolean;
  hide?: RelatedKind[];
}) {
  const { db, role } = useStore();
  const { t } = useI18n();
  const links = relatedOf(db, of, role).filter((l) => !hide.includes(l.kind));
  if (!links.length && !action) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} testID="related-line">
      <RowView style={{ flexWrap: "nowrap", alignItems: "center" }}>
        {links.map((l, i) => {
          const label = [t(WORD[l.kind]), l.text].filter(Boolean).join(" ");
          const shown = NAMED.includes(l.kind) && l.text ? l.text : label;
          const a11y = `${t("job3.rel.title")}: ${label}`;
          const go = () => router.push(l.href as never);
          // the quiet line: a ghost button each, «·» between; otherwise a chip with a plate and «›» — it reads as a thing to
          // press (DS §12.3 п.6, #1495)
          return line ? (
            <Fragment key={l.kind}>
              {i > 0 ? (
                <T v="caption" tone="mut">
                  ·
                </T>
              ) : null}
              <Button testID={`related-${l.kind}`} label={shown} icon={ICON[l.kind]} size="sm" variant="ghost" accessibilityLabel={a11y} onPress={go} />
            </Fragment>
          ) : (
            <Button key={l.kind} testID={`related-${l.kind}`} label={`${shown} ›`} icon={ICON[l.kind]} size="sm" variant="secondary" accessibilityLabel={a11y} onPress={go} />
          );
        })}
        {/* what is missing here, named in reach of the thumb (#1664) */}
        {action ? <Button testID={action.testID} label={`${action.label} ›`} icon="plus" size="sm" variant="ghost" onPress={action.onPress} /> : null}
      </RowView>
    </ScrollView>
  );
}
