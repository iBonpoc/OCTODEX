import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { EstimateCardBody, estimateSubtitle } from "@/features/EstimateCard";
import { Empty, Screen } from "@/ui/surfaces";
import { ActionBar } from "@/ui/actionBar";
import { useDevice } from "@/theme/ThemeProvider";
import { canSeeEstimate } from "@/features/access";
import { NotFound } from "@/ui/emptyStates";

/** Estimate: send by link (SMS/email), client view, PDF, on-site signature, deposit → job in the plan (body — features/EstimateCard). */
export default function EstimateScreen() {
  const { id, send } = useLocalSearchParams<{ id: string; send?: string }>();
  const { db, role, mode } = useStore();
  const { t } = useI18n();
  const { wide } = useDevice();
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
  // #1412 (DS §7.3, §8.9, Б4): «⋯» in the header, the one main button pinned at the bottom on a phone, at the top of the content from 820
  return (
    <EstimateCardBody
      e={e}
      openSend={send === "1"}
      frame={({ more, main, mainBar, body }) => (
        <Screen
          testID="estimate-screen"
          title={[e.number, e.title].filter(Boolean).join(" · ") || t("est.detail")}
          back={back}
          subtitle={estimateSubtitle(db, e)}
          right={more}
          footer={mainBar ? <ActionBar testID="est-view-actionbar" main={mainBar} /> : undefined}
        >
          {wide ? main : null}
          {body}
        </Screen>
      )}
    />
  );
}
