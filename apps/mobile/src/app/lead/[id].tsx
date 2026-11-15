import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { canSeeLead, canSeeLeadCost, sourceName } from "@/features/leads";
import { LeadCardBody } from "@/features/lead/LeadCard";
import { Empty, Screen } from "@/ui/surfaces";
import { NotFound } from "@/ui/emptyStates";

/** Lead card (docs/14-leads-spec.md §7.2): the screen around the body shared with the panel on 1280 (features/lead/LeadCard.tsx). */
export default function LeadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, role } = useStore();
  const { t, day, money } = useI18n();
  const l = db.leads.find((x) => x.id === id);
  if (!l || !canSeeLead(role, db.me, l)) {
    return (
      <Screen title={t("lead.card")}>
        {l ? <Empty icon="inbox" title={t("lead.noAccess")} /> : <NotFound testID="lead-not-found" title={t("lead.notFound")} listLabel={t("empty.toLeads")} onList={() => router.replace("/leads")} />}
      </Screen>
    );
  }
  const subtitle = [l.number, sourceName(db, l.sourceId), canSeeLeadCost(role) && l.costCents ? money(l.costCents) : null, day(l.receivedAt)].filter(Boolean).join(" · ");
  return (
    <LeadCardBody
      l={l}
      wrap={(more, body) => (
        <Screen title={l.name} subtitle={subtitle} right={more}>
          {body}
        </Screen>
      )}
    />
  );
}
