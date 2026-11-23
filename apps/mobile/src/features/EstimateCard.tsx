import { APP_NAME } from "@/config/product";
import { keepCosts, seeCosts } from "./access";
import { canPlan, visitWhen } from "@/features/schedule";
import { useHeldSheet } from "@/ui/heldSheet";
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactElement, type ReactNode } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { haptics } from "@/ui/haptics";
import { space, type StatusName, size } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { DB, Estimate, PaymentMethod, Role } from "@/data/types";
import { I18nOverride, useI18n, type DictKey } from "@/i18n";
import { portalFromEstimate } from "@/cloud/portal";
import { EstimateView } from "@/features/EstimateView";
import { SignBlock } from "@/features/SignBlock";
import { SignaturePad, SignaturePreview } from "@/features/SignaturePad";
import { StackBackGestureOff } from "@/nav/StackBackGestureOff";
import { clientDoc, issueCount, isUniversal, mainOption, marginView, newToken, SEND_ISSUE_KINDS, sendIssues, uid, type SendIssues } from "@/features/estimateDoc";
import { canEditEstimateTemplates, cleanEstimateTemplate, ESTIMATE_TEMPLATE_NAME_MAX, toTemplateDoc } from "@/features/estimateTemplate";
import { ContractStatement } from "@/features/ContractStatement";
import { estimateFileName, estimateHtml, saveEstimatePdf } from "@/features/estimatePdf";
import { beforeSend, clientLink, copyText, estimateMessage, openEmail, openSms } from "@/features/sendEstimate";
import { useUndoSend } from "@/features/useUndoSend";
import type { GuardedUndo } from "@/data/undo";
import { canServe } from "@/features/clients";
import { estimateNotes, type ModuleNote } from "@/modules/registry";
import { docLanguageFor } from "@/data/people";
import { termsForClient } from "@/features/estimateTerms";
import { Button, IconButton, Segmented, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Menu, Sheet, useToast, type MenuItem } from "@/ui/overlays";
import { Card, Divider, RowView, SectionTitle } from "@/ui/surfaces";
import { canChangeEstimateCategory, estimateStatusView, isEstimateEditable } from "@/features/estimateStatus";
import { ServiceCategoryRow } from "@/features/ServiceCategoryPicker";
import { canCountersign, canManageLink, canSeeClientLink, canSignDraftOnSite, hisWarning, mySignature } from "@/features/estimateSign";
import { EstimateReasonSheet } from "@/features/EstimateReasonSheet";
import { StatusNote } from "@/ui/statusNote";
import type { IconRowItem } from "@/ui/iconRow";
import { ObjectScreen, type MainAction, type MoreAction } from "@/ui/templates";


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
/**
 * Where the card's actions stand (#1412, DS §7.3, §8.9, Б4): `more` — «⋯» with the other actions (the screen's header, the panel's
 * header row), `main` — the one main button, the estimate's next step (the screen's pinned bar on a phone, the top of the content
 * from 820), `body` — the rest. No frame: «⋯» and the main button in one row above the body.
 */
export type EstimateFrame = (parts: { more: ReactNode; main: ReactNode | null; mainBar: ReactNode | null; body: ReactNode }) => ReactElement;

type EstAction = "edit" | "client" | "template" | "pdf" | "revoke";
export type EstMock = "rename" | "duplicate" | "client" | "template" | "closeLink" | "delete" | "revokeEst" | "archive" | "signedNote";

/** who opens the menu: the role (a tech sees only «Дублировать» and his own draft's delete), the link/withdraw right (director, dispatcher) and his id */
export interface EstMenuWho { role: Role; manage: boolean; me?: string; templatesMissing?: boolean }
/** #2403 map §2: the estimate's «⋯» in groups — what is done with the document, how it shows, then the dangerous one by what happened to it (a signed one: a quiet line).
 *  The same list is the row's long-press / swipe menu in a list (mock: the actions not built yet say so in a toast). The roles are the old code's:
 *  canSeeClientLink, canEditEstimateTemplates, canManageLink; «delete» — only an estimate that never left (no link, not sent), else «withdraw». */
export function estimateMenu(e: Estimate, t: (k: DictKey) => string, who: EstMenuWho): MenuItem<EstMock>[] {
  const tech = who.role === "tech";
  const office = canSeeClientLink(who.role);
  const everSent = !!e.token || !!e.sentAt;
  const open = e.status === "draft" || e.status === "sent";
  const mine = !!who.me && e.createdBy === who.me;
  const g1: MenuItem<EstMock>[] = [
    ...(!tech && e.status !== "approved" ? [{ key: "rename" as const, label: t("m2403.rename"), icon: "pencil" as const, testID: "est-m-rename" }] : []),
    { key: "duplicate", label: t("m2403.duplicate"), icon: "copy", testID: "est-m-duplicate" },
  ];
  const g2: MenuItem<EstMock>[] = [
    ...(e.token && office ? [{ key: "client" as const, label: t("ue.openClient"), icon: "eye" as const, testID: "est-m-client" }] : []),
    ...(e.doc && canEditEstimateTemplates(who.role) && !who.templatesMissing ? [{ key: "template" as const, label: t("m2403.toTemplate"), icon: "template" as const, testID: "est-m-template" }] : []),
    ...(e.token && !e.linkRevokedAt && open && who.manage ? [{ key: "closeLink" as const, label: t("m2403.closeLink"), icon: "link" as const, testID: "est-m-closeLink" }] : []),
  ];
  const g3: MenuItem<EstMock>[] = [
    ...(e.status === "draft" && !everSent && (!tech || mine) ? [{ key: "delete" as const, label: t("m2403.deleteEst"), icon: "trash" as const, destructive: true, testID: "est-m-delete" }] : []),
    ...(everSent && open && !e.linkRevokedAt && who.manage ? [{ key: "revokeEst" as const, label: t("m2403.revokeEst"), icon: "close" as const, destructive: true, testID: "est-m-revoke" }] : []),
    ...(!tech && (e.status === "declined" || (!!e.linkRevokedAt && e.status !== "approved")) ? [{ key: "archive" as const, label: t("m2403.archive"), icon: "box" as const, testID: "est-m-archive" }] : []),
    ...(!tech && e.status === "approved" ? [{ key: "signedNote" as const, label: t("m2403.signedNote"), muted: true, testID: "est-m-signed" }] : []),
  ];
  return [g1, g2, g3].filter((x) => x.length).flatMap((x, i) => x.map((it, j) => (i > 0 && j === 0 ? { ...it, group: true } : it)));
}

/**
 * What the estimate's screen (`EstimateObject`) and the panel beside the list on 1280 (`EstimateCardBody`) share: who may do what,
 * the PDF with its C5 check, «⋯»'s actions and the sheets they open (send, PDF check, «Сохранить как шаблон»).
 */
function useEstimateCore(e: Estimate, openSend?: boolean) {
  const store = useStore();
  const { db } = store;
  const { t, money, day } = useI18n();
  const toast = useToast();
  const [method, setMethod] = useState<PaymentMethod>("card");
  // #1113: who may send — the office side (a tech with the link could sign as the client, spec 35 §4д п.10); `?send=1`
  // opens the sheet only for them
  const maySend = canServe(db, e.customerId) && canSeeClientLink(store.role);
  const [sendOpen, setSendOpen] = useState(!!openSend && maySend);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const customer = db.customers.find((c) => c.id === e.customerId);
  const property = db.properties.find((p) => p.id === e.propertyId);
  const st = estimateStatusView(e.status);
  const q = (msg: string) => (store.online ? msg : t("offline.queued"));
  const universal = isUniversal(e);
  const facts = [
    e.depositCents ? t("est.deposit", { amount: money(e.depositCents) }) : null,
    e.sentAt ? `${t("st.sent")} ${day(e.sentAt)}` : null,
    universal ? t("ue.nOptions", { n: e.doc.options.length }) : null,
  ].filter(Boolean);
  const tplHeld = useHeldSheet(universal && tplOpen ? e : null); // the sheet goes out before it is unmounted (#1163)
  // the office: the margin, or why it is not counted (debt 5); who may not see costs (a tech, sales without view_costs —
  // the server's app.can_view_costs, features/access.ts seeCosts) never sees it: their lines come without costs (review PR-A №1)
  const margin = seeCosts(db, store.role, store.mode) ? marginView(e) : null;
  const job = db.jobs.find((j) => j.estimateId === e.id);

  // C5 for the PDF (spec 33 П23.10): an unsigned estimate's PDF goes to the client by hand — the same check as «Отправить»
  const pdfIssues = (e.status === "draft" || e.status === "sent") && e.doc ? sendIssues(e.doc, { firstSend: e.status === "draft" }) : null;
  // C5b (spec 33 П23.11): the modules' words on an open estimate (e.g. «the measurement changed after it»)
  const notes = estimateNotes(db, e);
  const pdf = (checked = false) => {
    if (!checked && pdfIssues && (issueCount(pdfIssues) > 0 || notes.length > 0)) return setPdfOpen(true);
    setPdfOpen(false);
    const p = portalFromEstimate(db, e, store.companyName ?? APP_NAME);
    saveEstimatePdf(estimateHtml(p, { lang: p.lang }), estimateFileName(p)).catch(() => toast.show(t("err.pdfSave")));
  };

  // #1412: one main button (the next step) and «⋯» with the rest in Б4's order (Изменить, PDF, the rest; the dangerous last; «…» where a
  // sheet asks for more) — no row of pills under the card
  // a client-signed estimate changes only through «don't sign — change it» (with a reason)
  const canEdit = universal && isEstimateEditable(e.status) && e.status !== "awaiting_countersign";
  // sending (and its «Copy link») is the office side's: a tech with the link could sign as the client (spec 35 §4д п.10)
  const canSend = universal && (e.status === "draft" || e.status === "sent") && maySend;
  // E2b: only an unsigned link can be revoked (the signed client keeps their copy); director and office
  const canRevoke = universal && !!e.token && !e.linkRevokedAt && (e.status === "sent" || e.status === "draft") && canManageLink(store.db, store.db.me);
  const actions: { key: EstAction; label: string; icon: "pencil" | "user" | "copy" | "invoice" | "close"; destructive?: boolean; testID: string }[] = [
    ...(canEdit ? [{ key: "edit" as const, label: t("ue.edit"), icon: "pencil" as const, testID: "est-act-edit" }] : []),
    ...(universal ? [{ key: "pdf" as const, label: t("ue.pdf"), icon: "invoice" as const, testID: "est-act-pdf" }] : []),
    // the client's page only for the office side (spec 35 §4д п.10)
    ...(universal && e.token && canSeeClientLink(store.role) ? [{ key: "client" as const, label: t("ue.openClient"), icon: "user" as const, testID: "est-act-client" }] : []),
    // E3 (spec 07 §11): any status; the director and the office (the server refuses others — never queued)
    ...(universal && e.doc && canEditEstimateTemplates(store.role) && !store.db.estimateTemplatesMissing ? [{ key: "template" as const, label: t("est.view.saveTemplate"), icon: "copy" as const, testID: "est-act-template" }] : []),
    // undone by the toast's «Отменить» (rule 5): no dialog (Б4 — a dialog only for what cannot be undone)
    ...(canRevoke ? [{ key: "revoke" as const, label: t("est.revoke.button"), icon: "close" as const, destructive: true, testID: "est-act-revoke" }] : []),
  ];
  const act = (k: EstAction) => {
    if (k === "edit") router.push(`/estimate/new?id=${e.id}`);
    else if (k === "client" && e.token) router.push(`/p/${e.token}`);
    else if (k === "template") setTplOpen(true);
    else if (k === "pdf") pdf();
    else if (k === "revoke") toast.show(t("est.revoke.done"), store.revokeEstimateLink(e.id));
  };
  const sheets = (
    <>
      {universal && maySend ? <SendSheet e={e} visible={sendOpen} onClose={() => setSendOpen(false)} /> : null}
      {tplHeld.value ? <SaveTemplateSheet key={tplHeld.opening} e={tplHeld.value} visible={tplHeld.visible} onExited={tplHeld.onExited} onClose={() => setTplOpen(false)} /> : null}
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
  return { store, db, t, money, day, toast, method, setMethod, maySend, sendOpen, setSendOpen, customer, property, st, q, universal, facts, margin, job, notes, pdf, canEdit, canSend, canRevoke, actions, act, sheets };
}

export function EstimateCardBody({ e, openSend, frame }: { e: Estimate; openSend?: boolean; frame?: EstimateFrame }) {
  const { store, db, t, money, day, toast, method, setMethod, setSendOpen, st, q, universal, facts, margin, job, notes, canSend, actions, act, sheets } = useEstimateCore(e, openSend);
  const moreRef = useRef<ComponentRef<typeof View>>(null);
  const [moreAt, setMoreAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const label = [e.number, e.title].filter(Boolean).join(" · ");
  const more = actions.length ? (
    <View ref={moreRef} collapsable={false} testID="est-more">
      <IconButton
        icon="more"
        label={label ? `${t("est.actions")}: ${label}` : t("est.actions")}
        onPress={() => moreRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setMoreAt({ x, y, w, h }))}
      />
    </View>
  ) : null;
  const sendButton = (bar: boolean) =>
    canSend ? (
      <View testID="est-send" style={bar ? undefined : { alignSelf: "flex-start" }}>
        {/* a sent estimate is sent again (not «Отправить клиенту» — it reads as not sent yet); from 820 as wide as its words */}
        <Button label={t(e.status === "sent" ? "est.view.sendAgain" : "ue.send")} icon="send" size={bar ? "bar" : undefined} full={bar} onPress={() => setSendOpen(true)} />
      </View>
    ) : null;

  const body = (
    <>
      <Card status={st.s}>
        <RowView style={{ justifyContent: "space-between" }}>
          {/* beside the status chip in the 360 panel the name needs a third line before «…» (#1728) */}
          <T v="heading" style={{ flex: 1 }} numberOfLines={3}>
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
            <View testID="est-margin-missing" style={{ maxWidth: "100%" }}>
              <StatusChip status="warn" soft label={t("est.marginMissing", { n: margin.lines })} />
            </View>
          ) : null}
          {/* the facts joined by «·» between them, not before the first one (#1427 031) */}
          {facts.length ? (
            <T v="caption" tone="mut">
              {facts.join(" · ")}
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
          {e.status === "draft" && store.role === "tech" && canServe(db, e.customerId) ? <View testID="est-send-office"><T v="caption" tone="mut">{t("est.tech.officeSends")}</T></View> : null}
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

      {sheets}
      <Menu
        visible={!!moreAt}
        anchor={moreAt}
        title={t("est.actions")}
        items={estimateMenu(e, t as never, { role: store.role, manage: canManageLink(db, db.me), me: db.me, templatesMissing: !!store.db.estimateTemplatesMissing })}
        onSelect={(k) => {
          setMoreAt(null);
          if (k === "client" || k === "template") act(k);
          else toast.show(t("m2403.mockToast"));
        }}
        onClose={() => setMoreAt(null)}
      />
    </>
  );
  const main = sendButton(false);
  const mainBar = sendButton(true);
  if (frame) return frame({ more, main, mainBar, body });
  return (
    <>
      {more || main ? (
        <RowView style={{ justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>{main}</View>
          {more}
        </RowView>
      ) : null}
      {body}
    </>
  );
}

type EstSection = "doc" | "sign";
type EstMore = EstAction | "signHere" | "reopen" | "decline";

/**
 * «Смета — просмотр» — the Object template (prototype v2 #2350, LAYOUT-RULES §3, BUILD-SPEC §2.8, object-cards «Смета»).
 * The screen's one job: bring the estimate to a signature and a deposit — «Отправить → Подписать → Задаток».
 * ObjectHeader («EST-0006 · название», «статус · сумма · задаток» once, the client ›; ⌄ — the address, the facts, the margin, the
 * direction) → IconRow: SMS · Почта · Ссылка · PDF · Изменить → ONE main step by the state (a 40 button by its words, the reason
 * under it): draft → «Отправить клиенту»; sent → «Напомнить»; signed by the client → «Подписать договор»; approved → «Взять задаток
 * · $X» or «Запланировать работу»; none after that → the sections «Смета · Подпись на месте» (the client signs on this phone —
 * there the signature's own button is the step, the screen draws no other). «⋯»: «Подписать здесь», «Как видит клиент»,
 * «Сохранить как шаблон», «Не подписывать — изменить», «Отказать», «Отозвать ссылку» (red, last).
 */
export function EstimateObject({ e, openSend, back }: { e: Estimate; openSend?: boolean; back: () => void }) {
  const { store, db, t, money, day, toast, method, setMethod, setSendOpen, customer, property, st, q, universal, margin, job, notes, pdf, canEdit, canSend, actions, act, sheets } = useEstimateCore(e, openSend);
  const quick = useSendGo(e, false);
  const [section, setSection] = useState<EstSection>("doc");
  const [ask, setAsk] = useState<"reopen" | "decline" | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const planner = canPlan([store.role]);
  const visits = job ? db.visits.filter((v) => v.jobId === job.id) : [];
  const mine = mySignature(db, db.me);
  const signer = canCountersign(db, db.me);
  const manage = canManageLink(db, db.me);
  const a = e.approval;
  // the client signs on this phone: an unsigned universal estimate; the company signs: one the client signed (S8b)
  const signHere = universal && (e.status === "draft" || e.status === "sent");
  const countersign = universal && e.status === "awaiting_countersign";
  const sections: { key: EstSection; label: string }[] = signHere || countersign ? [{ key: "doc", label: t("proto.est.sec.doc") }, { key: "sign", label: t(countersign ? "proto.est.sec.countersign" : "proto.est.sec.sign") }] : [];
  const onSign = sections.length > 0 && section === "sign";
  const depositDue = e.status === "approved" && !job && !!e.depositCents && !e.depositPaidAt;
  const toSchedule = e.status === "approved" && !!job && visits.length === 0 && planner;
  const sentOn = e.sentAt ? t("proto.est.reason.sentOn", { date: day(e.sentAt) }) : undefined;

  // ONE main step by the state (object-cards «Смета»); in «Подпись на месте» the signature's own button is the step
  const main: MainAction | undefined = onSign
    ? undefined
    : canSend
      ? e.status === "sent"
        ? { label: t("proto.est.main.remind"), onPress: () => setSendOpen(true), reason: e.viewedAt ? t("proto.est.reason.viewed", { date: day(e.viewedAt) }) : sentOn, testID: "est-send" }
        : { label: t("ue.send"), onPress: () => setSendOpen(true), reason: t("proto.est.reason.notSeen"), testID: "est-send" }
      : countersign && signer
        ? {
            label: t("est.countersign.sign"),
            // the saved signature signs at once («Отменить» on the toast); none yet — the pad in «Подпись»
            onPress: mine
              ? () => {
                  haptics.success();
                  toast.show(store.online ? t("est.countersign.done") : t("offline.queued"), store.countersignEstimate(e.id, { savedId: mine.id }));
                }
              : () => setSection("sign"),
            reason: a?.at ? t("est.countersign.clientSigned", { name: a.signerName, date: day(a.at) }) : t("est.countersign.clientSignedNoDate"),
            testID: "est-countersign-main",
          }
        : depositDue
          ? { label: t("proto.est.main.deposit", { amount: money(e.depositCents ?? 0) }), onPress: () => setDepositOpen(true), reason: t("proto.est.reason.deposit"), testID: "est-deposit-main" }
          : toSchedule
            ? { label: t("sch.title"), onPress: () => router.push(`/job/schedule?jobId=${job!.id}`), reason: t("ue.toSchedule"), testID: "est-schedule-main" }
            : undefined;
  // a second step goes into «⋯» on an object: «Подписать здесь» — the client is beside you
  // #2403 (CRM review 4): not in «⋯» — the tab «Подпись на месте» is the one place for it
  const second: MainAction | undefined = undefined;

  const who = customer?.name ?? "";
  const of = (what: string) => (who ? t("proto.money.actOf", { what, who }) : what);
  const send = (how: "sms" | "email" | "copy") => () => {
    // C5 or a module's word stops it: the sheet shows why and the way out
    if (quick.issues) return setSendOpen(true);
    void quick.go(how);
  };
  // QuickActions — the icon and its word (П6): sending (the office, an unsigned estimate) · PDF · Изменить (≤ 5)
  const iconActions: IconRowItem[] = [
    ...(canSend
      ? [
          { icon: "sms" as const, label: t("proto.money.act.sms"), a11y: of(t("ue.sendSms")), onPress: send("sms"), disabled: !customer?.phone, testID: "est-act-sms" },
          { icon: "mail" as const, label: t("proto.money.act.mail"), a11y: of(t("ue.sendEmail")), onPress: send("email"), disabled: !customer?.email, testID: "est-act-email" },
          { icon: "link" as const, label: t("proto.money.act.link"), a11y: of(t("ue.copyLink")), onPress: send("copy"), testID: "est-act-copy" },
        ]
      : []),
    ...(universal ? [{ icon: "invoice" as const, label: t("proto.money.act.pdf"), a11y: of(t("ue.pdf")), onPress: () => pdf(), testID: "est-act-pdf" }] : []),
    ...(canEdit ? [{ icon: "pencil" as const, label: t("ue.edit"), a11y: of(t("ue.edit")), onPress: () => act("edit"), testID: "est-act-edit" }] : []),
  ].slice(0, 5);
  const moreList: MoreAction = [
    ...estimateMenu(e, t as never, { role: store.role, manage, me: db.me, templatesMissing: !!store.db.estimateTemplatesMissing }),
    ...(countersign && manage ? [{ key: "reopen", label: t("est.reopen.button"), icon: "pencil" as const, testID: "est-act-reopen" }, { key: "decline", label: t("est.decline.button"), icon: "close" as const, testID: "est-act-decline" }] : []),
  ];
  const onMore = (k: string) => {
    const key = k as EstMore;
    if (key === "reopen" || key === "decline") return setAsk(key);
    if (key === "signHere") return setSection("sign");
    if (key === "client" || key === "template") return act(key);
    toast.show(t("m2403.mockToast"));
  };

  const address = [property?.address, property?.city].filter(Boolean).join(", ");
  const details = (
    <View style={{ gap: space[2] }}>
      {address ? (
        <T v="caption" tone="mut">
          {address}
        </T>
      ) : null}
      {/* the deposit and «отправлена» are said once already (the client line, the reason under the step): only the options here */}
      {universal && (e.doc?.options.length ?? 0) > 1 ? (
        <T v="caption" tone="mut">
          {t("ue.nOptions", { n: e.doc!.options.length })}
        </T>
      ) : null}
      {margin?.kind === "pct" ? (
        <View testID="est-margin">
          <T v="caption" tone="mut">
            {t("est.margin", { p: margin.pct })}
          </T>
        </View>
      ) : null}
      {margin?.kind === "missing" ? (
        <View testID="est-margin-missing" style={{ alignSelf: "flex-start", maxWidth: "100%" }}>
          <StatusChip status="warn" soft label={t("est.marginMissing", { n: margin.lines })} />
        </View>
      ) : null}
      {/* T2 (S16): the direction of the business; read-only once the client signed — the job keeps its own */}
      <ServiceCategoryRow value={e.serviceCategoryId} readOnly={!canChangeEstimateCategory(e.status, store.role)} onChange={(cid) => toast.show(q(t("dir.changed")), store.setEstimateCategory(e.id, cid))} />
    </View>
  );

  const doc = e.doc;
  const docView = (() => {
    if (!universal || !doc) return <LegacyBody e={e} />;
    if (e.status === "approved" && a) return <ApprovedCard e={e} jobId={job?.id} noPlan={toSchedule} />;
    if (e.status === "declined") return (
      <>
        <DeclinedCard e={e} />
        <EstimateView doc={clientDoc(doc)} optionId={mainOption(doc).id} addonIds={[]} readOnly terms={clientTerms(db, e)} />
      </>
    );
    // signed by the client: what they chose; unsigned: the document as the client will read it (no hidden $0 lines, no costs)
    return <EstimateView doc={clientDoc(doc)} optionId={a?.optionId ?? mainOption(doc).id} addonIds={a?.addonIds ?? []} readOnly terms={clientTerms(db, e)} />;
  })();
  // #2363 (founder 21.11: «кнопка „Отправить клиенту“ сдвигает контент»): with the «Смета · Подпись на месте» strip the step lived
  // ABOVE the strip and left on «Подпись» — the strip and all under it jumped 79 pt. Now the step is the first thing of «Смета»
  // itself, under the strip (ObjectScreen `mainBelowSections`): the strip stands still on both sections
  const body = (
    <>
      {notes.map((n) => (
        <ModuleNoteCard key={`${n.module}-${n.id}`} n={n} />
      ))}
      {e.status === "draft" && store.role === "tech" && canServe(db, e.customerId) ? (
        <View testID="est-send-office">
          <T v="caption" tone="mut" numberOfLines={1}>
            {t("est.tech.officeSends")}
          </T>
        </View>
      ) : null}
      {onSign ? (countersign ? <CountersignCard e={e} onAsk={setAsk} /> : <OnSiteSign e={e} />) : docView}
      {!onSign && job && e.status === "approved" ? <ContractStatement jobId={job.id} /> : null}
      {!onSign && e.status === "approved" && !job && e.depositCents && e.depositPaidAt ? <StatusNote tone="ok">{t("est.depositPaid")}</StatusNote> : null}
    </>
  );

  return (
    <>
      <ObjectScreen<EstSection>
        testID="estimate-screen"
        back={back}
        header={{
          testID: "estimate-head",
          // the number alone is the name (30 → 22,5, then «…»): with the work's title too it took the line and cut the status off;
          // the work goes into the line under it, after the client
          title: e.number || e.title || t("est.detail"),
          status: { name: st.s, label: t(st.l) },
          amount: money(e.totalCents),
          // «Linda Alvarez › · задаток $77.24» (object-cards): who, and what is taken before the work — once
          link: customer ? { label: [customer.name, e.number ? e.title : "", e.depositCents ? t("proto.est.depositShort", { amount: money(e.depositCents) }) : ""].filter(Boolean).join(" · "), onPress: () => router.push(`/client/${customer.id}`) } : undefined,
          details,
          labels: { expand: t("ds.proto.expand"), collapse: t("ds.proto.collapse"), more: (n) => t("ds.proto.moreN", { n }) },
        }}
        actions={iconActions}
        main={main}
        mainBelowSections
        second={second}
        sections={sections}
        section={section}
        onSection={setSection}
        sectionsLabel={t("proto.est.sections")}
        more={moreList}
        onMore={onMore}
      >
        {body}
      </ObjectScreen>
      {sheets}
      {countersign ? <ReasonSheets e={e} sheet={ask} onClose={() => setAsk(null)} /> : null}
      {/* «Взять задаток»: the way, then the record (prototype — the payment sheet of the invoice comes with the deposit invoice) */}
      <Sheet visible={depositOpen} onClose={() => setDepositOpen(false)} title={t("est.depositDue")}>
        <View testID="est-deposit-sheet" style={{ gap: space[3] }}>
          <T v="display" tabular>
            {money(e.depositCents ?? 0)}
          </T>
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
          <View testID="est-deposit-record">
            <Button
              label={t("est.recordDeposit")}
              icon="dollar"
              full
              onPress={() => {
                setDepositOpen(false);
                toast.show(q(t("est.depositToast", { amount: money(e.depositCents ?? 0) })), store.payDeposit(e.id, method));
              }}
            />
          </View>
        </View>
      </Sheet>
    </>
  );
}

/** `noPlan` — the screen's main step is «Запланировать работу» already (the estimate's screen): the card does not repeat it */
function ApprovedCard({ e, jobId, noPlan }: { e: Estimate; jobId?: string; noPlan?: boolean }) {
  const { t, day, time } = useI18n();
  const { db, role } = useStore();
  // #2016: «Запланировать» opens a screen of the planners only — the others see where the job stands, not the button
  const planner = canPlan([role]);
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
            {/* v2 «одна жёлтая на экран»: beside the deposit card (its «Взять задаток» is the step first) the plan is the dark one */}
            {planner && !noPlan ? <Button label={t("sch.title")} icon="calendar" variant="secondary" onPress={() => router.push(`/job/schedule?jobId=${jobId}`)} /> : null}
          </>
        ) : null}
        {visits.map((v) => (
          <T key={v.id} v="body" tabular>
            {t("ue.scheduledOn", { date: day(v.start), time: visitWhen(v, time, t("plan5.allDay"), false) })}
          </T>
        ))}
        {jobId && visits.length && planner ? (
          <Button label={t("sch.another")} icon="plus" variant="ghost" size="sm" onPress={() => router.push(`/job/schedule?jobId=${jobId}`)} />
        ) : null}
      </Card>
      <EstimateView doc={clientDoc(doc)} optionId={a.optionId} addonIds={a.addonIds} readOnly terms={clientTerms(db, e)} />
    </>
  );
}

/** #1304: the Terms the client reads before signing on site — the same rule as /p/ and the PDF (termsForClient) */
const clientTerms = (db: DB, e: Estimate) =>
  termsForClient(e.doc, db.company, docLanguageFor(db, { customerId: e.customerId, leadId: e.leadId }), !!e.approval || e.status === "approved" || e.status === "awaiting_countersign");

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
  // the phone is handed to the client: they read what /p/ and the PDF show (no hidden $0 lines, no costs), in THEIR language (rule 7)
  const clientLang = docLanguageFor(store.db, { customerId: e.customerId, leadId: e.leadId });
  const shown = useMemo(() => clientDoc(doc), [doc]);
  return (
    <>
      <I18nOverride lang={clientLang}>
        <View testID="sign-client-doc" style={{ gap: space[3] }}>
          <EstimateView doc={shown} optionId={optionId} onOption={setOptionId} addonIds={addonIds} onAddons={setAddonIds} terms={clientTerms(store.db, e)} />
        </View>
      </I18nOverride>
      <View testID="onsite-sign">
        <SectionTitle title={t("est.signOnSite")} />
      </View>
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
          <I18nOverride lang={clientLang}>
            <SignBlock
              defaultName={customer?.name ?? ""}
              onSign={(name, svg) => {
                haptics.success();
                const undo = store.approveEstimate(e.id, { optionId, addonIds, signerName: name, signature: svg, channel: "on_site" });
                toast.show(store.online ? t("est.signedToast", { name }) : t("offline.queued"), undo);
              }}
            />
          </I18nOverride>
        </Card>
      )}
    </>
  );
}

/**
 * Sending an estimate by SMS, email or its link (C5 first; «do not service» sends nothing; a taxed draft of a now tax-exempt client
 * is re-saved before it goes). The send sheet and the estimate screen's SMS · Почта · Ссылка icons share it. `force` — «Всё равно».
 */
function useSendGo(e: Estimate, force: boolean) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const customer = store.db.customers.find((c) => c.id === e.customerId);
  const company = store.companyName ?? APP_NAME;
  /** to the client in the client's language (rule 7), whatever the app language is */
  const msg = (url: string) => estimateMessage(docLanguageFor(store.db, { customerId: e.customerId, leadId: e.leadId }), { company, name: customer?.name ?? "", totalCents: e.totalCents, number: e.number, link: url });
  // C5 (spec 33 П23.9): «Всё равно отправить» for a test price / a line not in the measurement; never for «нет цены»
  const check = beforeSend(store.db, e, { force });
  const notes = estimateNotes(store.db, e);
  const issues = linesOrNotes(check, notes, force);
  /** the store's send — into the queue at once (rule 6), its «Отменить» (rule 5); null when it may not go (and the toast says why) */
  const queue = (): { undo: GuardedUndo; url: string } | null => {
    // «do not service» sends nothing; a taxed draft of a client who became «Без налога» is re-saved first (04 §12)
    const pre = beforeSend(store.db, e, { force });
    if (!pre.ok) return pre.reason === "no_service" ? (toast.show(t("client.noServiceHint")), null) : null;
    if (notes.length && !force) return null;
    if (pre.resave) store.saveEstimate({ id: e.id, customerId: e.customerId, propertyId: e.propertyId, title: e.title, doc: pre.resave, leadId: e.leadId });
    const token = e.token ?? newToken();
    return { undo: store.sendEstimate(e.id, token), url: clientLink(token) };
  };
  /** what goes to the client once the send is final: the SMS / mail with the link, or the link copied */
  const deliver = async (how: "sms" | "email" | "copy", url: string): Promise<boolean> => {
    try {
      if (how === "sms") await openSms(customer?.phone ?? "", msg(url).text);
      if (how === "email") await openEmail(customer?.email ?? "", msg(url).subject, msg(url).text);
      if (how === "copy") await copyText(url);
      return true;
    } catch {
      toast.show(t("err.linkSend"));
      return false;
    }
  };
  /** true when it went (the caller clears its «Всё равно») */
  const go = async (how: "sms" | "email" | "copy"): Promise<boolean> => {
    const q = queue();
    if (!q) return false;
    if (!(await deliver(how, q.url))) return false;
    toast.show(how === "copy" ? t("ue.linkCopied") : t("est.sentToast", { name: customer?.name ?? "" }), e.status === "draft" ? q.undo : undefined);
    return true;
  };
  return { customer, notes, issues, go, queue, deliver };
}

/**
 * «Отправить клиенту» (#2218, visual v2 «Шторка»): who and where; the check (C5) when something holds it; ONE main button — by SMS
 * when there is a phone, else by mail — that, pressed, puts the send into the queue at once and counts «Отменить · 5 … 1» in itself
 * (rule 5: a press takes it back; after 5 s the SMS / mail with the link opens); under it two in a row: the other way and «Ссылка».
 */
function SendSheet({ e, visible, onClose }: { e: Estimate; visible: boolean; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [force, setForce] = useState(false);
  const { customer, notes, issues, go: send, queue, deliver } = useSendGo(e, force);
  const pending = useRef<{ how: "sms" | "email"; url: string } | null>(null);
  const undoSend = useUndoSend(
    () => {
      const q = queue();
      if (!q) return () => undefined;
      pending.current = { how: pending.current?.how ?? "sms", url: q.url };
      return q.undo;
    },
    () => {
      const p = pending.current;
      pending.current = null;
      if (!p?.url) return;
      void deliver(p.how, p.url).then((ok) => (ok ? toast.show(t("est.sentToast", { name: customer?.name ?? "" })) : undefined));
      setForce(false);
    },
  );
  const counting = undoSend.phase === "counting";
  const close = () => {
    setForce(false);
    onClose();
  };
  const go = async (how: "sms" | "email" | "copy") => {
    if (await send(how)) setForce(false);
  };
  const mainHow: "sms" | "email" | null = customer?.phone ? "sms" : customer?.email ? "email" : null;
  const pressMain = (how: "sms" | "email") => {
    if (!counting) pending.current = { how, url: "" };
    const was = undoSend.phase;
    undoSend.press();
    if (was === "counting") toast.show(t("w2m.send.cancelled"));
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
        <View testID="send-buttons" style={{ gap: space[2] }}>
          {mainHow ? (
            <View testID={counting ? "send-undo" : mainHow === "sms" ? "send-sms" : "send-email"}>
              <Button
                label={counting ? t("w2m.send.undo", { s: undoSend.left }) : t("ue.send")}
                accessibilityLabel={counting ? t("w2m.send.undoA11y", { s: undoSend.left }) : `${t("ue.send")}: ${t(mainHow === "sms" ? "ue.sendSms" : "ue.sendEmail")}`}
                icon={counting ? "undo" : mainHow === "sms" ? "message" : "send"}
                variant={counting ? "secondary" : "primary"}
                size="bar"
                full
                onPress={() => pressMain(mainHow)}
                disabled={!!issues}
              />
            </View>
          ) : null}
          {/* the other way and «Ссылка» — two in a row (compact, visual v2) */}
          <RowView gap={space[2]}>
            {mainHow === "sms" && customer?.email ? (
              <View testID="send-email" style={{ flex: 1, minWidth: 0 }}>
                <Button label={t("ue.sendEmail")} icon="send" variant="secondary" full onPress={() => pressMain("email")} disabled={!!issues || counting} />
              </View>
            ) : null}
            <View testID="send-copy" style={{ flex: 1, minWidth: 0 }}>
              <Button label={t("proto.money.act.link")} accessibilityLabel={t("ue.copyLink")} icon="link" variant="secondary" full onPress={() => go("copy")} disabled={!!issues || counting} />
            </View>
          </RowView>
          {counting ? (
            <View testID="send-going">
              <T v="caption" tone="mut">
                {t("w2m.send.going")}
              </T>
            </View>
          ) : null}
        </View>
        <Divider />
        <T v="caption" tone="mut">
          {t("ue.sendNote")}
        </T>
        {store.mode === "demo" ? (
          <StatusNote tone="warn">{t("ue.demoLink")}</StatusNote>
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

const CHECK_WORD = { noPrice: "ue.src.noPrice", testPrice: "ue.check.samplePrices", gone: "ue.src.gone" } as const;

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
            <StatusNote tone="warn">{t("est.rescission")}</StatusNote>
            <View testID="est-sign-on-site">
              <StackBackGestureOff />
              <SignaturePad
                consent="est.signConsent"
                onConfirm={(path) => {
                  haptics.success();
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
/** `onAsk` — the screen holds «Не подписывать — изменить» and «Отказать» (in its «⋯», `ReasonSheets`): the card does not draw them */
function CountersignCard({ e, onAsk }: { e: Estimate; onAsk?: (k: "reopen" | "decline") => void }) {
  const store = useStore();
  const { t, day, money } = useI18n();
  const toast = useToast();
  const [sheet, setSheet] = useState<"reopen" | "decline" | null>(null);
  const me = store.db.members.find((m) => m.id === store.db.me);
  const a = e.approval;
  const company = store.companyName ?? APP_NAME;
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
              <StatusNote tone="warn">{t("est.countersign.hisWarning")}</StatusNote>
            ) : null}
            {mine ? (
              <>
                <SignaturePreview svg={mine.svg} label={t("est.sig.title")} />
                <Button
                  label={t("est.countersign.useSaved")}
                  icon="check"
                  full
                  onPress={() => {
                    haptics.success();
                    toast.show(store.online ? t("est.countersign.done") : t("offline.queued"), store.countersignEstimate(e.id, { savedId: mine.id }));
                  }}
                />
              </>
            ) : null}
            <T v="caption" tone="mut">
              {mine ? t("est.countersign.orDraw") : t("est.countersign.becomesSaved")}
            </T>
            <StackBackGestureOff />
            <SignaturePad
              label={t("est.countersign.padLabel")}
              consent={null}
              confirmLabel={t("est.countersign.sign")}
              onConfirm={(path) => {
                haptics.success();
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
        {manage && !onAsk ? (
          <RowView style={{ flexWrap: "wrap" }}>
            <Button label={t("est.reopen.button")} icon="pencil" variant="secondary" size="sm" onPress={() => setSheet("reopen")} />
            <Button label={t("est.decline.button")} icon="close" variant="ghost" size="sm" onPress={() => setSheet("decline")} />
          </RowView>
        ) : null}
      </Card>
      {onAsk ? null : <ReasonSheets e={e} sheet={sheet} onClose={() => setSheet(null)} />}
    </>
  );
}

/** «Не подписывать — изменить» (back to a draft, then the editor) and «Отказать» — both with a reason (the director and the office) */
function ReasonSheets({ e, sheet, onClose }: { e: Estimate; sheet: "reopen" | "decline" | null; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  return (
    <>
      <EstimateReasonSheet
        visible={sheet === "reopen"}
        onClose={onClose}
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
        onClose={onClose}
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
function SaveTemplateSheet({ e, onClose, visible, onExited }: { e: Estimate; onClose: () => void; visible: boolean; onExited: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [name, setName] = useState(e.title);
  const [done, setDone] = useState(false);
  const save = () => {
    if (!e.doc || done || !name.trim()) return;
    // #1837: the template keeps the costs the phone holds unless the server said «no» (a write, not a view)
    const costsSeen = keepCosts(store.db);
    const exempt = !!store.db.customers.find((c) => c.id === e.customerId)?.taxExempt;
    const tpl = { id: uid(), name, doc: toTemplateDoc(e.doc, costsSeen, exempt) };
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
    <Sheet visible={visible} onExited={onExited} onClose={onClose} title={t("est.tpl.saveAs")}>
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
