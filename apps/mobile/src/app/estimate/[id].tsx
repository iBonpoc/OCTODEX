import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { space, type StatusName } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { EstimateStatus, PaymentMethod } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { SignaturePad } from "@/features/SignaturePad";
import { Button, Segmented, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Divider, Empty, RowView, Screen, SectionTitle } from "@/ui/surfaces";

const estimateStatus: Record<EstimateStatus, { s: StatusName; l: DictKey }> = {
  draft: { s: "neutral", l: "st.draft" },
  sent: { s: "info", l: "st.sent" },
  approved: { s: "ok", l: "st.approved" },
  declined: { s: "bad", l: "st.declined" },
};

/** Estimate: lines, send, client signs on site (E-SIGN consent + rescission notice), record deposit → job. */
export default function EstimateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db } = store;
  const { t, money, day } = useI18n();
  const toast = useToast();
  const [method, setMethod] = useState<PaymentMethod>("card");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const e = db.estimates.find((x) => x.id === id);
  if (!e)
    return (
      <Screen title={t("est.detail")} back={back}>
        <Empty icon="invoice" title={t("clients.empty")} />
      </Screen>
    );
  const customer = db.customers.find((c) => c.id === e.customerId);
  const property = db.properties.find((p) => p.id === e.propertyId);
  const st = estimateStatus[e.status];
  const q = (msg: string) => (store.online ? msg : t("offline.queued"));
  return (
    <Screen title={customer?.name ?? t("est.detail")} back={back} subtitle={[property?.address, property?.city].filter(Boolean).join(", ")}>
      <Card status={st.s}>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="heading" style={{ flex: 1 }} numberOfLines={2}>
            {e.title}
          </T>
          <StatusChip status={st.s} label={t(st.l)} />
        </RowView>
        <T v="display" tabular>
          {money(e.totalCents)}
        </T>
        <RowView style={{ flexWrap: "wrap" }}>
          {e.marginPct ? (
            <T v="caption" tone="mut">
              {t("est.margin", { p: e.marginPct })}
            </T>
          ) : null}
          {e.depositCents ? (
            <T v="caption" tone="mut">
              · {t("est.deposit", { amount: money(e.depositCents) })}
            </T>
          ) : null}
          {e.sentAt ? (
            <T v="caption" tone="mut">
              · {t("st.sent")} {day(e.sentAt)}
            </T>
          ) : null}
        </RowView>
      </Card>

      <SectionTitle title={t("est.lines")} />
      <Card>
        {e.lines?.length ? (
          e.lines.map((l, i) => (
            <View key={`${l.name}-${i}`}>
              {i > 0 ? <Divider /> : null}
              <RowView style={{ justifyContent: "space-between", minHeight: 40 }}>
                <T v="body" tone={l.optional ? "mut" : "ink"} style={{ flex: 1 }}>
                  {l.name} × {l.qty}
                  {l.optional ? ` (${t("est.optional")})` : ""}
                </T>
                <T v="body" tabular>
                  {money(l.totalCents)}
                </T>
              </RowView>
            </View>
          ))
        ) : (
          <T v="body" tone="mut">
            {t("est.noLines")}
          </T>
        )}
      </Card>

      {e.status === "draft" ? (
        <>
          <Button
            label={t("est.send")}
            icon="send"
            variant="secondary"
            full
            onPress={() => toast.show(q(t("est.sentToast", { name: customer?.name ?? "" })), store.sendEstimate(e.id))}
          />
          <T v="caption" tone="mut">
            {t("est.sendNote")}
          </T>
        </>
      ) : null}

      {e.status === "draft" || e.status === "sent" ? (
        <>
          <SectionTitle title={t("est.signOnSite")} />
          <Card>
            <T v="caption" tone="mut">
              {t("est.esign")}
            </T>
            <T v="caption" tone="warn">
              {t("est.rescission")}
            </T>
            <SignaturePad
              onConfirm={(path) => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                toast.show(q(t("est.signedToast", { name: customer?.name ?? "" })), store.signEstimate(e.id, path));
              }}
            />
          </Card>
        </>
      ) : null}

      {e.status === "approved" && e.depositCents ? (
        <Card status={e.depositPaidAt ? "ok" : "warn"}>
          <T v="caption" tone="mut">
            {e.depositPaidAt ? t("est.depositPaid") : t("est.depositDue")}
          </T>
          <T v="title" tabular>
            {money(e.depositCents)}
          </T>
          {!e.depositPaidAt ? (
            <>
              <Segmented
                full
                value={method}
                onChange={setMethod}
                items={[
                  { key: "card", label: t("visit.payCard") },
                  { key: "cash", label: t("visit.payCash") },
                  { key: "check", label: t("visit.payCheck") },
                  { key: "zelle", label: t("visit.payZelle") },
                ]}
              />
              <Button
                label={t("est.recordDeposit")}
                icon="dollar"
                full
                onPress={() =>
                  toast.show(q(t("est.depositToast", { amount: money(e.depositCents ?? 0) })), store.payDeposit(e.id, method))
                }
              />
            </>
          ) : (
            <StatusChip status="ok" label={t("est.depositPaid")} />
          )}
        </Card>
      ) : null}
    </Screen>
  );
}
