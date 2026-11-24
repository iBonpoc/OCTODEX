import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { canSeeLead } from "@/features/leads";
import { LeadObject, leadSectionOf, type LeadSectionKey } from "@/features/lead/LeadCard";
import { Empty, Screen } from "@/ui/surfaces";
import { NotFound } from "@/ui/emptyStates";

/**
 * Лид — шаблон «Объект» (prototype v2, object-cards «Лид», BUILD-SPEC §2.11; the body — features/lead/LeadCard `LeadObject`).
 * The open section is `/lead/<id>?tab=<history|tasks|estimates|files>`; «назад» leaves the lead, not the section.
 */
export default function LeadScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const { db, role } = useStore();
  const { t } = useI18n();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/leads"));
  const l = db.leads.find((x) => x.id === id);
  if (!l || !canSeeLead(role, db.me, l)) {
    return (
      <Screen title={t("lead.card")} back={back}>
        {l ? <Empty icon="inbox" title={t("lead.noAccess")} /> : <NotFound testID="lead-not-found" title={t("lead.notFound")} listLabel={t("empty.toLeads")} onList={() => router.replace("/leads")} />}
      </Screen>
    );
  }
  const onSection = (k: LeadSectionKey) => router.setParams({ tab: k === "overview" ? undefined : k });
  return <LeadObject key={l.id} l={l} section={leadSectionOf(tab)} onSection={onSection} back={back} />;
}
