import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { EstimateCardBody, estimateSubtitle } from "@/features/EstimateCard";
import { Empty, Screen } from "@/ui/surfaces";

/** Estimate: send by link (SMS/email), client view, PDF, on-site signature, deposit → job in the plan (body — features/EstimateCard). */
export default function EstimateScreen() {
  const { id, send } = useLocalSearchParams<{ id: string; send?: string }>();
  const { db } = useStore();
  const { t } = useI18n();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const e = db.estimates.find((x) => x.id === id);
  if (!e)
    return (
      <Screen title={t("est.detail")} back={back}>
        <Empty icon="invoice" title={t("clients.empty")} />
      </Screen>
    );
  return (
    <Screen
      title={[e.number, e.title].filter(Boolean).join(" · ") || t("est.detail")}
      back={back}
      subtitle={estimateSubtitle(db, e)}
    >
      <EstimateCardBody e={e} openSend={send === "1"} />
    </Screen>
  );
}
