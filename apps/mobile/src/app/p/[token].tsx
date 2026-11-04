import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { acceptPortal, fetchPortal, localPortal, type PortalData } from "@/cloud/portal";
import { EstimateView } from "@/features/EstimateView";
import { SignBlock } from "@/features/SignBlock";
import { mainOption, optionTotals, withAddons } from "@/features/estimateDoc";
import { estimateHtml, saveEstimatePdf } from "@/features/estimatePdf";
import { Button, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Empty, Screen, SectionTitle } from "@/ui/surfaces";

/**
 * Client page: opened from the SMS / email link in a phone browser, no app and no sign-in.
 * The client chooses an option and add-ons, signs (E-SIGN consent), sees the deposit; the contractor
 * gets a notification and the job appears in the plan. PDF can be saved at any time.
 */
export default function ClientEstimatePage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const store = useStore();
  const { t, money, day } = useI18n();
  const toast = useToast();
  const local = localPortal(store.db, token ?? "", store.companyName ?? "OCTODEX");
  const [remote, setRemote] = useState<PortalData | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (local || !token) return;
    fetchPortal(token)
      .then(setRemote)
      .catch((e) => setError(String(e?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, !!local]);
  const data = local ?? remote;
  const doc = data?.doc ?? null;
  const [optionId, setOptionId] = useState<string | null>(null);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const back = router.canGoBack() ? () => router.back() : undefined;

  if (!data || !doc) {
    return (
      <Screen title={t("portal.estimate")} back={back}>
        {data === undefined && !error ? (
          <Empty icon="clock" title={t("portal.loading")} />
        ) : (
          <Empty icon="alert" title={error ? t("portal.error", { msg: error }) : t("portal.notFound")} />
        )}
      </Screen>
    );
  }

  const approved = data.status === "approved" && data.approval;
  const chosen = approved ? data.approval!.optionId : optionId ?? mainOption(doc).id;
  const addons = approved ? data.approval!.addonIds : addonIds;
  const base = doc.options.find((o) => o.id === chosen) ?? mainOption(doc);
  const tot = optionTotals(doc, withAddons(base, addons));
  const deposit = approved ? data.approval!.depositCents ?? tot.deposit : tot.deposit;

  const sign = async (name: string, svg: string) => {
    setBusy(true);
    try {
      if (data.source === "local" && data.estimateId) {
        store.approveEstimate(data.estimateId, { optionId: base.id, addonIds: addons, signerName: name, signature: svg, channel: "portal" });
      } else {
        setRemote(await acceptPortal(token!, { optionId: base.id, addonIds: addons, signer: name, svg }));
      }
    } catch (e) {
      toast.show(t("portal.error", { msg: String((e as Error)?.message ?? e) }));
    } finally {
      setBusy(false);
    }
  };
  const pdf = () =>
    saveEstimatePdf(estimateHtml(data, { t, money, day }), `Estimate ${data.number ?? ""}`.trim()).catch((e) => toast.show(t("portal.error", { msg: String(e?.message ?? e) })));

  return (
    <Screen
      title={data.company.name || "OCTODEX"}
      back={back}
      subtitle={`${t("portal.estimate")} ${data.number ?? ""} · ${data.sentAt ? day(data.sentAt) : ""}`}
    >
      {data.source === "local" && back ? (
        <T v="caption" tone="mut">
          {t("portal.preview")}
        </T>
      ) : null}
      <Card>
        <T v="caption" tone="mut">
          {t("portal.for")}
        </T>
        <T v="heading">{data.customer.name}</T>
        <T v="body" tone="mut">
          {[data.property.address, data.property.city].filter(Boolean).join(", ")}
        </T>
        {data.title ? <T v="body">{data.title}</T> : null}
      </Card>

      {data.status === "draft" ? (
        <Empty icon="pencil" title={t("portal.draft")} />
      ) : (
        <>
          <EstimateView doc={doc} optionId={base.id} onOption={setOptionId} addonIds={addons} onAddons={setAddonIds} readOnly={!!approved} />

          {approved ? (
            <Card status="ok">
              <StatusChip status="ok" label={t("portal.approved")} />
              <T v="body">{t("ue.approvedBy", { name: data.approval!.signerName, date: day(data.approval!.signedAt) })}</T>
              <T v="body" tone="mut">
                {t("portal.thanks", { company: data.company.name || "OCTODEX" })}
              </T>
              {deposit > 0 ? (
                data.depositPaid ? (
                  <StatusChip status="ok" label={t("portal.depositPaid")} />
                ) : (
                  <View style={{ gap: space[2] }}>
                    <T v="caption" tone="mut">
                      {t("portal.depositDue")}
                    </T>
                    <T v="title" tabular>
                      {money(deposit)}
                    </T>
                    {data.source === "local" && data.estimateId ? (
                      <Button label={t("portal.payTest")} icon="dollar" full onPress={() => store.payDeposit(data.estimateId!, "card", true)} />
                    ) : (
                      <T v="caption" tone="mut">
                        {t("portal.payLater")}
                      </T>
                    )}
                  </View>
                )
              ) : null}
            </Card>
          ) : (
            <>
              <SectionTitle title={t("portal.sign")} />
              <Card>
                <SignBlock onSign={sign} busy={busy} />
              </Card>
            </>
          )}
        </>
      )}
      <Button label={t("portal.pdf")} icon="invoice" variant="secondary" full onPress={pdf} />
      {data.company.phone ? (
        <T v="caption" tone="mut">
          {data.company.name} · {data.company.phone}
        </T>
      ) : null}
    </Screen>
  );
}
