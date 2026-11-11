import { ModulePlaces } from "@/modules/ModulePlaces";
import { visitDueCents } from "@/features/visitDue";
import { lateAfterOf } from "@/features/scheduleSettings";
import { useState } from "react";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { space, size } from "@octo/design-tokens";
import { jobProfit, useStore, visitContext } from "@/data/store";
import { canSeeProfit } from "@/nav/roles";
import type { PaymentMethod } from "@/data/types";
import { useI18n } from "@/i18n";
import { CancelNotifySheet, WhenWho } from "@/features/VisitForm";
import { NotesBlock } from "@/features/NotesBlock";
import { RelatedBlock } from "@/features/RelatedBlock";
import { canPlan } from "@/features/schedule";
import { visitServable } from "@/features/jobs";
import { peopleOf } from "@/data/people";
import { cleanPhone, telHref } from "@/features/contactLinks";
import { smsWithBody } from "@/features/sms";
import { CallSheet, type CallPreset } from "@/features/comms/CallSheet";
import { MessageSheet, type MessagePreset } from "@/features/comms/MessageSheet";
import { useTheme } from "@/theme/ThemeProvider";
import { STEP_LABELS, stepIndex, visitStatus } from "@/features/visits";
import { SignaturePad } from "@/features/SignaturePad";
import { PhotoStrip } from "@/features/PhotoStrip";
import { canEditVisitItems, checklistGate, visitSettings } from "@/features/checklist";
import { ChecklistCard, ChecklistEditor, MissingSheet } from "@/features/VisitChecklist";
import { OfficeLocation, TechLocation, useConsentQuestion } from "@/features/LocationParts";
import { Button, IconButton, Segmented, StatusChip, Steps } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Empty, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { canSeeVisit } from "@/features/access";
import { canTakeVisitPayment } from "@/features/moneyLists";

const haptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

/** Technician visit flow: En route → On site → Work (photos, checklist) → Signature → Payment. Works offline. */
export default function VisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db } = store;
  const { t, time, money } = useI18n();
  const { c } = useTheme();
  const toast = useToast();
  const [method, setMethod] = useState<PaymentMethod>("card");
  // the «Не заполнено» sheet before the next step (docs/specs/08 §4): which step asks, and the signature it holds
  const [ask, setAsk] = useState<null | { step: "work" } | { step: "done" } | { step: "sign"; path: string }>(null);
  const [calling, setCalling] = useState<CallPreset | null>(null);
  const [writing, setWriting] = useState<MessagePreset | null>(null);
  // «Сообщить клиенту об отмене?» (docs/specs/03 §13): asked here, because the cancelled visit leaves `visits`
  const [cancelled, setCancelled] = useState<string | null>(null);
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
  const st = visitStatus(v, db.members, Date.now(), lateAfterOf(db));
  const idx = stepIndex(v.step);
  const before = v.photos.filter((p) => p.kind === "before");
  const after = v.photos.filter((p) => p.kind === "after");
  const gate = checklistGate(v, visitSettings(db), db.checklistTemplates ?? []);
  const queuedHint = () => (store.online ? undefined : t("offline.queued"));
  // «Перенести / Отменить»: the office only (owner / admin / office ↔ director / dispatcher), like cancel_visit on the server
  const office = canPlan([store.role]);

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

  return (
    <Screen title={customer?.name ?? t("visit.title")} back={back} subtitle={`${v.allDay ? t("job5.allDayChip") : time(v.start)} · ${job?.title ?? ""}`} fab="visit" fabCtx={{ visitId: v.id, customerId: servable ? customer?.id : undefined, propertyId: property?.id, leadId: v.leadId, inspection: v.kind === "inspection" }}>
      <RelatedBlock of={{ type: "visit", id: v.id }} />
      <Card>
        <RowView style={{ justifyContent: "space-between" }}>
          <StatusChip status={st.status} label={t(st.label)} />
          {visitDueCents(db, v) > 0 ? (
            <T v="title" tabular>
              {money(visitDueCents(db, v))}
            </T>
          ) : null}
        </RowView>
        <Steps labels={STEP_LABELS.map((k) => t(k))} current={idx} />
        <RowView gap={space[1]}>
          <Icon name="pin" s={size.iconSm} color={c.mut} />
          <T v="body" tone="mut" style={{ flex: 1 }}>
            {[property?.address, property?.city].filter(Boolean).join(", ")}
          </T>
        </RowView>
        <RowView>
          <IconButton icon="phone" label={t("visit.call")} onPress={call} />
          <IconButton icon="message" label={t("visit.message")} onPress={sms} />
          <IconButton icon="navigate" label={t("visit.navigate")} onPress={() => Linking.openURL(`https://maps.apple.com/?daddr=${addr}`)} />
        </RowView>
      </Card>

      {office ? <WhenWho visitId={v.id} onCancelled={setCancelled} /> : null}
      {office ? <OfficeLocation v={v} geo={property?.geo} /> : null}

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

      {/* the office edits the items before the visit (§7.4, CH3); an empty list too — «Добавить из шаблона» */}
      {canEditVisitItems(store.role, v) ? <ChecklistEditor v={v} /> : null}
      {!canEditVisitItems(store.role, v) && v.checklist.length > 0 && (v.step === "scheduled" || v.step === "en_route" || v.step === "on_site") ? (
        <Card>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="heading">{t("visit.checklist")}</T>
            <T v="caption" tone="mut">
              {t("check.preview", { n: v.checklist.length })}
            </T>
          </RowView>
          {v.checklist.map((item) => (
            <T key={item.id} v="body" tone="mut">
              ○ {item.label}
            </T>
          ))}
        </Card>
      ) : null}

      <TechLocation v={v} geo={property?.geo} />
      {/* add-on modules' place (spec 33 П24 А7): nothing unless a module is switched on */}
      <ModulePlaces place="visit" ctx={{ visitId: v.id, leadId: v.leadId, customerId: servable ? customer?.id : undefined, propertyId: property?.id }} />
      {consent.sheet}

      {/* Step actions */}
      {v.step === "scheduled" ? (
        <Button label={t("step.en_route")} icon="navigate" full onPress={() => consent.ask(() => advance(t("visit.etaSent")))} />
      ) : null}
      {v.step === "en_route" ? (
        <Button label={t("step.on_site")} icon="pin" full onPress={() => advance(t("toast.step", { step: t("step.on_site") }))} />
      ) : null}

      {/* an inspection with a checklist (В6): ticked on site, checked before «Готово» */}
      {v.step === "on_site" && isInspection && v.checklist.length ? <ChecklistCard v={v} missing={gate.missing} /> : null}

      {v.step === "on_site" || v.step === "working" ? (
        <Card>
          <T v="heading">{t("visit.photosBefore")}</T>
          <PhotoStrip
            photos={before}
            onAdd={(uri) => toast.show(queuedHint() ?? t("toast.photo"), store.addPhoto(v.id, "before", uri))}
            onRemove={removePhoto}
          />
          {v.step === "on_site" && v.kind === "inspection" ? (
            // an inspection ends on site with "Done": no work, signature or payment (S10, docs/specs/03 §4.1)
            <Button label={t("st.done")} icon="check" full onPress={goDone} />
          ) : null}
          {v.step === "on_site" && v.kind !== "inspection" ? (
            <>
              {gate.missing.photosBefore > 0 ? (
                <T v="caption" tone="warn">
                  {t("chk.needBefore", { n: gate.missing.photosBefore })}
                </T>
              ) : null}
              <Button label={t("visit.next", { step: t("step.working") })} full onPress={goWork} />
            </>
          ) : null}
        </Card>
      ) : null}

      {v.step === "working" ? (
        <>
          {v.checklist.length ? <ChecklistCard v={v} missing={gate.missing} /> : null}
          <Card>
            <T v="heading">{t("visit.photosAfter")}</T>
            <PhotoStrip photos={after} onAdd={(uri) => toast.show(queuedHint() ?? t("toast.photo"), store.addPhoto(v.id, "after", uri))} onRemove={removePhoto} />
            {gate.missing.photosAfter > 0 ? (
              <T v="caption" tone="warn">
                {t("chk.needAfter", { n: gate.missing.photosAfter })}
              </T>
            ) : null}
          </Card>
          <SectionTitle title={t("step.sign")} />
          <Card>
            <SignaturePad onConfirm={goSign} />
          </Card>
        </>
      ) : null}

      {v.step === "signed" && canTakeVisitPayment(store.role) ? (
        <Card>
          <T v="caption" tone="mut">
            {t("visit.amountDue")}
          </T>
          <View testID="visit-amount-due">
            <T v="display" tabular>
              {money(visitDueCents(db, v))}
            </T>
          </View>
          <T v="caption" tone="mut">
            {t("visit.method")}
          </T>
          <Segmented
            full
            testID="visit-method"
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
              label={t("visit.recordPayment")}
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

      {v.step === "done" && isInspection && servable ? (
        // after an inspection the main action is the estimate, lead and property filled in (13 §3.9, 17-job §7.2)
        <Button label={t("job3.makeEstimate")} icon="invoice" variant="primary" full onPress={makeEstimate} />
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
            {t("visit.completedHint")}
          </T>
          {job && canSeeProfit(store.role) ? (() => {
            const p = jobProfit(db, job.id);
            return (
              <View style={{ gap: space[1] }}>
                <RowView style={{ justifyContent: "space-between" }}>
                  <T v="body" tone="mut">{t("job.profit")}</T>
                  <T v="heading" tabular tone={p.profit >= 0 ? "ok" : "bad"}>
                    {money(p.profit)}{p.marginPct !== null ? ` · ${p.marginPct}%` : ""}
                  </T>
                </RowView>
                <T v="caption" tone="mut">
                  {t("job.revenue")} {money(p.revenue)} − {t("job.expenses")} {money(p.expenses)}. {t("job.laborNote")}
                </T>
              </View>
            );
          })() : null}
          {v.payment ? (
            <T v="body" tabular>
              {money(v.payment.amountCents)} · {t(`visit.pay${v.payment.method[0].toUpperCase()}${v.payment.method.slice(1)}` as "visit.payCard")}
            </T>
          ) : null}
        </Card>
      ) : null}
      {job ? <NotesBlock subjectType="job" subjectId={job.id} /> : v.leadId ? <NotesBlock subjectType="lead" subjectId={v.leadId} /> : null}
      <MissingSheet v={v} missing={gate.missing} open={!!ask} step={ask?.step ?? "sign"} onFill={() => setAsk(null)} onSkip={skipAndGo} />
      <CallSheet preset={calling} onClose={() => setCalling(null)} />
      <MessageSheet preset={writing} onClose={() => setWriting(null)} />
    </Screen>
  );
}
