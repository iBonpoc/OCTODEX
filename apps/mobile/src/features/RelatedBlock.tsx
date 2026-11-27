import { Fragment } from "react";
import { ScrollView } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { relatedOf, type RelatedKind, type RelatedOf } from "@/features/related";
import { Button } from "@/ui/controls";
import { T, type IconKey } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";
import { GroupRow, ListGroup } from "@/ui/groupedList";

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
 * «Связано» (13 §2.7): a group «Связано» of rows «Работа JOB-0012 ›», «Smith ›», «12 Oak St ›», and the one thing it lacks, if the
 * screen names it (`action`). Rows, not chip-buttons: DS §7.5 and rule 12 (founder 27.11.2026, #3064: no column or canvas of
 * buttons; founder 21.11, #2350: «не делать полотна с кнопками»). `line` — the quiet form under a block (a visit's notes): small words with their
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
  const parts = links.map((l) => {
    const label = [t(WORD[l.kind]), l.text].filter(Boolean).join(" ");
    return { l, label, shown: NAMED.includes(l.kind) && l.text ? l.text : label, go: () => router.push(l.href as never) };
  });
  // DS §7.5 / rule 12 (#3065): the parents are rows «›» of one group «Связано», not a line of chip-buttons
  if (!line)
    return (
      <ListGroup title={t("job3.rel.title")} testID="related-line">
        {parts.map(({ l, shown, go }) => (
          <GroupRow key={l.kind} testID={`related-${l.kind}`} title={shown} lead={{ icon: ICON[l.kind] }} chevron onPress={go} />
        ))}
        {/* what is missing here, named in reach of the thumb (#1664) */}
        {action ? <GroupRow key="action" testID={action.testID} title={action.label} lead={{ icon: "plus" }} chevron onPress={action.onPress} /> : null}
      </ListGroup>
    );
  // the quiet line under a block (a visit's notes): small words with their icons, «·» between them, no plates
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} testID="related-line">
      <RowView style={{ flexWrap: "nowrap", alignItems: "center" }}>
        {parts.map(({ l, label, shown, go }, i) => (
          <Fragment key={l.kind}>
            {i > 0 ? (
              <T v="caption" tone="mut">
                ·
              </T>
            ) : null}
            <Button testID={`related-${l.kind}`} label={shown} icon={ICON[l.kind]} size="sm" variant="ghost" accessibilityLabel={`${t("job3.rel.title")}: ${label}`} onPress={go} />
          </Fragment>
        ))}
        {action ? <Button testID={action.testID} label={`${action.label} ›`} icon="plus" size="sm" variant="ghost" onPress={action.onPress} /> : null}
      </RowView>
    </ScrollView>
  );
}
