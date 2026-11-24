import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { EstimateObject } from "@/features/EstimateCard";
import { Empty, Screen } from "@/ui/surfaces";
import { canSeeEstimate } from "@/features/access";
import { NotFound } from "@/ui/emptyStates";

/** «Смета — просмотр» (Object template): send by link (SMS/email), client view, PDF, on-site signature, deposit → job (features/EstimateCard `EstimateObject`). */
export default function EstimateScreen() {
  const { id, send } = useLocalSearchParams<{ id: string; send?: string }>();
  const { db, role, mode } = useStore();
  const { t } = useI18n();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const e = db.estimates.find((x) => x.id === id);
  if (!e)
    return (
      <Screen title={t("est.detail")} back={back}>
        <NotFound testID="estimate-not-found" title={t("est.notFound")} listLabel={t("empty.toEstimates")} onList={() => router.replace("/estimates")} />
      </Screen>
    );
  // not the tech's (#868): no access, as the server would answer
  if (!canSeeEstimate(db, { role, mode, me: db.me }, e.id))
    return (
      <Screen title={t("est.detail")} back={back}>
        <Empty icon="invoice" title={t("mny.noAccess")} testID="no-access" />
      </Screen>
    );
  // prototype v2 #2350: the Object template — the header with the status and the sum once, the icons, ONE next step under them
  return <EstimateObject key={e.id} e={e} openSend={send === "1"} back={back} />;
}
