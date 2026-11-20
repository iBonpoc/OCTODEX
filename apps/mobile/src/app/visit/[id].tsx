import { ModulePlaces } from "@/modules/ModulePlaces";
import { visitDueCents } from "@/features/visitDue";
import { signedAction } from "@/features/visitSignedAction";
import { lateAfterOf } from "@/features/scheduleSettings";
import { useRef, useState, type ComponentRef, type RefObject } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { useScreenScroll } from "@/ui/requiredForm";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space, size } from "@octo/design-tokens";
import { jobProfit, useStore, visitContext } from "@/data/store";
import { canSeeProfit } from "@/nav/roles";
import { haptics } from "@/ui/haptics";
import type { PaymentMethod } from "@/data/types";
import { useI18n } from "@/i18n";
import { CancelNotifySheet, CancelVisitSheet, WhenWho } from "@/features/VisitForm";
import { NotesBlock } from "@/features/NotesBlock";
import { RelatedBlock } from "@/features/RelatedBlock";
import { canCancel, canNoShow, canPlan, mayMarkNoShow, visitWhen } from "@/features/schedule";
import { visitServable } from "@/features/jobs";
import { peopleOf } from "@/data/people";
import { cleanPhone, telHref } from "@/features/contactLinks";
import { smsWithBody } from "@/features/sms";
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
import { Button, IconButton, StatusChip, Steps, TextField } from "@/ui/controls";
import { SelectField } from "@/ui/selectField";
import { Icon, T, type IconKey } from "@/ui/primitives";
import { DoneCircle } from "@/ui/doneCircle";
import { Menu, Sheet, useToast, type MenuItem } from "@/ui/overlays";
import { Card, Empty, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { canSeeVisit } from "@/features/access";
import { StatusNote } from "@/ui/statusNote";
import { signedText } from "@/i18n/translate";

const haptic = () => haptics.medium();

/** Technician visit flow: En route → On site → Work (photos, checklist) → Signature → Payment. Works offline. */
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
  // a second tap in the same frame: one mark, one toast, one «back»
  const noShowSent = useRef(false);
  // «⋯» (K6): the menu at its button, «Изменить чек-лист» (the editor in place of the plain list), «Отменить выезд»
  const moreRef = useRef<ComponentRef<typeof View>>(null);
  const [moreAt, setMoreAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [editingChecklist, setEditingChecklist] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  // «Завершить» at work: the signature is the end of the work — the button brings the page to it
  const signRef = useRef<ComponentRef<typeof View>>(null);
  const v = db.visits.find((x) => x.id === id);
  // wave 7б-2: the location question comes before the first «On the way» on my own visit (docs/specs/03 §12)
  const consent = useConsentQuestion(v);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const cancelAsk = <CancelNotifySheet visitId={cancelled} onClose={() => {
    setCancelled(null);
    // «Отменить» on the cancel toast brings the visit back: stay on it
    if (!v) (router.canGoBack() ? router.back() : router.replace("/plan"));
  }} />;

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
  const st = visitStatus(v, db.members, Date.now(), lateAfterOf(db), visitDueCents(db, v));
  const idx = stepIndex(v.step);
  const before = v.photos.filter((p) => p.kind === "before");
  const after = v.photos.filter((p) => p.kind === "after");
  // #1431 «Повторить»: a photo the cloud did not take is sent again from this phone
  const retryPhoto = (id: string) => toast.show(store.online ? t("photoUp.retried") : t("offline.queued"), store.retryPhoto(v.id, id));
  // the photos the cloud did not take, on a step where the strips are not shown (before the work, after the signature)
  const failedHere = v.photos.filter((p) => p.upload);
  const gate = checklistGate(v, visitSettings(db), db.checklistTemplates ?? []);
  const queuedHint = () => (store.online ? undefined : t("offline.queued"));
  // «Перенести / Отменить»: the office only (owner / admin / office ↔ director / dispatcher), like cancel_visit on the server
  const office = canPlan([store.role]);

  // #2018: what «Подпись» offers — never a dead end, never «Принять оплату» on $0
  const signed = signedAction(store.role, visitDueCents(db, v));
  const advance = (msg: string) => {
    haptic();
    const undo = store.advanceVisit(v.id);
    toast.show(queuedHint() ?? msg, undo);
  };
  const removePhoto = (photoId: string) => toast.show(queuedHint() ?? t("photo.deleted"), store.removePhoto(v.id, photoId));
  const sign = (path: string) => {
    haptic();
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
  const addr = property ? encodeURIComponent(`${property.address}, ${property.city}`) : "";

  // K6 (founder): one main button for the next step, right under the header — in the thumb's reach, never under the checklist
  const nextStep: null | { label: string; icon?: IconKey; testID: string; onPress: () => void } =
    v.step === "scheduled"
      ? { label: t("step.en_route"), icon: "navigate", testID: "visit-main-en-route", onPress: () => consent.ask(() => advance(t("visit.etaSent"))) }
      : v.step === "en_route"
        ? { label: t("step.on_site"), icon: "pin", testID: "visit-main-on-site", onPress: () => advance(t("toast.step", { step: t("step.on_site") })) }
        : v.step === "on_site" && v.kind === "inspection"
          // an inspection ends on site with "Done": no work, signature or payment (S10, docs/specs/03 §4.1)
          ? { label: t("st.done"), icon: "check", testID: "visit-main-done", onPress: goDone }
          : v.step === "on_site"
            ? { label: t("visit.next", { step: t("step.working") }), icon: "chevronRight", testID: "visit-main-work", onPress: goWork }
            : v.step === "done" && isInspection && servable
              // after an inspection the main action is the estimate, lead and property filled in (13 §3.9, 17-job §7.2)
              ? { label: t("job3.makeEstimate"), icon: "invoice", testID: "visit-main-estimate", onPress: makeEstimate }
              : null;
  // what is not the next step goes into «⋯»: the checklist's order and text (the office), «Клиента нет дома», and — apart,
  // red, with its own sheet as the confirmation — «Отменить выезд» (K6: the dangerous never beside the ordinary)
  const mayEditChecklist = canEditVisitItems(store.role, v);
  const mayCancel = office && canCancel(v);
  // the ticks card of the work (or an inspection on site): its «Свой пункт» field opens from «⋯»
  const ticking = v.checklist.length > 0 && (v.step === "working" || (v.step === "on_site" && isInspection));
  const mayAddItem = (v.step === "working" || (v.step === "on_site" && isInspection)) && canAddItem(store.role, v, false);
  const moreItems: MenuItem<"message" | "checklist" | "addItem" | "noShow" | "cancel">[] = [
    ...(tel || main ? [{ key: "message" as const, label: t("visit.message"), icon: "message" as const, testID: "visit-act-message" }] : []),
    ...(mayEditChecklist ? [{ key: "checklist" as const, label: t("visit.editChecklist"), icon: "pencil" as const, testID: "visit-act-checklist" }] : []),
    ...(mayAddItem ? [{ key: "addItem" as const, label: t("visit.addCheckItem"), icon: "plus" as const, testID: "visit-act-add-item" }] : []),
    ...(noShowOk ? [{ key: "noShow" as const, label: t("noShow.btn"), icon: "alert" as const, testID: "visit-no-show" }] : []),
    ...(mayCancel ? [{ key: "cancel" as const, label: t("vc.title"), icon: "close" as const, destructive: true, group: !!(tel || main) || mayEditChecklist || noShowOk, testID: "visit-act-cancel" }] : []),
  ];
  const more = moreItems.length ? (
    <View ref={moreRef} collapsable={false} testID="visit-more">
      <IconButton
        icon="more"
        label={`${t("lead.more")}: ${customer?.name ?? t("visit.title")}`}
        onPress={() => moreRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setMoreAt({ x, y, w, h }))}
      />
    </View>
  ) : undefined;
  const before0 = v.step === "scheduled" || v.step === "en_route" || v.step === "on_site";

  return (
    <Screen testID="visit-screen" title={customer?.name ?? t("visit.title")} back={back} right={more} subtitle={job?.title ?? undefined} fab="visit" fabCtx={{ visitId: v.id, customerId: servable ? customer?.id : undefined, propertyId: property?.id, leadId: v.leadId, inspection: v.kind === "inspection" }}>
      {/* the head of the visit: where, when, how to get there and call — then the one next step */}
      <Card>
        <RowView style={{ justifyContent: "space-between" }}>
          <StatusChip status={st.status} label={t(st.label)} />
          {visitDueCents(db, v) > 0 ? (
            <T v="title" tabular>
              {money(visitDueCents(db, v))}
            </T>
          ) : null}
        </RowView>
        <View style={{ gap: space[1] }}>
          <RowView gap={space[2]}>
            <Icon name="clock" s={size.iconSm} color={c.mut} />
            <T v="heading" tabular style={{ flex: 1 }}>
              {`${day(v.start)} · ${visitWhen(v, time, t("plan5.allDay"))}`}
            </T>
          </RowView>
          {property ? (
            <RowView gap={space[2]} style={{ alignItems: "flex-start" }}>
              <Icon name="pin" s={size.iconSm} color={c.mut} />
              <T v="body" style={{ flex: 1 }}>
                {[property.address, property.city].filter(Boolean).join(", ")}
              </T>
            </RowView>
          ) : null}
        </View>
        <RowView gap={space[2]}>
          {property ? (
            <View style={{ flex: 1 }}>
              <Button label={t("visit.navigate")} icon="navigate" variant="secondary" full onPress={() => Linking.openURL(`https://maps.apple.com/?daddr=${addr}`)} />
            </View>
          ) : null}
          {tel ? (
            <View style={{ flex: 1 }}>
              <Button label={t("visit.call")} icon="phone" variant="secondary" full onPress={call} />
            </View>
          ) : null}
        </RowView>
        <Steps labels={STEP_LABELS.map((k) => t(k))} current={idx} />
        {v.step === "on_site" && v.kind !== "inspection" && gate.missing.photosBefore > 0 ? (
          <StatusNote tone="warn">{t("chk.needBefore", { n: gate.missing.photosBefore })}</StatusNote>
        ) : null}
        {v.step === "working" ? <FinishButton target={signRef} label={t("visit.finish")} /> : null}
        {nextStep ? (
          <View testID={nextStep.testID}>
            <Button label={nextStep.label} icon={nextStep.icon} full onPress={nextStep.onPress} />
          </View>
        ) : null}
      </Card>
      {consent.sheet}

      {/* #2018 С1: nothing to pay (the job is paid by invoice) — «Закрыть выезд», no «$0.00» and no payment step; the same
          payVisit, which on $0 writes no payment and ends the visit on the server */}
      {v.step === "signed" && signed === "close" ? (
        <View testID="visit-close">
          <Button
            label={t("visit.close")}
            icon="check"
            full
            onPress={() => {
              // review of #2018: «Закрыть выезд» never takes money — if the amount changed since the screen drew it (a sync),
              // nothing is sent and the screen shows the amount with «Принять оплату» again
              if (visitDueCents(store.db, v) > 0) return toast.show(t("visit.dueChanged"));
              haptic();
              toast.show(queuedHint() ?? t("toast.step", { step: t("st.done") }), store.payVisit(v.id, method));
            }}
          />
        </View>
      ) : null}
      {v.step === "signed" && signed === "pay" ? (
        <Card>
          <T v="caption" tone="mut">
            {t("visit.amountDue")}
          </T>
          <View testID="visit-amount-due">
            <T v="display" tabular>
              {money(visitDueCents(db, v))}
            </T>
          </View>
          {/* the method — a value of the form, a row with a menu (spec 56 §3 row 4); the same codes go into the payment */}
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
          <View testID="visit-record-payment">
            <Button
              label={t("money.receive")}
              icon="dollar"
              full
              onPress={() => {
                haptic();
                const undo = store.payVisit(v.id, method);
                toast.show(queuedHint() ?? t("toast.paid", { amount: money(visitDueCents(db, v)) }), undo);
              }}
            />
          </View>
        </Card>
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
          {job && canSeeProfit(store.role) ? (() => {
            const p = jobProfit(db, job.id);
            return (
              <View style={{ gap: space[1] }}>
                <RowView style={{ justifyContent: "space-between" }}>
                  <T v="body" tone="mut">{t("job.profit")}</T>
                  <T v="heading" tabular tone={p.profit >= 0 ? "ok" : "bad"}>
                    {money(p.profit)}{p.marginPct !== null ? ` · ${signedText(p.marginPct)}%` : ""}
                  </T>
                </RowView>
                <T v="caption" tone="mut">
                  {t("job.revenue")} {money(p.revenue)} − {t("job.expenses")} {money(p.expenses)}. {t("job.laborNote")}
                </T>
              </View>
            );
          })() : null}
          {/* a visit closed with nothing to pay keeps no «$0.00 · Карта» line (#2018) */}
          {v.payment && v.payment.amountCents > 0 ? (
            <T v="body" tabular>
              {money(v.payment.amountCents)} · {t(`visit.pay${v.payment.method[0].toUpperCase()}${v.payment.method.slice(1)}` as "visit.payCard")}
            </T>
          ) : null}
        </Card>
      ) : null}

      {/* the note for the tech from the visit form (docs/specs/03 §7.3, wave П3b): everyone on the visit sees it */}
      {v.note ? (
        <Card>
          <T v="heading">{t("lead.book.note")}</T>
          <T v="body">{v.note}</T>
        </Card>
      ) : null}

      <Card>
        <T v="heading">{t("visit.scope")}</T>
        {v.scope.map((s) => (
          <RowView key={s} gap={space[2]} style={{ alignItems: "flex-start" }}>
            <T v="body" tone="mut">
              •
            </T>
            <T v="body" style={{ flex: 1 }}>
              {s}
            </T>
          </RowView>
        ))}
      </Card>

      {/* the checklist before the work: the items to do, plain; the office changes their order and text from «⋯» (§7.4, CH3) */}
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

      {/* an inspection with a checklist (В6): ticked on site, checked before «Готово» */}
      {v.step === "on_site" && isInspection && (ticking || addingItem) ? <ChecklistCard v={v} missing={gate.missing} adding={addingItem} onAdded={() => setAddingItem(false)} /> : null}

      {v.step === "on_site" || v.step === "working" ? (
        <Card>
          <T v="heading">{t("visit.photosBefore")}</T>
          <PhotoStrip
            photos={before}
            onAdd={(uri) => toast.show(queuedHint() ?? t("toast.photo"), store.addPhoto(v.id, "before", uri))}
            onRemove={removePhoto}
            onRetry={retryPhoto}
          />
        </Card>
      ) : null}

      {v.step !== "on_site" && v.step !== "working" && failedHere.length ? (
        <Card>
          <T v="heading">{t("photoUp.title")}</T>
          <PhotoStrip photos={failedHere} onRetry={retryPhoto} />
        </Card>
      ) : null}

      {v.step === "working" ? (
        <>
          {ticking || addingItem ? <ChecklistCard v={v} missing={gate.missing} adding={addingItem} onAdded={() => setAddingItem(false)} /> : null}
          <Card>
            <T v="heading">{t("visit.photosAfter")}</T>
            <PhotoStrip photos={after} onAdd={(uri) => toast.show(queuedHint() ?? t("toast.photo"), store.addPhoto(v.id, "after", uri))} onRemove={removePhoto} onRetry={retryPhoto} />
            {gate.missing.photosAfter > 0 ? (
              <StatusNote tone="warn">{t("chk.needAfter", { n: gate.missing.photosAfter })}</StatusNote>
            ) : null}
          </Card>
          <View ref={signRef} collapsable={false}>
            <SectionTitle title={t("step.sign")} />
          </View>
          <Card>
            <StackBackGestureOff />
            <SignaturePad onConfirm={goSign} />
          </Card>
        </>
      ) : null}

      {office ? <WhenWho visitId={v.id} /> : null}
      {office ? <OfficeLocation v={v} geo={property?.geo} /> : null}
      <TechLocation v={v} geo={property?.geo} />
      {/* add-on modules' place (spec 33 П24 А7): nothing unless a module is switched on */}
      <ModulePlaces place="visit" ctx={{ visitId: v.id, leadId: v.leadId, customerId: servable ? customer?.id : undefined, propertyId: property?.id }} />
      {job ? <NotesBlock subjectType="job" subjectId={job.id} /> : v.leadId ? <NotesBlock subjectType="lead" subjectId={v.leadId} /> : null}
      <MissingSheet v={v} missing={gate.missing} open={!!ask} step={ask?.step ?? "sign"} onFill={() => setAsk(null)} onSkip={skipAndGo} />
      <Sheet visible={noShow} onClose={() => setNoShow(false)} title={t("noShow.title")}>
        <View testID="no-show-sheet" style={{ gap: space[3] }}>
          <T v="body" tone="mut">{t("noShow.hint")}</T>
          <T v="caption" tone="mut">{t("noShow.photo")}</T>
          <PhotoStrip
            photos={before}
            onAdd={(uri) => toast.show(queuedHint() ?? t("toast.photo"), store.addPhoto(v.id, "before", uri))}
            onRemove={removePhoto}
            onRetry={retryPhoto}
          />
          <TextField type="note" label={t("noShow.note")} placeholder={t("noShow.notePh")} value={noShowNote} onChangeText={setNoShowNote} />
          <View testID="no-show-confirm">
            <Button label={t("noShow.confirm")} icon="check" full onPress={markNoShow} />
          </View>
          <View testID="no-show-keep">
            <Button label={t("noShow.keep")} variant="secondary" full onPress={() => setNoShow(false)} />
          </View>
        </View>
      </Sheet>
      {/* under the notes: one quiet line; the client and the address are the screen's header already (#2350) */}
      <RelatedBlock line hide={["customer", "property"]} of={{ type: "visit", id: v.id }} />
      <Menu
        visible={!!moreAt}
        anchor={moreAt}
        title={customer?.name ?? t("visit.title")}
        items={moreItems}
        onSelect={(k) => {
          setMoreAt(null);
          if (k === "message") sms();
          else if (k === "checklist") setEditingChecklist(true);
          else if (k === "addItem") setAddingItem(true);
          else if (k === "noShow") setNoShow(true);
          else if (k === "cancel") setCancelling(true);
        }}
        onClose={() => setMoreAt(null)}
      />
      {/* «Отменить выезд» asks the reason first — the sheet is the confirmation; a cancelled visit leaves the screens: the
          screen asks «Сообщить клиенту?» (cancelAsk outlives the visit), then goes back */}
      <CancelVisitSheet visitId={cancelling ? v.id : null} onClose={() => setCancelling(false)} onDone={setCancelled} />
      <CallSheet preset={calling} onClose={() => setCalling(null)} />
      <MessageSheet preset={writing} onClose={() => setWriting(null)} />
    </Screen>
  );
}

/** «Завершить» at work (K6): the one main button stays at the top; the work ends with the client's signature, so it takes
 *  the page down to the signature (the screen's scroll is offered to its children only — hence a component of its own) */
function FinishButton({ target, label }: { target: RefObject<ComponentRef<typeof View> | null>; label: string }) {
  const scroll = useScreenScroll();
  const reduce = useReducedMotion();
  return (
    <View testID="visit-main-finish">
      <Button label={label} icon="check" full onPress={() => target.current && scroll?.scrollToNode(target.current, space[4], !reduce)} />
    </View>
  );
}
