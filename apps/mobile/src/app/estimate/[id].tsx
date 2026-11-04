import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { space, type StatusName } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Estimate, EstimateStatus, PaymentMethod } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { portalFromEstimate } from "@/cloud/portal";
import { EstimateView } from "@/features/EstimateView";
import { SignBlock } from "@/features/SignBlock";
import { SignaturePad } from "@/features/SignaturePad";
import { isUniversal, mainOption, newToken } from "@/features/estimateDoc";
import { estimateHtml, saveEstimatePdf } from "@/features/estimatePdf";
import { clientLink, copyText, openEmail, openSms } from "@/features/sendEstimate";
import { Button, Segmented, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Divider, Empty, RowView, Screen, SectionTitle } from "@/ui/surfaces";

const estimateStatus: Record<EstimateStatus, { s: StatusName; l: DictKey }> = {
  draft: { s: "neutral", l: "st.draft" },
  sent: { s: "info", l: "st.sent" },
  approved: { s: "ok", l: "st.approved" },
  declined: { s: "bad", l: "st.declined" },
};

/** Estimate: send by link (SMS/email), client view, PDF, on-site signature, deposit → job in the plan. */
export default function EstimateScreen() {
  const { id, send } = useLocalSearchParams<{ id: string; send?: string }>();
  const store = useStore();
  const { db } = store;
  const { t, money, day } = useI18n();
  const toast = useToast();
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [sendOpen, setSendOpen] = useState(send === "1");
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
  const universal = isUniversal(e);
  const job = db.jobs.find((j) => j.estimateId === e.id);

  const pdf = () => {
    const p = portalFromEstimate(db, e, store.companyName ?? "OCTODEX");
    saveEstimatePdf(estimateHtml(p, { t, money, day }), `Estimate ${e.number ?? ""} ${customer?.name ?? ""}`.trim()).catch((err) =>
      toast.show(t("portal.error", { msg: String(err?.message ?? err) })),
    );
  };

  return (
    <Screen title={customer?.name ?? t("est.detail")} back={back} subtitle={[property?.address, property?.city].filter(Boolean).join(", ")}>
      <Card status={st.s}>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="heading" style={{ flex: 1 }} numberOfLines={2}>
            {e.number ? `${e.number} · ` : ""}
            {e.title}
          </T>
          <StatusChip status={st.s} label={t(st.l)} />
        </RowView>
        <T v="display" tabular>
          {money(e.totalCents)}
        </T>
        <RowView style={{ flexWrap: "wrap" }}>
          {e.marginPct && store.role !== "tech" ? (
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
          {universal ? (
            <T v="caption" tone="mut">
              · {t("ue.nOptions", { n: e.doc.options.length })}
            </T>
          ) : null}
        </RowView>
        {e.viewedAt && e.status === "sent" ? (
          <StatusChip status="info" label={t("ue.viewed", { date: day(e.viewedAt) })} />
        ) : null}
      </Card>

      {universal ? (
        <>
          <RowView style={{ flexWrap: "wrap" }}>
            {e.status !== "approved" ? <Button label={t("ue.edit")} icon="pencil" variant="secondary" onPress={() => router.push(`/estimate/new?id=${e.id}`)} /> : null}
            {e.status !== "approved" ? <Button label={t("ue.send")} icon="send" onPress={() => setSendOpen(true)} /> : null}
            {e.token ? <Button label={t("ue.openClient")} icon="user" variant="secondary" onPress={() => router.push(`/p/${e.token}`)} /> : null}
            <Button label={t("ue.pdf")} icon="invoice" variant="secondary" onPress={pdf} />
          </RowView>
          {e.status === "approved" && e.approval ? (
            <ApprovedCard e={e} jobId={job?.id} />
          ) : (
            <OnSiteSign e={e} />
          )}
        </>
      ) : (
        <LegacyBody e={e} />
      )}

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
                onPress={() => toast.show(q(t("est.depositToast", { amount: money(e.depositCents ?? 0) })), store.payDeposit(e.id, method))}
              />
            </>
          ) : (
            <StatusChip status="ok" label={t("est.depositPaid")} />
          )}
        </Card>
      ) : null}

      {universal ? <SendSheet e={e} visible={sendOpen} onClose={() => setSendOpen(false)} /> : null}
    </Screen>
  );
}

function ApprovedCard({ e, jobId }: { e: Estimate; jobId?: string }) {
  const { t, day, time } = useI18n();
  const { db } = useStore();
  const visits = jobId ? db.visits.filter((v) => v.jobId === jobId).sort((x, y) => x.start.localeCompare(y.start)) : [];
  const a = e.approval!;
  const doc = e.doc!;
  return (
    <>
      <Card status="ok">
        <StatusChip status="ok" label={t("portal.approved")} />
        <T v="body">{t("ue.approvedBy", { name: a.signerName, date: day(a.at) })}</T>
        {jobId && visits.length === 0 ? (
          <>
            <StatusChip status="warn" label={t("st.toSchedule")} />
            <T v="caption" tone="mut">
              {t("ue.toSchedule")}
            </T>
            <Button label={t("sch.title")} icon="calendar" onPress={() => router.push(`/job/schedule?jobId=${jobId}`)} />
          </>
        ) : null}
        {visits.map((v) => (
          <T key={v.id} v="body" tabular>
            {t("ue.scheduledOn", { date: day(v.start), time: time(v.start) })}
          </T>
        ))}
        {jobId && visits.length ? (
          <Button label={t("sch.another")} icon="plus" variant="ghost" size="sm" onPress={() => router.push(`/job/schedule?jobId=${jobId}`)} />
        ) : null}
      </Card>
      <EstimateView doc={doc} optionId={a.optionId} addonIds={a.addonIds} readOnly />
    </>
  );
}

function OnSiteSign({ e }: { e: Estimate }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const doc = e.doc!;
  const [optionId, setOptionId] = useState(mainOption(doc).id);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  useEffect(() => setOptionId(mainOption(doc).id), [doc]);
  const customer = store.db.customers.find((c) => c.id === e.customerId);
  return (
    <>
      <EstimateView doc={doc} optionId={optionId} onOption={setOptionId} addonIds={addonIds} onAddons={setAddonIds} />
      <SectionTitle title={t("est.signOnSite")} />
      <Card>
        <SignBlock
          defaultName={customer?.name ?? ""}
          onSign={(name, svg) => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            const undo = store.approveEstimate(e.id, { optionId, addonIds, signerName: name, signature: svg, channel: "on_site" });
            toast.show(store.online ? t("est.signedToast", { name }) : t("offline.queued"), undo);
          }}
        />
      </Card>
    </>
  );
}

function SendSheet({ e, visible, onClose }: { e: Estimate; visible: boolean; onClose: () => void }) {
  const store = useStore();
  const { t, money } = useI18n();
  const toast = useToast();
  const customer = store.db.customers.find((c) => c.id === e.customerId);
  const company = store.companyName ?? "OCTODEX";
  const text = (url: string) => t("ue.sendText", { company, name: customer?.name ?? "", total: money(e.totalCents), link: url });
  const go = async (how: "sms" | "email" | "copy") => {
    const token = e.token ?? newToken();
    const undo = store.sendEstimate(e.id, token);
    const url = clientLink(token);
    try {
      if (how === "sms") await openSms(customer?.phone ?? "", text(url));
      if (how === "email") await openEmail(customer?.email ?? "", t("ue.sendSubject", { number: e.number ?? "", company }), text(url));
      if (how === "copy") await copyText(url);
      toast.show(how === "copy" ? t("ue.linkCopied") : t("est.sentToast", { name: customer?.name ?? "" }), e.status === "draft" ? undo : undefined);
    } catch (err) {
      toast.show(t("portal.error", { msg: String((err as Error)?.message ?? err) }));
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={t("ue.send")}>
      <View style={{ gap: space[3] }}>
        <T v="body">{customer?.name}</T>
        <T v="caption" tone="mut">
          {[customer?.phone, customer?.email].filter(Boolean).join(" · ")}
        </T>
        <RowView style={{ flexWrap: "wrap" }}>
          <Button label={t("ue.sendSms")} icon="message" onPress={() => go("sms")} disabled={!customer?.phone} />
          <Button label={t("ue.sendEmail")} icon="send" variant="secondary" onPress={() => go("email")} disabled={!customer?.email} />
          <Button label={t("ue.copyLink")} icon="note" variant="secondary" onPress={() => go("copy")} />
        </RowView>
        <Divider />
        <T v="caption" tone="mut">
          {t("ue.sendNote")}
        </T>
        {store.mode === "demo" ? (
          <T v="caption" tone="warn">
            {t("ue.demoLink")}
          </T>
        ) : null}
      </View>
    </Sheet>
  );
}

/** Older quick estimates (no universal doc): lines + on-site signature. */
function LegacyBody({ e }: { e: Estimate }) {
  const store = useStore();
  const { t, money } = useI18n();
  const toast = useToast();
  const customer = store.db.customers.find((c) => c.id === e.customerId);
  const q = (msg: string) => (store.online ? msg : t("offline.queued"));
  return (
    <>
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
    </>
  );
}
