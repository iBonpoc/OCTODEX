import { visitWhen } from "@/features/schedule";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { space, type StatusName, size } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { DB, Estimate, PaymentMethod } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { portalFromEstimate } from "@/cloud/portal";
import { EstimateView } from "@/features/EstimateView";
import { SignBlock } from "@/features/SignBlock";
import { SignaturePad, SignaturePreview } from "@/features/SignaturePad";
import { issueCount, isUniversal, mainOption, marginView, newToken, SEND_ISSUE_KINDS, sendIssues, uid, type SendIssues } from "@/features/estimateDoc";
import { canEditEstimateTemplates, cleanEstimateTemplate, ESTIMATE_TEMPLATE_NAME_MAX, toTemplateDoc } from "@/features/estimateTemplate";
import { hasValidCslb } from "@/features/companySetup";
import { ContractStatement } from "@/features/ContractStatement";
import { estimateFileName, estimateHtml, saveEstimatePdf } from "@/features/estimatePdf";
import { beforeSend, clientLink, copyText, estimateMessage, openEmail, openSms } from "@/features/sendEstimate";
import { canServe } from "@/features/clients";
import { estimateNotes, type ModuleNote } from "@/modules/registry";
import { docLanguageFor } from "@/data/people";
import { Button, Segmented, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Divider, RowView, SectionTitle } from "@/ui/surfaces";
import { canChangeEstimateCategory, estimateStatusView, isEstimateEditable } from "@/features/estimateStatus";
import { ServiceCategoryRow } from "@/features/ServiceCategoryPicker";
import { canCountersign, canManageLink, canSeeClientLink, canSignDraftOnSite, hisWarning, mySignature } from "@/features/estimateSign";
import { EstimateReasonSheet } from "@/features/EstimateReasonSheet";


/** under the estimate's title (its screen and the panel on 1280): «client · address, city» */
export function estimateSubtitle(db: DB, e: Estimate): string {
  const customer = db.customers.find((c) => c.id === e.customerId);
  const property = db.properties.find((p) => p.id === e.propertyId);
  return [customer?.name, [property?.address, property?.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
}

/**
 * The estimate card's body: status, lines, send / PDF / on-site signature, deposit → job. The same body on the
 * estimate's own screen (`/estimate/<id>`) and in the panel beside the list on 1280 (`/estimates?open=<id>`,
 * docs/specs/06-list-cards.md «Панель 1280»). `openSend` — the screen's `?send=1` (the send sheet opens at once).
 */
export function EstimateCardBody({ e, openSend }: { e: Estimate; openSend?: boolean }) {
  const store = useStore();
  const { db } = store;
  const { t, money, day } = useI18n();
  const toast = useToast();
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [sendOpen, setSendOpen] = useState(!!openSend);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const customer = db.customers.find((c) => c.id === e.customerId);
  const property = db.properties.find((p) => p.id === e.propertyId);
  const st = estimateStatusView(e.status);
  const q = (msg: string) => (store.online ? msg : t("offline.queued"));
  const universal = isUniversal(e);
  // the office: the margin, or why it is not counted (debt 5); who may not see costs (a tech, sales without view_costs —
  // the server's app.can_view_costs, db.costsVisible) never sees it: their lines come without costs (review PR-A №1)
  const margin = store.role === "tech" || db.costsVisible === false ? null : marginView(e);
  const job = db.jobs.find((j) => j.estimateId === e.id);

  // C5 for the PDF (spec 33 П23.10): an unsigned estimate's PDF goes to the client by hand — the same check as «Отправить»
  const pdfIssues = (e.status === "draft" || e.status === "sent") && e.doc ? sendIssues(e.doc) : null;
  // C5b (spec 33 П23.11): the modules' words on an open estimate (e.g. «the measurement changed after it»)
  const notes = estimateNotes(db, e);
  const pdf = (checked = false) => {
    if (!checked && pdfIssues && (issueCount(pdfIssues) > 0 || notes.length > 0)) return setPdfOpen(true);
    setPdfOpen(false);
    const p = portalFromEstimate(db, e, store.companyName ?? "OCTODEX");
    saveEstimatePdf(estimateHtml(p, { lang: p.lang }), estimateFileName(p)).catch((err) =>
      toast.show(t("portal.error", { msg: String(err?.message ?? err) })),
    );
  };

  return (
    <>
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
          {margin?.kind === "pct" ? (
            <View testID="est-margin">
              <T v="caption" tone="mut">
                {t("est.margin", { p: margin.pct })}
              </T>
            </View>
          ) : null}
          {margin?.kind === "missing" ? (
            <View testID="est-margin-missing">
              <StatusChip status="warn" soft label={t("est.marginMissing", { n: margin.lines })} />
            </View>
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

      {notes.map((n) => (
        <ModuleNoteCard key={`${n.module}-${n.id}`} n={n} />
      ))}

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
            {/* sending (and its «Copy link») is the office side's: a tech with the link could sign as the client (spec 35 §4д п.10) */}
            {(e.status === "draft" || e.status === "sent") && canServe(db, e.customerId) && canSeeClientLink(store.role) ? <View testID="est-send"><Button label={t("ue.send")} icon="send" onPress={() => setSendOpen(true)} /></View> : null}
            {/* the client's page only for the office side: a tech with the link could sign as the client (spec 35 §4д п.10) */}
            {e.token && canSeeClientLink(store.role) ? <View testID="est-open-client"><Button label={t("ue.openClient")} icon="user" variant="secondary" onPress={() => router.push(`/p/${e.token}`)} /></View> : null}
            {/* E3 (spec 07 §11): any status; the director and the office (the server refuses others — never queued) */}
            {e.doc && canEditEstimateTemplates(store.role) && !store.db.estimateTemplatesMissing ? (
              <View testID="est-save-template"><Button label={t("est.tpl.saveAs")} icon="copy" variant="ghost" onPress={() => setTplOpen(true)} /></View>
            ) : null}
            <View testID="est-pdf"><Button label={t("ue.pdf")} icon="invoice" variant="secondary" onPress={() => pdf()} /></View>
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
      {universal && tplOpen ? <SaveTemplateSheet e={e} onClose={() => setTplOpen(false)} /> : null}
      {pdfIssues ? (
        <Sheet visible={pdfOpen} onClose={() => setPdfOpen(false)} title={t("ue.pdf")}>
          <SendCheck
            id="pdf-check"
            issues={pdfIssues}
            canForce={pdfIssues.noPrice.length === 0}
            optionName={optionNameOf(e.doc)}
            onEdit={() => {
              setPdfOpen(false);
              router.push(`/estimate/new?id=${e.id}`);
            }}
            onForce={() => pdf(true)}
            notes={notes}
            forceLabel="ue.check.forcePdf"
            titles={["ue.check.pdfReview", "ue.check.pdfBlocked"]}
          />
        </Sheet>
      ) : null}
    </>
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
            {t("ue.scheduledOn", { date: day(v.start), time: visitWhen(v, time, t("plan5.allDay"), false) })}
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
  // C5 (spec 33 П23.9): the client signs on site what they would get by link — the same check first (review C5 №2)
  const [force, setForce] = useState(false);
  const check = beforeSend(store.db, e, { force });
  const notes = estimateNotes(store.db, e);
  const issues = linesOrNotes(check, notes, force);
  return (
    <>
      <EstimateView doc={doc} optionId={optionId} onOption={setOptionId} addonIds={addonIds} onAddons={setAddonIds} />
      <SectionTitle title={t("est.signOnSite")} />
      {issues ? (
        <Card>
          <SendCheck
            id="sign-check"
            issues={issues.issues}
            notes={notes}
            canForce={issues.canForce}
            optionName={optionNameOf(doc)}
            onEdit={isEstimateEditable(e.status) ? () => router.push(`/estimate/new?id=${e.id}`) : undefined}
            onForce={() => setForce(true)}
          />
        </Card>
      ) : !canCountersign(store.db, store.db.me) ? (
        <Card>
          <T v="body" tone="mut">
            {t("est.countersign.noRightOnSite")}
          </T>
        </Card>
      ) : !canSignDraftOnSite(store.role, e.status) ? (
        <Card>
          <View testID="sign-after-send">
            <T v="body" tone="mut">
              {t("est.signOnSite.afterSend")}
            </T>
          </View>
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
  // C5 (spec 33 П23.9): «Всё равно отправить» for a test price / a line not in the measurement; never for «нет цены»
  const [force, setForce] = useState(false);
  const check = beforeSend(store.db, e, { force });
  const notes = estimateNotes(store.db, e);
  const issues = linesOrNotes(check, notes, force);
  const close = () => {
    setForce(false);
    onClose();
  };
  const go = async (how: "sms" | "email" | "copy") => {
    // «do not service» sends nothing; a taxed draft of a client who became «Без налога» is re-saved first (04 §12)
    const pre = beforeSend(store.db, e, { force });
    if (!pre.ok) return pre.reason === "no_service" ? toast.show(t("client.noServiceHint")) : undefined;
    if (notes.length && !force) return;
    if (pre.resave) store.saveEstimate({ id: e.id, customerId: e.customerId, propertyId: e.propertyId, title: e.title, doc: pre.resave, leadId: e.leadId });
    const token = e.token ?? newToken();
    const undo = store.sendEstimate(e.id, token);
    const url = clientLink(token);
    try {
      if (how === "sms") await openSms(customer?.phone ?? "", msg(url).text);
      if (how === "email") await openEmail(customer?.email ?? "", msg(url).subject, msg(url).text);
      if (how === "copy") await copyText(url);
      setForce(false);
      toast.show(how === "copy" ? t("ue.linkCopied") : t("est.sentToast", { name: customer?.name ?? "" }), e.status === "draft" ? undo : undefined);
    } catch (err) {
      toast.show(t("portal.error", { msg: String((err as Error)?.message ?? err) }));
    }
  };
  return (
    <Sheet visible={visible} onClose={close} title={t("ue.send")}>
      <View style={{ gap: space[3] }}>
        <T v="body">{customer?.name}</T>
        <T v="caption" tone="mut">
          {[customer?.phone, customer?.email].filter(Boolean).join(" · ")}
        </T>
        {issues ? (
          <SendCheck
            id="send-check"
            issues={issues.issues}
            notes={notes}
            canForce={issues.canForce}
            optionName={optionNameOf(e.doc)}
            onEdit={
              isEstimateEditable(e.status)
                ? () => {
                    close();
                    router.push(`/estimate/new?id=${e.id}`);
                  }
                : undefined
            }
            onForce={() => setForce(true)}
          />
        ) : null}
        <View testID="send-buttons">
        <RowView style={{ flexWrap: "wrap" }}>
          <View testID="send-sms"><Button label={t("ue.sendSms")} icon="message" onPress={() => go("sms")} disabled={!!issues || !customer?.phone} /></View>
          <View testID="send-email"><Button label={t("ue.sendEmail")} icon="send" variant="secondary" onPress={() => go("email")} disabled={!!issues || !customer?.email} /></View>
          <View testID="send-copy"><Button label={t("ue.copyLink")} icon="note" variant="secondary" onPress={() => go("copy")} disabled={!!issues} /></View>
        </RowView>
        </View>
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

const NO_ISSUES: SendIssues = { noPrice: [], testPrice: [], gone: [] };
/** what the check shows: the lines' issues (C5), else the modules' words until «Всё равно» (C5b, spec 33 П23.11) */
function linesOrNotes(check: ReturnType<typeof beforeSend>, notes: readonly ModuleNote[], force: boolean): { issues: SendIssues; canForce: boolean } | null {
  if (!check.ok) return check.reason === "lines" ? check : null;
  return notes.length && !force ? { issues: NO_ISSUES, canForce: true } : null;
}

/** C5b: a module's word on the estimate — warn, icon + word (rule 2), the module's way out (e.g. «Обновить из замера») */
function ModuleNoteCard({ n }: { n: ModuleNote & { module: string } }) {
  const { t } = useI18n();
  return (
    <Card status="warn">
      <View testID={`module-${n.module}-${n.id}`} style={{ gap: space[2] }}>
        <View style={{ flexDirection: "row" }}>
          <StatusChip status="warn" label={t(n.labelKey)} />
        </View>
        <T v="caption" tone="mut">
          {t(n.hintKey)}
        </T>
        {n.action ? (
          <View testID={`module-${n.module}-${n.action.id}`} style={{ flexDirection: "row" }}>
            <Button label={t(n.action.labelKey)} icon={n.action.icon} variant="secondary" onPress={() => router.push(n.action!.href as never)} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const CHECK_WORD = { noPrice: "ue.src.noPrice", testPrice: "ue.src.testPrice", gone: "ue.src.gone" } as const;

/** C5: what stops a send — by kind, icon + word + count and the lines' names (rule 2); a way out in one tap. */
/** the option a line is in, when there is more than one (a blank name → its number) */
const optionNameOf = (doc: Estimate["doc"]) => (id: string) => {
  const opts = doc?.options ?? [];
  if (opts.length < 2) return "";
  const i = opts.findIndex((o) => o.id === id);
  return opts[i]?.name.trim() || `#${i + 1}`;
};

function SendCheck({ id, issues, canForce, optionName, onEdit, onForce, notes = [], forceLabel = "ue.check.force", titles = ["ue.check.review", "ue.check.blocked"] }: { id: "send-check" | "sign-check" | "pdf-check"; issues: SendIssues; canForce: boolean; optionName: (id: string) => string; onEdit?: () => void; onForce: () => void; notes?: readonly ModuleNote[]; forceLabel?: DictKey; titles?: [DictKey, DictKey] }) {
  const { t } = useI18n();
  return (
    <View testID={id} style={{ gap: space[2] }}>
      <View testID={`${id}-${canForce ? "review" : "blocked"}`}>
        <T v="heading">{t(canForce ? titles[0] : titles[1])}</T>
      </View>
      {SEND_ISSUE_KINDS.filter((k) => issues[k].length).map((k) => (
        <View key={k} testID={`${id}-${k}`} style={{ gap: space[1] }}>
          <View style={{ flexDirection: "row" }}>
            <StatusChip status={k === "noPrice" ? "bad" : "warn"} label={`${t(CHECK_WORD[k])} · ${issues[k].length}`} />
          </View>
          <T v="caption" tone="mut">
            {issues[k].map((l) => (optionName(l.optionId) ? `${l.name} (${optionName(l.optionId)})` : l.name)).join(", ")}
          </T>
        </View>
      ))}
      {notes.map((n) => (
        <View key={`${"module" in n ? String(n.module) : ""}-${n.id}`} testID={`${id}-module`} style={{ gap: space[1] }}>
          <View style={{ flexDirection: "row" }}>
            <StatusChip status="warn" label={t(n.labelKey)} />
          </View>
          <T v="caption" tone="mut">
            {t(n.hintKey)}
          </T>
        </View>
      ))}
      <T v="caption" tone="mut">
        {t(!canForce ? "ue.check.noPriceHint" : issueCount(issues) > 0 ? "ue.check.forceHint" : "ue.check.moduleHint")}
      </T>
      <RowView style={{ flexWrap: "wrap" }}>
        {onEdit ? (
          <View testID={`${id}-edit`}>
            <Button label={t("ue.check.edit")} icon="pencil" variant="secondary" onPress={onEdit} />
          </View>
        ) : null}
        {canForce ? (
          <View testID={`${id}-force`}>
            <Button label={t(forceLabel)} icon={forceLabel === "ue.check.force" ? "send" : "invoice"} variant="secondary" onPress={onForce} />
          </View>
        ) : null}
      </RowView>
      <Divider />
    </View>
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
      ) : e.status === "draft" && !canSignDraftOnSite(store.role, e.status) ? (
        // #1126: a tech has a draft signed only after the office sends it (the server signs a sent, locked version only)
        <Card>
          <View testID="est-sign-after-send">
            <T v="body" tone="mut">
              {t("est.signOnSite.afterSend")}
            </T>
          </View>
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
            <View testID="est-sign-on-site">
              <SignaturePad
                onConfirm={(path) => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  toast.show(q(t("est.signedToast", { name: customer?.name ?? "" })), store.signEstimate(e.id, path));
                }}
              />
            </View>
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

/** «Сохранить как шаблон» (spec 07 §7.1, §11): a name, then the estimate without client, property, lead or signatures */
function SaveTemplateSheet({ e, onClose }: { e: Estimate; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [name, setName] = useState(e.title);
  const [done, setDone] = useState(false);
  const save = () => {
    if (!e.doc || done || !name.trim()) return;
    const seeCosts = store.db.costsVisible ?? store.role !== "tech";
    const exempt = !!store.db.customers.find((c) => c.id === e.customerId)?.taxExempt;
    const tpl = { id: uid(), name, doc: toTemplateDoc(e.doc, seeCosts, exempt) };
    // what the server would refuse is never queued: say so instead of «сохранён»
    if (!cleanEstimateTemplate(tpl)) {
      toast.show(t("est.tpl.cannot"));
      return;
    }
    setDone(true);
    const undo = store.saveEstimateTemplate(tpl);
    toast.show(store.online ? t("est.tpl.saved", { name: name.trim() }) : t("offline.queued"), undo);
    onClose();
  };
  return (
    <Sheet visible onClose={onClose} title={t("est.tpl.saveAs")}>
      <View testID="est-tpl-save-sheet" style={{ gap: space[3] }}>
        <T v="caption" tone="mut">{t("est.tpl.saveHint")}</T>
        <View testID="est-tpl-save-name">
          <TextField type="text" label={t("est.tpl.name")} value={name} onChangeText={(v) => setName(v.slice(0, ESTIMATE_TEMPLATE_NAME_MAX))} />
        </View>
        <View testID="est-tpl-save">
          <Button label={t("est.tpl.saveAs")} icon="copy" full disabled={!name.trim() || done} onPress={save} />
        </View>
      </View>
    </Sheet>
  );
}
