import { ModulePlaces } from "@/modules/ModulePlaces";
import { visitDueCents } from "@/features/visitDue";
import { signedAction } from "@/features/visitSignedAction";
import { lateAfterOf } from "@/features/scheduleSettings";
import { useRef, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space, size } from "@octo/design-tokens";
import { jobProfit, useStore, visitContext } from "@/data/store";
import { canSeeProfit } from "@/nav/roles";
import { fabItems } from "@/nav/sections";
import { haptics } from "@/ui/haptics";
import type { PaymentMethod } from "@/data/types";
import { useI18n } from "@/i18n";
import { CancelNotifySheet, CancelVisitSheet, WhenWho } from "@/features/VisitForm";
import { NotesBlock } from "@/features/NotesBlock";
import { RelatedBlock } from "@/features/RelatedBlock";
import { canCancel, canNoShow, canPlan, mayMarkNoShow, visitEnd, visitWhen } from "@/features/schedule";
import { visitServable } from "@/features/jobs";
import { peopleOf } from "@/data/people";
import { cleanPhone, telHref } from "@/features/contactLinks";
import { smsWithBody } from "@/features/sms";
import { enRouteSms } from "@/features/jobHistory";
import { canSeeGateCode } from "@/features/properties";
import { linesOf } from "@/features/jobLines";
import { CallSheet, type CallPreset } from "@/features/comms/CallSheet";
import { MessageSheet, type MessagePreset } from "@/features/comms/MessageSheet";
import { useTheme } from "@/theme/ThemeProvider";
import { STEP_LABELS, stepIndex, visitStatus } from "@/features/visits";
import { SignaturePad } from "@/features/SignaturePad";
import { StackBackGestureOff } from "@/nav/StackBackGestureOff";
import { PhotoStrip } from "@/features/PhotoStrip";
import { canAddItem, canEditVisitItems, canTick, checklistGate, itemKind, visitSettings } from "@/features/checklist";
import { ChecklistCard, ChecklistEditor, MissingSheet } from "@/features/VisitChecklist";
import { OfficeLocation, TechLocation, useConsentQuestion } from "@/features/LocationParts";
import { Button, TextField } from "@/ui/controls";
import { SelectField } from "@/ui/selectField";
import { Icon, T } from "@/ui/primitives";
import { DoneCircle } from "@/ui/doneCircle";
import { Sheet, useToast, type MenuItem } from "@/ui/overlays";
import { Card, Empty, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { AccessNote } from "@/ui/accessNote";
import { ViewSteps } from "@/ui/viewTabs";
import { GroupRow, ListGroup } from "@/ui/groupedList";
import { mapsUrl, type OS } from "@/ui/listCardLayout";
import { ObjectScreen, type MainAction } from "@/ui/templates";
import type { IconRowItem } from "@/ui/iconRow";
import { canSeeVisit } from "@/features/access";
import { isoDayKey, todayKey } from "@/features/calendar";
import { plateHalves } from "@/features/planSlots";
import { StatusNote } from "@/ui/statusNote";
import { signedText } from "@/i18n/translate";

const haptic = () => haptics.medium();
type MoreKey = "checklist" | "addItem" | "noShow" | "backToWork" | "cancel";

/**
 * Выезд — the «Объект» template, the field one (BUILD-SPEC §2.6, object-cards.html «Выезд», wireframes-v2 №7; Jobber's visit:
 * call, SMS, route on top; access first; checklist, line items, time). Screen's job: drive the visit by its steps with one hand.
 * ObjectHeader (the client; «StatusPill · when · due»; «работа ›»; the address › — the platform's maps) → AccessNote first →
 * QuickActions «Позвонить · SMS · Маршрут · Камера» → the steps strip → the one list «Что сделать» + checklist → «Фото до» →
 * «Позиции · N ›» → «Время». ONE main step pinned at the bottom: «В пути → На месте → Начать → Завершить → Подпись →
 * Принять · $X / Закрыть выезд / Передать офису»; «Сделать смету» after an inspection. Rare and dangerous — «⋯».
 * Works offline.
 */
export default function VisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db } = store;
  const { t, time, day, money } = useI18n();
  const { c } = useTheme();
  const toast = useToast();
  const [method, setMethod] = useState<PaymentMethod>("card");
  // the «Не заполнено» sheet before the next step (docs/specs/08 §4): which step asks, and the signature it holds
  const [ask, setAsk] = useState<null | { step: "work" } | { step: "done" } | { step: "sign"; path: string }>(null);
  const [calling, setCalling] = useState<CallPreset | null>(null);
  const [writing, setWriting] = useState<MessagePreset | null>(null);
  // «Сообщить клиенту об отмене?» (docs/specs/03 §13): asked here, because the cancelled visit leaves `visits`
  const [cancelled, setCancelled] = useState<string | null>(null);
  // #2066 «Клиента нет дома»: the confirmation sheet (rule 5) and its optional note
  const [noShow, setNoShow] = useState(false);
  const [noShowNote, setNoShowNote] = useState("");
  const noShowSent = useRef(false);
  const [editingChecklist, setEditingChecklist] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  // «Завершить» at work: the client's signature is the end of the work — the body turns to the signature pad
  const [signing, setSigning] = useState(false);
  // «Камера»: the photos of this step in a sheet (before — on site, after — at work)
  const [camera, setCamera] = useState(false);
  // «Передать офису» (sales on a signed visit with money): one note per tap
  const handedOff = useRef(false);
  const v = db.visits.find((x) => x.id === id);
  // wave 7б-2: the location question comes before the first «On the way» on my own visit (docs/specs/03 §12)
  const consent = useConsentQuestion(v);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const cancelAsk = (
    <CancelNotifySheet
      visitId={cancelled}
      onClose={() => {
        setCancelled(null);
        // «Отменить» on the cancel toast brings the visit back: stay on it
        if (!v) router.canGoBack() ? router.back() : router.replace("/plan");
      }}
    />
  );

  if (!v)
    return (
      <Screen title={t("visit.title")} back={back}>
        {cancelled ? null : <Empty icon="alert" title={t("clients.empty")} />}
        {cancelAsk}
      </Screen>
    );
  // another tech's visit (#868): no access, as the server would answer
  if (!canSeeVisit(db, { role: store.role, mode: store.mode, me: db.me }, v.id))
    return (
      <Screen title={t("visit.title")} back={back}>
        <Empty icon="alert" title={t("mny.noAccess")} testID="no-access" />
      </Screen>
    );

  const { job, property, customer } = visitContext(db, v);
  const due = visitDueCents(db, v);
  const st = visitStatus(v, db.members, Date.now(), lateAfterOf(db), due);
  const idx = stepIndex(v.step);
  const before = v.photos.filter((p) => p.kind === "before");
  const after = v.photos.filter((p) => p.kind === "after");
  // #1431 «Повторить»: a photo the cloud did not take is sent again from this phone
  const retryPhoto = (pid: string) => toast.show(store.online ? t("photoUp.retried") : t("offline.queued"), store.retryPhoto(v.id, pid));
  // the photos the cloud did not take, on a step where the strips are not shown (before the work, after the signature)
  const failedHere = v.photos.filter((p) => p.upload);
  const gate = checklistGate(v, visitSettings(db), db.checklistTemplates ?? []);
  const queuedHint = () => (store.online ? undefined : t("offline.queued"));
  // «Перенести / Отменить»: the office only (owner / admin / office ↔ director / dispatcher), like cancel_visit on the server
  const office = canPlan([store.role]);

  // #2018: what «Подпись» offers — never a dead end, never «Принять оплату» on $0
  const signed = signedAction(store.role, due);
  const advance = (msg: string) => {
    haptic();
    const undo = store.advanceVisit(v.id);
    toast.show(queuedHint() ?? msg, undo);
  };
  const removePhoto = (photoId: string) => toast.show(queuedHint() ?? t("photo.deleted"), store.removePhoto(v.id, photoId));
  const addPhoto = (kind: "before" | "after") => (uri?: string) => toast.show(queuedHint() ?? t("toast.photo"), store.addPhoto(v.id, kind, uri));
  const sign = (path: string) => {
    haptic();
    setSigning(false);
    toast.show(queuedHint() ?? t("toast.step", { step: t("step.pay") }), store.signVisit(v.id, path));
  };
  // a warning, never a lock (founder 05.11): «Пропустить» marks what is left skipped and the step goes on
  const goWork = () => (gate.warnBeforeWork ? setAsk({ step: "work" }) : advance(t("toast.step", { step: t("step.working") })));
  const goDone = () => (gate.warnBeforeSign ? setAsk({ step: "done" }) : advance(t("toast.step", { step: t("st.done") })));
  const goSign = (path: string) => (gate.warnBeforeSign ? setAsk({ step: "sign", path }) : sign(path));
  const skipAndGo = () => {
    const a = ask;
    setAsk(null);
    if (!a) return;
    if (a.step !== "work" && gate.missing.items.length) store.skipItems(v.id, gate.missing.items);
    if (a.step === "work") advance(t("toast.step", { step: t("step.working") }));
    else if (a.step === "done") advance(t("toast.step", { step: t("st.done") }));
    else sign(a.path);
  };
  const isInspection = v.kind === "inspection" || (!v.jobId && !!v.leadId);
  // #2066: at the door — the visit's own person or the office, before the work (server: visit_no_show)
  const noShowOk = canNoShow(v) && mayMarkNoShow(store.role, db.me, v);
  const markNoShow = () => {
    if (noShowSent.current) return;
    noShowSent.current = true;
    haptic();
    setNoShow(false);
    // no «Отменить»: once sent the server has closed the visit (the sheet was the confirmation)
    store.markNoShow(v.id, noShowNote);
    toast.show(queuedHint() ?? t("noShow.toast"));
    back();
  };
  const makeEstimate = () => {
    if (v.leadId) {
      const target = store.leadEstimateTarget(v.leadId);
      if (target) return router.push(`/estimate/new?customerId=${target.customerId}&propertyId=${target.propertyId}&leadId=${v.leadId}`);
    } else if (customer && property) return router.push(`/estimate/new?customerId=${customer.id}&propertyId=${property.id}`);
    // nothing to tie the estimate to: say so instead of a silent button
    router.push("/estimate/new");
  };
  const tel = cleanPhone(customer?.phone);
  const [main] = customer ? peopleOf(customer) : [];
  // «Не обслуживаем» (17-job §11.1): no estimate from here; the visit itself is finished as usual
  const servable = visitServable(db, v);
  const call = () => {
    const href = telHref(tel);
    if (!href) return;
    Linking.openURL(href).catch(() => {});
    // wave 6: the call is written on the visit's job (an inspection — on its lead), the sheet asks the outcome
    if (v.jobId) setCalling({ subjectType: "job", subjectId: v.jobId, contactId: main?.id });
    else if (v.leadId) setCalling({ subjectType: "lead", subjectId: v.leadId });
  };
  const sms = () => {
    if (customer && main) return setWriting({ owner: { type: "customer", id: customer.id }, person: main });
    if (tel) Linking.openURL(smsWithBody(tel, "")).catch(() => {});
  };
  const addr = property ? [property.address, property.city].filter(Boolean).join(", ") : "";
  // «Маршрут»: the platform's own maps (#2353) through the one shared rule
  const route = () => Linking.openURL(mapsUrl(addr, Platform.OS as OS)).catch(() => {});
  // «В пути» marks the step; until our own number (#2352) nothing is said as sent — the phone's SMS opens with a ready text in
  // the CLIENT's language (rule 7), the tech sends it himself
  const enRoute = () =>
    consent.ask(() => {
      advance(t("proto.visit.enRouteDone"));
      if (tel) Linking.openURL(smsWithBody(tel, enRouteSms(db, customer?.id, time(v.start)))).catch(() => {});
    });
  const pay = () => {
    haptic();
    const undo = store.payVisit(v.id, method);
    toast.show(queuedHint() ?? t("toast.paid", { amount: money(visitDueCents(db, v)) }), undo);
  };
  const close = () => {
    // review of #2018: «Закрыть выезд» never takes money — if the amount changed since the screen drew it (a sync), nothing is
    // sent and the screen shows the amount with «Принять» again
    if (visitDueCents(store.db, v) > 0) return toast.show(t("visit.dueChanged"));
    haptic();
    toast.show(queuedHint() ?? t("toast.step", { step: t("st.done") }), store.payVisit(v.id, method));
  };
  // sales on a signed visit with money (#2018 closeOffice, audit: was a dead end): a note to the office on the job — the office
  // takes the money by the job's invoice; the note can be undone
  const handOff = () => {
    if (handedOff.current) return;
    handedOff.current = true;
    const subject = v.jobId ? { subjectType: "job" as const, subjectId: v.jobId } : v.leadId ? { subjectType: "lead" as const, subjectId: v.leadId } : null;
    if (!subject) return;
    toast.show(queuedHint() ?? t("proto.visit.handOffDone"), store.addNote({ ...subject, body: t("proto.visit.handOffNote", { amount: money(due) }), visibility: "team" }));
  };

  // THE one main step (BUILD-SPEC §2.6 table), pinned at the bottom
  const step: MainAction | null =
    v.step === "scheduled"
      ? { label: t("proto.visit.enRoute"), reason: t("proto.visit.enRouteWhy"), onPress: enRoute, testID: "visit-main-en-route" }
      : v.step === "en_route"
        ? { label: t("proto.visit.arrive"), reason: t("proto.visit.arriveWhy"), onPress: () => advance(t("toast.step", { step: t("step.on_site") })), testID: "visit-main-on-site" }
        : v.step === "on_site" && v.kind === "inspection"
          ? // an inspection ends on site with «Готово»: no work, signature or payment (S10, docs/specs/03 §4.1)
            { label: t("st.done"), reason: t("proto.visit.doneWhy"), onPress: goDone, testID: "visit-main-done" }
          : v.step === "on_site"
            ? {
                label: t("proto.visit.start"),
                reason: gate.missing.photosBefore > 0 ? t("chk.needBefore", { n: gate.missing.photosBefore }) : t("proto.visit.startWhy"),
                onPress: goWork,
                testID: "visit-main-work",
              }
            : v.step === "working" && !signing
              ? { label: t("proto.visit.finish"), reason: t("proto.visit.finishWhy"), onPress: () => setSigning(true), testID: "visit-main-finish" }
              : v.step === "working"
                ? // the pad's own «Подтвердить» signs; the bar says where to look
                  { label: t("proto.visit.sign"), reason: t("proto.visit.signWhy"), onPress: () => {}, disabled: true, testID: "visit-main-sign" }
                : v.step === "signed" && signed === "pay"
                  ? { label: t("proto.visit.take", { amount: money(due) }), reason: t("proto.visit.takeWhy"), onPress: pay, testID: "visit-record-payment" }
                  : v.step === "signed" && signed === "close"
                    ? { label: t("visit.close"), reason: t("proto.visit.closeWhy"), onPress: close, testID: "visit-close" }
                    : v.step === "signed"
                      ? { label: t("proto.visit.handOff"), reason: t("proto.visit.handOffWhy", { amount: money(due) }), onPress: handOff, testID: "visit-hand-off" }
                      : v.step === "done" && isInspection && servable
                        ? // after an inspection the main action is the estimate, lead and property filled in (13 §3.9, 17-job §7.2)
                          { label: t("job3.makeEstimate"), reason: t("proto.visit.estimateWhy"), onPress: makeEstimate, testID: "visit-main-estimate" }
                        : null;

  // «⋯» (K6): the checklist's order and text (the office), «Свой пункт», «Клиента нет дома», back from the signature, and —
  // apart, red, with its own sheet as the confirmation — «Отменить выезд»
  const mayEditChecklist = canEditVisitItems(store.role, v);
  const mayCancel = office && canCancel(v);
  const ticking = v.checklist.length > 0 && (v.step === "working" || (v.step === "on_site" && isInspection));
  const mayAddItem = (v.step === "working" || (v.step === "on_site" && isInspection)) && canAddItem(store.role, v, false);
  const more: MenuItem<MoreKey>[] = [
    ...(signing && v.step === "working" ? [{ key: "backToWork" as const, label: t("proto.visit.backToWork"), icon: "undo" as const, testID: "visit-act-back-to-work" }] : []),
    ...(mayEditChecklist ? [{ key: "checklist" as const, label: t("visit.editChecklist"), icon: "pencil" as const, testID: "visit-act-checklist" }] : []),
    ...(mayAddItem ? [{ key: "addItem" as const, label: t("visit.addCheckItem"), icon: "plus" as const, testID: "visit-act-add-item" }] : []),
    ...(noShowOk ? [{ key: "noShow" as const, label: t("noShow.btn"), icon: "alert" as const, testID: "visit-no-show" }] : []),
    ...(mayCancel ? [{ key: "cancel" as const, label: t("vc.title"), icon: "close" as const, destructive: true, testID: "visit-act-cancel" }] : []),
  ];
  const onMore = (k: string) => {
    if (k === "checklist") setEditingChecklist(true);
    else if (k === "addItem") setAddingItem(true);
    else if (k === "noShow") setNoShow(true);
    else if (k === "backToWork") setSigning(false);
    else if (k === "cancel") setCancelling(true);
  };
  // «＋»: photo · estimate (an inspection) · lead · expense (the visit's set, nav/sections)
  const makes = fabItems("visit", store.role, { visitId: v.id, customerId: servable ? customer?.id : undefined, propertyId: property?.id, leadId: v.leadId, inspection: v.kind === "inspection" });
  const create = makes.length ? { a11y: `${t("proto.job.create")}: ${customer?.name ?? t("visit.title")}`, items: makes.map((m) => ({ key: m.id, label: t(m.label), icon: m.icon, testID: `visit-create-${m.id}` })) } : undefined;
  const photoStep = v.step === "on_site" || v.step === "working";
  const onCreate = (k: string) => {
    const m = makes.find((x) => x.id === k);
    if (m?.act === "photo") return photoStep ? setCamera(true) : toast.show(t("proto.visit.cameraLater"));
    if (m?.href) router.push(m.href as never);
  };

  /* ---------- QuickActions row: Позвонить · SMS · Маршрут · Камера ---------- */
  const who = customer?.name ?? tel;
  const actions: IconRowItem[] = [
    ...(tel ? [{ icon: "phone" as const, label: t("proto.visit.call"), a11y: `${t("proto.visit.call")} ${who}`, onPress: call, testID: "visit-call" }] : []),
    ...(tel || main ? [{ icon: "sms" as const, label: t("proto.visit.sms"), a11y: `${t("proto.visit.sms")} ${who}`, onPress: sms, testID: "visit-act-message" }] : []),
    ...(addr ? [{ icon: "route" as const, label: t("proto.visit.route"), a11y: `${t("proto.visit.route")}: ${addr}`, onPress: route, testID: "visit-route" }] : []),
    {
      icon: "camera" as const,
      label: t("proto.visit.camera"),
      a11y: `${t("proto.visit.camera")}: ${who ?? t("visit.title")}`,
      onPress: () => setCamera(true),
      disabled: !photoStep,
      reason: photoStep ? undefined : t("proto.visit.cameraLater"),
      testID: "visit-camera",
    },
  ];

  // AccessNote first (BUILD-SPEC §2.6): the note, and the gate code — to the tech on the visit day and the day before
  const gateOk = property ? canSeeGateCode(db, store.role, property.id) : false;
  const accessText = property?.accessNotes?.trim();
  // a code not open yet is not drawn: the line says when it opens (AccessNote `locked`)
  const access = (
    <AccessNote
      testID="visit-access"
      label={t("job3.access")}
      text={accessText || undefined}
      code={property?.gateCode && gateOk ? property.gateCode : undefined}
      codeWord={t("prop.gate")}
      locked={property?.gateCode && !gateOk ? t("proto.job.gateLater") : undefined}
    />
  );

  const before0 = v.step === "scheduled" || v.step === "en_route" || v.step === "on_site";
  const est = job?.estimateId ? db.estimates.find((e) => e.id === job.estimateId) : undefined;
  const nLines = job ? (est ? est.lines?.length ?? 0 : linesOf(db, job.id).length) : 0;
  // visual v2 «Объект — Выезд» (audit 12 §1 K): the screen's object is the visit — «Выезд · 8:30–12:30»; the client is the line under
  // it (with the sum on the payment step), the status its pill; the job — once, as the «‹» parent and the link under the header
  // «8:30–12:30» as v2 draws it: the hours without AM / PM (the field's day; the full time is in «Когда и кто»), so the 30 title
  // keeps its one line (native shrinks it to fit, the web cuts it)
  const bare = (iso: string) => plateHalves(time(iso), time(iso))[0];
  const span = v.allDay ? t("plan5.allDay") : `${bare(v.start)}–${bare(visitEnd(v))}`;
  const header = {
    testID: "visit-head",
    title: t("w2a.visitTitle", { when: span }),
    meta: [{ id: "client", label: customer?.name ?? db.leads.find((l) => l.id === v.leadId)?.name ?? day(v.start) }],
    status: { name: st.status, label: t(st.label) },
    // the sum shows only on the payment step (wireframe №7); another day than today says its date
    amount: v.step === "signed" && due > 0 ? money(due) : isoDayKey(v.start) === todayKey() ? undefined : day(v.start),
    link: job ? { label: job.title, onPress: () => router.push(`/job/${job.id}`) } : undefined,
    address: addr ? { text: addr, onPress: route } : undefined,
    labels: { expand: t("proto.job.expand"), collapse: t("proto.job.collapse"), more: (n: number) => t("proto.job.moreN", { n }) },
  };

  return (
    <>
      <ObjectScreen
        testID="visit-screen"
        back={back}
        header={header}
        actions={actions}
        main={step ?? undefined}
        sections={[]}
        section="steps"
        onSection={() => {}}
        sectionsLabel={t("visit.title")}
        more={more}
        onMore={onMore}
        create={create}
        onCreate={onCreate}
      >
        {access}
        {/* the steps strip (SectionStrip `steps`): passed / now / next — not pressed */}
        <ViewSteps
          testID="visit-steps"
          label={t("proto.visit.steps")}
          items={STEP_LABELS.map((k) => ({ key: k, label: t(k) }))}
          value={idx < STEP_LABELS.length ? STEP_LABELS[idx]! : "done"}
        />
        {consent.sheet}

        {/* the signature: the end of the work (the bar says «Подпись клиента»; «⋯ → Вернуться к работе») */}
        {v.step === "working" && signing ? (
          <View testID="visit-signature" style={{ gap: space[2] }}>
            <SectionTitle title={t("step.sign")} />
            <Card>
              <StackBackGestureOff />
              <SignaturePad onConfirm={goSign} />
            </Card>
          </View>
        ) : null}

        {/* #2018 the payment: the method is a value of the form; «Принять · $X» is the bar */}
        {v.step === "signed" && signed === "pay" ? (
          <ListGroup testID="visit-pay" inset={space[4]}>
            <View testID="visit-amount-due">
              <GroupRow title={t("visit.amountDue")} value={money(due)} />
            </View>
            <View style={{ padding: space[4] }}>
              <SelectField<typeof method>
                testID="visit-method"
                label={t("visit.method")}
                value={method}
                onChange={setMethod}
                items={[
                  { key: "card", label: t("visit.payCard") },
                  { key: "cash", label: t("visit.payCash") },
                  { key: "check", label: t("visit.payCheck") },
                  { key: "zelle", label: t("visit.payZelle") },
                ]}
              />
            </View>
          </ListGroup>
        ) : null}

        {v.step === "paid" || v.step === "done" ? (
          <Card status="ok">
            <RowView>
              <Icon name="check" color={c.status.ok.text} />
              <T v="heading" tone="ok">
                {t("visit.completed")}
              </T>
            </RowView>
            <T v="body" tone="mut">
              {t(v.payment && v.payment.amountCents > 0 ? "visit.completedHint" : "visit.completedHintSigned")}
            </T>
            {job && canSeeProfit(store.role)
              ? (() => {
                  const p = jobProfit(db, job.id);
                  return (
                    <View style={{ gap: space[1] }}>
                      <RowView style={{ justifyContent: "space-between" }}>
                        <T v="body" tone="mut">
                          {t("job.profit")}
                        </T>
                        <T v="heading" tabular tone={p.profit >= 0 ? "ok" : "bad"}>
                          {money(p.profit)}
                          {p.marginPct !== null ? ` · ${signedText(p.marginPct)}%` : ""}
                        </T>
                      </RowView>
                      <T v="caption" tone="mut">
                        {t("job.revenue")} {money(p.revenue)} − {t("job.expenses")} {money(p.expenses)}. {t("job.laborNote")}
                      </T>
                    </View>
                  );
                })()
              : null}
            {/* a visit closed with nothing to pay keeps no «$0.00 · Карта» line (#2018) */}
            {v.payment && v.payment.amountCents > 0 ? (
              <T v="body" tabular>
                {money(v.payment.amountCents)} · {t(`visit.pay${v.payment.method[0].toUpperCase()}${v.payment.method.slice(1)}` as "visit.payCard")}
              </T>
            ) : null}
          </Card>
        ) : null}

        {/* the note for the tech from the visit form (docs/specs/03 §7.3): everyone on the visit sees it */}
        {v.note ? (
          <View testID="visit-note" style={{ gap: space[1] }}>
            <SectionTitle title={t("lead.book.note")} />
            <T v="body">{v.note}</T>
          </View>
        ) : null}

        {/* «Что сделать» and the checklist — one list (wireframe №7) */}
        {!signing && v.scope.length ? (
          <ListGroup title={t("visit.scope")} testID="visit-scope" inset={space[4]}>
            {v.scope.map((s, i) => (
              <GroupRow key={`${i}-${s}`} title={s} />
            ))}
          </ListGroup>
        ) : null}
        {editingChecklist && mayEditChecklist ? (
          <>
            <ChecklistEditor v={v} />
            <View testID="visit-checklist-done">
              <Button label={t("visit.editChecklistDone")} icon="check" variant="secondary" full onPress={() => setEditingChecklist(false)} />
            </View>
          </>
        ) : v.checklist.length > 0 && before0 && !(v.step === "on_site" && isInspection) ? (
          <Card>
            <RowView style={{ justifyContent: "space-between" }}>
              <T v="heading">{t("visit.checklist")}</T>
              <T v="caption" tone="mut">
                {t("check.preview", { n: v.checklist.length })}
              </T>
            </RowView>
            {v.checklist.map((item) =>
              itemKind(item) === "photo" ? (
                <RowView key={item.id} gap={space[3]} style={{ minHeight: size.hitMin }}>
                  <Icon name="camera" s={size.iconSm} color={c.mut} />
                  <T v="body" style={{ flex: 1 }}>
                    {item.label}
                  </T>
                </RowView>
              ) : (
                <DoneCircle key={item.id} testID={`chk-pre-${item.id}`} done={item.done} disabled={!canTick(store.role, v, !item.done)} label={item.label} title={item.label} onChange={() => store.toggleCheck(v.id, item.id)} />
              ),
            )}
          </Card>
        ) : null}
        {/* an inspection with a checklist (В6): ticked on site, checked before «Готово»; at work — the ticks card */}
        {(v.step === "on_site" && isInspection) || (v.step === "working" && !signing) ? (
          ticking || addingItem ? <ChecklistCard v={v} missing={gate.missing} adding={addingItem} onAdded={() => setAddingItem(false)} /> : null
        ) : null}

        {photoStep && !signing ? (
          <View testID="visit-photos-before" style={{ gap: space[2] }}>
            <SectionTitle title={v.step === "on_site" && v.kind !== "inspection" && gate.missing.photosBefore > 0 ? t("proto.visit.photoBeforeReq") : t("visit.photosBefore")} />
            <PhotoStrip photos={before} onAdd={addPhoto("before")} onRemove={removePhoto} onRetry={retryPhoto} />
          </View>
        ) : null}
        {v.step === "working" && !signing ? (
          <View testID="visit-photos-after" style={{ gap: space[2] }}>
            <SectionTitle title={t("visit.photosAfter")} />
            <PhotoStrip photos={after} onAdd={addPhoto("after")} onRemove={removePhoto} onRetry={retryPhoto} />
            {gate.missing.photosAfter > 0 ? <StatusNote tone="warn">{t("chk.needAfter", { n: gate.missing.photosAfter })}</StatusNote> : null}
          </View>
        ) : null}
        {!photoStep && failedHere.length ? (
          <View style={{ gap: space[2] }}>
            <SectionTitle title={t("photoUp.title")} />
            <PhotoStrip photos={failedHere} onRetry={retryPhoto} />
          </View>
        ) : null}

        {/* «Позиции · N ›» and «Время» (Jobber's visit order: instructions → checklist → line items → time) */}
        <ListGroup testID="visit-facts" inset={space[4]}>
          {job ? <GroupRow testID="visit-lines" title={t("proto.visit.lines", { n: nLines })} subtitle={t("proto.visit.linesHint")} onPress={() => router.push(`/job/${job.id}`)} /> : null}
          <GroupRow testID="visit-time" title={t("proto.visit.time")} subtitle={v.enRouteAt ? t("proto.visit.timeOnWay", { time: time(v.enRouteAt) }) : before0 ? t("proto.visit.timeNot") : visitWhen(v, time, t("plan5.allDay"))} />
        </ListGroup>

        {office ? <WhenWho visitId={v.id} /> : null}
        {office ? <OfficeLocation v={v} geo={property?.geo} /> : null}
        <TechLocation v={v} geo={property?.geo} />
        {/* add-on modules' place (spec 33 П24 А7): nothing unless a module is switched on */}
        <ModulePlaces place="visit" ctx={{ visitId: v.id, leadId: v.leadId, customerId: servable ? customer?.id : undefined, propertyId: property?.id }} />
        {job ? <NotesBlock subjectType="job" subjectId={job.id} /> : v.leadId ? <NotesBlock subjectType="lead" subjectId={v.leadId} /> : null}
        {/* one quiet line; the client, the job and the address are the header already */}
        <RelatedBlock line hide={["customer", "property", "job"]} of={{ type: "visit", id: v.id }} />
      </ObjectScreen>

      <MissingSheet v={v} missing={gate.missing} open={!!ask} step={ask?.step ?? "sign"} onFill={() => setAsk(null)} onSkip={skipAndGo} />
      <Sheet visible={camera && photoStep} onClose={() => setCamera(false)} title={t("proto.visit.photos")}>
        <View testID="visit-camera-sheet" style={{ gap: space[3] }}>
          <SectionTitle title={v.step === "working" ? t("visit.photosAfter") : t("visit.photosBefore")} />
          <PhotoStrip photos={v.step === "working" ? after : before} onAdd={addPhoto(v.step === "working" ? "after" : "before")} onRemove={removePhoto} onRetry={retryPhoto} />
        </View>
      </Sheet>
      <Sheet visible={noShow} onClose={() => setNoShow(false)} title={t("noShow.title")}>
        <View testID="no-show-sheet" style={{ gap: space[3] }}>
          <T v="body" tone="mut">
            {t("noShow.hint")}
          </T>
          <T v="caption" tone="mut">
            {t("noShow.photo")}
          </T>
          <PhotoStrip photos={before} onAdd={addPhoto("before")} onRemove={removePhoto} onRetry={retryPhoto} />
          <TextField type="note" label={t("noShow.note")} placeholder={t("noShow.notePh")} value={noShowNote} onChangeText={setNoShowNote} />
          <View testID="no-show-confirm">
            <Button label={t("noShow.confirm")} icon="check" full onPress={markNoShow} />
          </View>
          <View testID="no-show-keep">
            <Button label={t("noShow.keep")} variant="secondary" full onPress={() => setNoShow(false)} />
          </View>
        </View>
      </Sheet>
      {/* «Отменить выезд» asks the reason first — the sheet is the confirmation; a cancelled visit leaves the screens: the
          screen asks «Сообщить клиенту?» (cancelAsk outlives the visit), then goes back */}
      <CancelVisitSheet visitId={cancelling ? v.id : null} onClose={() => setCancelling(false)} onDone={setCancelled} />
      <CallSheet preset={calling} onClose={() => setCalling(null)} />
      <MessageSheet preset={writing} onClose={() => setWriting(null)} />
    </>
  );
}
