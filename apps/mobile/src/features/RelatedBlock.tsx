import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { relatedOf, type RelatedKind, type RelatedOf } from "@/features/related";
import { Button } from "@/ui/controls";
import type { IconKey } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";

const WORD: Record<RelatedKind, DictKey> = {
  lead: "job3.rel.lead",
  customer: "job3.rel.customer",
  property: "job3.rel.property",
  estimate: "job3.rel.estimate",
  job: "job3.rel.job",
  invoice: "job3.rel.invoice",
};
const ICON: Record<RelatedKind, IconKey> = { lead: "inbox", customer: "user", property: "pin", estimate: "invoice", job: "wrench", invoice: "dollar" };

/** «Связано» under the header (13 §2.7): «Работа JOB-0012 › · Клиент Smith › · 12 Oak St ›». Nothing to show → nothing. */
export function RelatedBlock({ of }: { of: RelatedOf }) {
  const { db, role } = useStore();
  const { t } = useI18n();
  const links = relatedOf(db, of, role);
  if (!links.length) return null;
  return (
    <RowView style={{ flexWrap: "wrap" }}>
      {links.map((l) => {
        const label = [t(WORD[l.kind]), l.text].filter(Boolean).join(" ");
        return <Button key={l.kind} label={label} icon={ICON[l.kind]} size="sm" variant="ghost" accessibilityLabel={`${t("job3.rel.title")}: ${label}`} onPress={() => router.push(l.href as never)} />;
      })}
    </RowView>
  );
}
