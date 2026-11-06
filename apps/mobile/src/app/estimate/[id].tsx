import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { space, type StatusName, size } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Estimate, PaymentMethod } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { portalFromEstimate } from "@/cloud/portal";
import { EstimateView } from "@/features/EstimateView";
import { SignBlock } from "@/features/SignBlock";
import { SignaturePad, SignaturePreview } from "@/features/SignaturePad";
import { isUniversal, mainOption, newToken } from "@/features/estimateDoc";
import { hasValidCslb } from "@/features/companySetup";
import { ContractStatement } from "@/features/ContractStatement";
import { estimateFileName, estimateHtml, saveEstimatePdf } from "@/features/estimatePdf";
import { beforeSend, clientLink, copyText, estimateMessage, openEmail, openSms } from "@/features/sendEstimate";
import { canServe } from "@/features/clients";
import { docLanguageFor } from "@/data/people";
import { Button, Segmented, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Divider, Empty, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { canChangeEstimateCategory, estimateStatusView, isEstimateEditable } from "@/features/estimateStatus";
import { ServiceCategoryRow } from "@/features/ServiceCategoryPicker";
import { canCountersign, canManageLink, hisWarning, mySignature } from "@/features/estimateSign";
import { EstimateReasonSheet } from "@/features/EstimateReasonSheet";


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
  const st = estimateStatusView(e.status);
  const q = (msg: string) => (store.online ? msg : t("offline.queued"));
  const universal = isUniversal(e);
  const job = db.jobs.find((j) => j.estimateId === e.id);

  const pdf = () => {
    const p = portalFromEstimate(db, e, store.companyName ?? "OCTODEX");
    saveEstimatePdf(estimateHtml(p, { lang: p.lang }), estimateFileName(p)).catch((err) =>
      toast.show(t("portal.error", { msg: String(err?.message ?? err) })),
    );
  };

  return (
    <Screen
      title={[e.number, e.title].filter(Boolean).join(" · ") || t("est.detail")}
      back={back}
      subtitle={[customer?.name, [property?.address, property?.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
    >
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

      {/* T2 (S16): the direction of the business; read-only once the client signed — the job keeps its own */}
      <ServiceCategoryRow
        value={e.serviceCategoryId}
        readOnly={!canChangeEstimateCategory(e.status, store.role)}
        onChange={(cid) => toast.show(q(t("dir.changed")), store.setEstimateCategory(e.id, cid))}
      />

      {universal ? (
        <>
          <RowView style={{ flexWrap: "wrap" }}>
            {/* a client-signed estimate changes only through «don't sign — change it» (with a reason) */}
            {isEstimateEditable(e.status) && e.status !== "awaiting_countersign" ? <Button label={t("ue.edit")} icon="pencil" variant="secondary" onPress={() => router.push(`/estimate/new?id=${e.id}`)} /> : null}
            {(e.status === "draft" || e.status === "sent") && canServe(db, e.customerId) ? <Button label={t("ue.send")} icon="send" onPress={() => setSendOpen(true)} /> : null}
            {e.token ? <Button label={t("ue.openClient")} icon="user" variant="secondary" onPress={() => router.push(`/p/${e.token}`)} /> : null}
            <Button label={t("ue.pdf")} icon="invoice" variant="secondary" onPress={pdf} />
            {/* E2b: only an unsigned link can be revoked (the signed client keeps their copy); director and office */}
            {e.token && !e.linkRevokedAt && (e.status === "sent" || e.status === "draft") && canManageLink(store.db, store.db.me) ? (
              <Button label={t("est.revoke.button")} icon="close" variant="ghost" onPress={() => toast.show(t("est.revoke.done"), store.revokeEstimateLink(e.id))} />
            ) : null}
          </RowView>
          {e.status === "approved" && e.approval ? (
            <ApprovedCard e={e} jobId={job?.id} />
          ) : e.status === "awaiting_countersign" ? (
            <CountersignCard e={e} />
          ) : e.status === "declined" ? (
            <DeclinedCard e={e} />
          ) : (
            <OnSiteSign e={e} />
          )}
        </>
      ) : (
        <LegacyBody e={e} />
      )}

      {job && e.status === "approved" ? <ContractStatement jobId={job.id} /> : null}

      {!job && e.status === "approved" && e.depositCents ? (
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
        {e.countersign ? <T v="body">{t("est.countersign.by", { name: e.countersign.signerName, date: day(e.countersign.at) })}</T> : null}
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
      {!canCountersign(store.db, store.db.me) ? (
        <Card>
          <T v="body" tone="mut">
            {t("est.countersign.noRightOnSite")}
          </T>
        </Card>
      ) : (
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
      )}
    </>
  );
}

function SendSheet({ e, visible, onClose }: { e: Estimate; visible: boolean; onClose: () => void }) {
  const store = useStore();
  const { t, money } = useI18n();
  const toast = useToast();
  const customer = store.db.customers.find((c) => c.id === e.customerId);
  const company = store.companyName ?? "OCTODEX";
  /** to the client in the client's language (rule 7), whatever the app language is */
  const msg = (url: string) => estimateMessage(docLanguageFor(store.db, { customerId: e.customerId, leadId: e.leadId }), { company, name: customer?.name ?? "", totalCents: e.totalCents, number: e.number, link: url });
  const go = async (how: "sms" | "email" | "copy") => {
    // «do not service» sends nothing; a taxed draft of a client who became «Без налога» is re-saved first (04 §12)
    const pre = beforeSend(store.db, e);
    if (!pre.ok) return toast.show(t("client.noServiceHint"));
    if (pre.resave) store.saveEstimate({ id: e.id, customerId: e.customerId, propertyId: e.propertyId, title: e.title, doc: pre.resave, leadId: e.leadId });
    const token = e.token ?? newToken();
    const undo = store.sendEstimate(e.id, token);
    const url = clientLink(token);
    try {
      if (how === "sms") await openSms(customer?.phone ?? "", msg(url).text);
      if (how === "email") await openEmail(customer?.email ?? "", msg(url).subject, msg(url).text);
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
        {!hasValidCslb(store.db.company) ? (
          <T v="caption" tone="warn">
            {t("ue.noCslb")}
          </T>
        ) : null}
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
              <RowView style={{ justifyContent: "space-between", minHeight: size.controlMdPhone }}>
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
      {(e.status === "draft" || e.status === "sent") && !canCountersign(store.db, store.db.me) ? (
        <Card>
          <T v="body" tone="mut">
            {t("est.countersign.noRightOnSite")}
          </T>
        </Card>
      ) : e.status === "draft" || e.status === "sent" ? (
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
      ) : e.status === "awaiting_countersign" ? (
        <CountersignCard e={e} />
      ) : null}
    </>
  );
}

/**
 * S8b (docs/specs/07 §2.2 А, §7.1): the client signed — an employee signs the contract for the company in their own name.
 * Wave E2a: drawn with a finger; the saved signature, the sheet and «My signature» come in E2b.
 */
function CountersignCard({ e }: { e: Estimate }) {
  const store = useStore();
  const { t, day, money } = useI18n();
  const toast = useToast();
  const [sheet, setSheet] = useState<"reopen" | "decline" | null>(null);
  const me = store.db.members.find((m) => m.id === store.db.me);
  const a = e.approval;
  const company = store.companyName ?? "OCTODEX";
  const option = a && e.doc ? e.doc.options.find((o) => o.id === a.optionId)?.name ?? "" : "";
  const manage = canManageLink(store.db, store.db.me);
  const mine = mySignature(store.db, store.db.me);
  return (
    <>
      <SectionTitle title={t("est.countersign.title")} />
      <Card status="warn">
        <StatusChip status="warn" label={t("est.awaitingCountersign")} />
        <T v="body">{a?.at ? t("est.countersign.clientSigned", { name: a.signerName, date: day(a.at) }) : t("est.countersign.clientSignedNoDate")}</T>
        {a ? (
          <T v="caption" tone="mut" tabular>
            {t("est.countersign.summary", { option, total: money(a.totalCents), deposit: money(a.depositCents) })}
          </T>
        ) : null}
        {canCountersign(store.db, store.db.me) ? (
          <>
            <T v="body" w="semibold">
              {a?.channel === "on_site" ? t("est.countersign.onSite", { company }) : t("est.countersign.asYou", { name: me?.name ?? "", company })}
            </T>
            {hisWarning(store.db, store.db.me) ? (
              <T v="caption" tone="warn">
                {t("est.countersign.hisWarning")}
              </T>
            ) : null}
            {mine ? (
              <>
                <SignaturePreview svg={mine.svg} label={t("est.sig.title")} />
                <Button
                  label={t("est.countersign.useSaved")}
                  icon="check"
                  full
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    toast.show(store.online ? t("est.countersign.done") : t("offline.queued"), store.countersignEstimate(e.id, { savedId: mine.id }));
                  }}
                />
              </>
            ) : null}
            <T v="caption" tone="mut">
              {mine ? t("est.countersign.orDraw") : t("est.countersign.becomesSaved")}
            </T>
            <SignaturePad
              label={t("est.countersign.padLabel")}
              confirmLabel={t("est.countersign.sign")}
              onConfirm={(path) => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                const undo = store.countersignEstimate(e.id, path);
                toast.show(store.online ? t("est.countersign.done") : t("offline.queued"), undo);
              }}
            />
          </>
        ) : (
          <T v="body" tone="mut">
            {t("est.countersign.noRight")}
          </T>
        )}
        {/* director and office: change it (back to draft) or decline — both with a reason; a tech does not see these */}
        {manage ? (
          <RowView style={{ flexWrap: "wrap" }}>
            <Button label={t("est.reopen.button")} icon="pencil" variant="secondary" size="sm" onPress={() => setSheet("reopen")} />
            <Button label={t("est.decline.button")} icon="close" variant="ghost" size="sm" onPress={() => setSheet("decline")} />
          </RowView>
        ) : null}
      </Card>
      <EstimateReasonSheet
        visible={sheet === "reopen"}
        onClose={() => setSheet(null)}
        title={t("est.reopen.button")}
        hint={t("est.reopen.hint")}
        confirmLabel={t("est.reopen.button")}
        onConfirm={(reason) => {
          toast.show(t("est.reopen.done"), store.reopenEstimate(e.id, reason));
          router.push(`/estimate/new?id=${e.id}`);
        }}
      />
      <EstimateReasonSheet
        visible={sheet === "decline"}
        onClose={() => setSheet(null)}
        title={t("est.decline.button")}
        hint={t("est.decline.hint")}
        confirmLabel={t("est.decline.button")}
        required
        onConfirm={(reason) => toast.show(t("est.decline.done"), store.declineCountersign(e.id, reason))}
      />
    </>
  );
}

/** E2b: the company declined after the client signed; the reason is for the team only. */
function DeclinedCard({ e }: { e: Estimate }) {
  const { t } = useI18n();
  return (
    <Card status="bad">
      <StatusChip status="bad" label={e.declinedText ? t("est.declined.title") : t("st.declined")} />
      {e.declinedText ? (
        <T v="body" tone="mut">
          {t("est.declined.reason", { text: e.declinedText })}
        </T>
      ) : null}
    </Card>
  );
}
