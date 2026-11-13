/**
 * The visit form (docs/specs/03-visit-and-plan.md §7.1, wave П2): one form for «Записать осмотр», «Запланировать
 * работу», «Перенести»; «Сообщить клиенту?» after saving; «Отменить выезд» (§7.4). Rules — features/schedule.ts.
 * Menus in sheets are rows (rule 12); one accent: the save button.
 */
import { useHeldSheet } from "@/ui/heldSheet";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Linking, Platform, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { docLanguageFor } from "@/data/people";
import { visitContext, visitPropertyId } from "@/data/selectors";
import type { CancelReason, ID, Visit } from "@/data/types";
import { CANCEL_REASONS } from "@/data/types";
import { tFor } from "@/i18n/translate";
import { useI18n, type DictKey } from "@/i18n";
import { assigneesOf, atMinute, canPlan, visitWhen, wholeDay, canReschedule, dayVisits, formHours, formWarnings, freeSlots, jobRollsBack, leadRollsBack, quickStarts, SCHEDULE_DEFAULTS } from "@/features/schedule";
import { arrivalWindow, businessHoursOf, clientDate, companyTime, companyTz, scheduleSettingsOf } from "@/features/scheduleSettings";
import { AssignSheet } from "@/features/sheets";
import { DatePick, dayOffsetOf } from "@/features/DatePick";
import { addDays, isoDayKey, todayKey, type DayKey } from "@/features/calendar";
import { formDayOffset } from "@/features/planFeed";
import { minuteIn } from "@/features/zone";
import { Button, ChoiceChips, IconButton, Segmented, Stepper, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Divider, ListRow, RowView } from "@/ui/surfaces";
import { mailtoHref, smsHref } from "@/features/contactLinks";
import { memberName } from "@/features/team";
import { cancelNotice } from "@/features/cancelNotify";
import { NO_UNDO } from "@/data/undo";

export type VisitFormValue = { start: string; durationMin: number; techId: ID | null; assigneeIds: ID[]; note: string; allDay?: boolean };

/** a day of the company, `offset` days after its today (the form works on the company's calendar, П4b) */
const dayAt = (offset: number) => addDays(todayKey(), offset);

/** a labelled block that keeps its own height (Labeled grows with flex: 1 and collapses inside a wide screen) */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: space[1] }}>
      <T v="caption" tone="mut">
        {label}
      </T>
      {children}
    </View>
  );
}

/** state of the form: day (0 = today), start minute, length, person, note; derived start and warnings */
export function useVisitForm(init: { durationMin: number; techId?: ID | null; techIds?: ID[]; start?: string; day?: DayKey; exceptId?: ID; allDay?: boolean; allowAllDay?: boolean }) {
  const { db, role } = useStore();
  const initStart = init.start && !Number.isNaN(new Date(init.start).getTime()) ? init.start : null;
  // the day and the minute of an existing start on the company's calendar and clock, not the phone's
  // a day picked in the Plan opens that day with the form's own first free time (formDayOffset; never before today)
  const initDay = formDayOffset({ start: initStart, day: init.day }, todayKey());
  const [dayOffset, setDayOffset] = useState(initDay);
  // an all-day visit has no length of its own: back to a time, it takes the company's usual job length
  const [initDur] = useState(init.allDay && init.allowAllDay ? scheduleSettingsOf(db.company).jobMin : init.durationMin);
  const [duration, setDuration] = useState(initDur);
  // sales books without people: the office assigns (canPlan); a form for a visit that has people keeps them
  const initTechs = init.techIds ?? (init.techId && canPlan([role]) ? [init.techId] : []);
  // several people on a visit (wave П3a): the first one is techId; none = «Назначит диспетчер»
  const [techIds, setTechIds] = useState<ID[]>(initTechs);
  const techId = techIds[0] ?? null;
  const setTechId = (id: ID | null) => { setTechIds(id ? [id] : []); setTouched(true); };
  // the default person (the lead's owner, Р3) is only a preselection: the first person the user ticks replaces it;
  // after that ticks add and untick (several people). People of an existing visit (techIds, «Перенести») are real: ticks add.
  const [touched, setTouched] = useState(init.techIds !== undefined);
  const toggleTech = (id: ID) => {
    setTechIds((p) => (!touched && !p.includes(id) ? [id] : p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    setTouched(true);
  };
  const [note, setNote] = useState("");
  // «Весь день» only for a job visit (job/schedule, «Перенести» of a job visit); an inspection keeps its hour
  const [allDay, setAllDay] = useState(!!init.allDay && !!init.allowAllDay);
  const day = dayAt(dayOffset);
  // the company's hours of that weekday and its step (П4a; «Компания → Расписание»)
  const sch = scheduleSettingsOf(db.company);
  const hours = formHours(businessHoursOf(db.company), sch.stepMin, day);
  const slots = freeSlots(db, techIds, day, duration, { exceptId: init.exceptId, hours });
  const [minute, setMinute] = useState<number | null>(initStart ? minuteIn(initStart) : null);
  const startMin = minute ?? slots[0] ?? hours.dayStartMin;
  const whole = wholeDay(day);
  const start = allDay ? whole.start : atMinute(day, startMin);
  const len = allDay ? whole.durationMin : duration;
  const warnings = formWarnings(db, { techId: techIds, start, durationMin: len, exceptId: init.exceptId, allDay }, { hours });
  const value: VisitFormValue = { start, durationMin: len, techId, assigneeIds: techIds, note, allDay: allDay || undefined };
  return {
    value, day, hours, dayOffset, setDayOffset, duration, setDuration, techId, techIds, setTechId, toggleTech, note, setNote, slots, startMin,
    setMinute, warnings, past: warnings.some((w) => w.key === "past"), exceptId: init.exceptId,
    allDay, setAllDay, allowAllDay: !!init.allowAllDay,
    dirty: dayOffset !== initDay || duration !== initDur || techIds.join() !== initTechs.join() || note.trim().length > 0 || (minute !== null && !initStart) || allDay !== (!!init.allDay && !!init.allowAllDay),
  };
}

/** the fields, top to bottom as in §7.1: date → person (with the day's load) → time (free slots) → length → note → warnings → summary */
export function VisitFormFields({ f, noteLabel = true }: { f: ReturnType<typeof useVisitForm>; noteLabel?: boolean }) {
  const { db, role } = useStore();
  const planner = canPlan([role]);
  const { t, day, dayOf, time } = useI18n();
  const [calendar, setCalendar] = useState(false);
  const techs = db.members.filter((m) => m.roles.includes("tech") && !m.pending);
  const days = useMemo(() => {
    const label = (i: number) => (i === 0 ? t("common.today") : i === 1 ? t("common.tomorrow") : dayOf(dayAt(i)));
    const list = Array.from({ length: SCHEDULE_DEFAULTS.formDays }, (_, i) => ({ key: String(i), label: label(i) }));
    // a day picked in «Другая дата» beyond the chips gets its own chip, so the choice is visible
    return f.dayOffset >= SCHEDULE_DEFAULTS.formDays ? [...list, { key: String(f.dayOffset), label: label(f.dayOffset) }] : list;
  }, [t, dayOf, f.dayOffset]);
  const range = (v: Visit) => visitWhen(v, time, t("plan5.allDay"));
  const load = (id: ID) => {
    const vs = dayVisits(db, id, f.day, f.exceptId);
    return vs.length ? t("vf.load", { n: vs.length, ranges: vs.map(range).join(", ") }) : t("vf.free");
  };
  return (
    <View style={{ gap: space[3] }}>
      <Field label={t("sch.date")}>
        <ChoiceChips value={String(f.dayOffset)} onChange={(k) => { f.setDayOffset(Number(k)); f.setMinute(null); }} items={days} />
        {f.exceptId ? (
          // moving a visit: quick dates on the company's calendar and clock (13 §3.6)
          <RowView style={{ flexWrap: "wrap" }}>
            {quickStarts(todayKey(), minuteIn(new Date().toISOString())).map((q) => (
              <Button
                key={q.key}
                label={t(`job3.q.${q.key}` as DictKey, { time: time(atMinute(q.day, q.minute)) })}
                size="sm"
                variant="secondary"
                onPress={() => { f.setDayOffset(dayOffsetOf(q.day)); f.setMinute(q.minute); }}
              />
            ))}
          </RowView>
        ) : null}
        <Button label={t("vf.otherDate")} icon="calendar" size="sm" variant="ghost" onPress={() => setCalendar((x) => !x)} />
        {calendar ? (
          <DatePick
            value={f.day}
            onPick={(k) => { f.setDayOffset(dayOffsetOf(k)); f.setMinute(null); setCalendar(false); }}
          />
        ) : null}
      </Field>
      <Field label={t("sch.tech")}>
        {/* sales books, the office assigns (the server refuses sales: public.assign_visit) */}
        {!planner ? <T v="body" tone="mut">{t("vf.dispatcherAssigns")}</T> : <T v="caption" tone="mut">{t("vf.techsHint")}</T>}
        {planner ? <View>
          <ListRow title={`${f.techIds.length === 0 ? "✓ " : ""}${t("vf.dispatcherAssigns")}`} onPress={() => f.setTechId(null)} />
          {techs.map((m) => (
            <ListRow key={m.id} title={`${f.techIds.includes(m.id) ? "✓ " : ""}${m.name}`} subtitle={load(m.id)} onPress={() => { f.toggleTech(m.id); f.setMinute(null); }} />
          ))}
        </View> : null}
      </Field>
      {f.allowAllDay ? (
        <Segmented
          full
          value={f.allDay ? "allDay" : "time"}
          onChange={(k) => f.setAllDay(k === "allDay")}
          items={[
            { key: "time", label: t("job5.byTime") },
            { key: "allDay", label: t("plan5.allDay") },
          ]}
        />
      ) : null}
      {f.allDay ? null : (<>
      <Field label={t("sch.start")}>
        {f.slots.length ? (
          <ChoiceChips
            value={String(f.startMin)}
            onChange={(k) => f.setMinute(Number(k))}
            items={f.slots.slice(0, 12).map((m) => ({ key: String(m), label: time(atMinute(f.day, m)) }))}
          />
        ) : (
          <T v="caption" tone="mut">{t("vf.noSlots")}</T>
        )}
        <RowView style={{ justifyContent: "space-between" }}>
          <IconButton icon="minus" label={`${t("vf.otherTime")} −${f.hours.stepMin}`} onPress={() => f.setMinute(Math.max(SCHEDULE_DEFAULTS.earliestMin, f.startMin - f.hours.stepMin))} />
          <T v="title" tabular>{time(f.value.start)}</T>
          <IconButton icon="plus" label={`${t("vf.otherTime")} +${f.hours.stepMin}`} onPress={() => f.setMinute(Math.min(SCHEDULE_DEFAULTS.latestMin, f.startMin + f.hours.stepMin))} />
        </RowView>
      </Field>
      <Stepper label={t("sch.duration")} unit={t("sch.min")} value={f.duration} step={SCHEDULE_DEFAULTS.durationStepMin} min={SCHEDULE_DEFAULTS.durationStepMin} max={SCHEDULE_DEFAULTS.maxDurationMin} onChange={f.setDuration} />
      </>)}
      {noteLabel ? (
        <Field label={t("lead.book.note")}>
          <TextField type="note" value={f.note} onChangeText={f.setNote} placeholder={t("lead.book.notePh")} />
        </Field>
      ) : null}
      {f.warnings.map((w) => (
        <T key={w.key} v="caption" tone="warn">
          {`⚠ ${w.key === "busy" ? t("vf.warn.busy", { ranges: w.visits.map(range).join(", ") }) : t(`vf.warn.${w.key}` as DictKey)}`}
        </T>
      ))}
      <T v="body" tone="mut">
        {f.allDay ? t("job5.allDaySummary", { date: day(f.value.start), who: f.techIds.length ? f.techIds.map((id) => techs.find((m) => m.id === id)?.name ?? "").filter(Boolean).join(", ") : t("vf.dispatcherAssigns") }) : t("vf.summary", {
          date: day(f.value.start),
          // the company's clock, as the client's line below (П4a)
          from: companyTime(f.value.start, companyTz(db.company)),
          to: companyTime(new Date(new Date(f.value.start).getTime() + f.duration * 60_000).toISOString(), companyTz(db.company)),
          who: f.techIds.length ? f.techIds.map((id) => techs.find((m) => m.id === id)?.name ?? "").filter(Boolean).join(", ") : t("vf.dispatcherAssigns"),
        })}
      </T>
      {/* what the client is told (§7.1 п. 8): the window from the start, company time zone (П4a) */}
      <T v="caption" tone="mut">{f.allDay ? t("job5.clientDay") : clientSees(f.value.start, db, t)}</T>
    </View>
  );
}

/** «Клиент увидит окно 10:00–12:00» / «Клиент увидит время 10:00» — times en-US in the company time zone */
function clientSees(start: string, db: ReturnType<typeof useStore>["db"], t: ReturnType<typeof useI18n>["t"]): string {
  const tz = companyTz(db.company);
  const w = arrivalWindow(start, scheduleSettingsOf(db.company));
  return w ? t("schs.clientWindow", { from: companyTime(w.from, tz), to: companyTime(w.to, tz) }) : t("schs.clientExact", { time: companyTime(start, tz) });
}

/** The head of the form (§7.1 п. 1): the address of the place; for a job — how many visits it has already */
export function VisitFormHead({ propertyId, jobId, exceptId }: { propertyId?: ID; jobId?: ID; exceptId?: ID }) {
  const { db } = useStore();
  const { t } = useI18n();
  const job = jobId ? db.jobs.find((j) => j.id === jobId) : undefined;
  const p = db.properties.find((x) => x.id === (propertyId ?? job?.propertyId));
  if (!p && !job) return null;
  const n = job ? db.visits.filter((v) => v.jobId === job.id && v.id !== exceptId).length : 0;
  return (
    <View style={{ gap: space[1] }}>
      {p ? <T v="body" tone="mut">{[p.address, p.city].filter(Boolean).join(", ")}</T> : null}
      {job && n ? <T v="caption" tone="mut">{t("vf.visitsSoFar", { n })}</T> : null}
    </View>
  );
}

/** «Записать осмотр» / «+ Осмотр» / «Перенести» as one sheet; `onSave` returns the visit id (for «Сообщить клиенту?») */
export function VisitFormSheet({
  visible, onExited, onClose, title, saveLabel, init, onSave, withNote = true,
}: {
  visible: boolean; onExited?: () => void; onClose: () => void; title: string; saveLabel: string;
  init: { durationMin: number; techId?: ID | null; techIds?: ID[]; start?: string; day?: DayKey; exceptId?: ID; propertyId?: ID; jobId?: ID; allDay?: boolean; allowAllDay?: boolean };
  onSave: (v: VisitFormValue) => ID | null; withNote?: boolean;
}) {
  const f = useVisitForm(init);
  const [notifyId, setNotifyId] = useState<ID | null>(null);
  const save = () => {
    if (f.past) return;
    const id = onSave(f.value);
    if (id) setNotifyId(id);
    else onClose();
  };
  return (
    <>
      <Sheet visible={visible && !notifyId} onExited={onExited} onClose={onClose} title={title} dirty={f.dirty} onSave={f.past ? undefined : save}>
        <VisitFormHead propertyId={init.propertyId} jobId={init.jobId} exceptId={init.exceptId} />
        <VisitFormFields f={f} noteLabel={withNote} />
        <Button label={saveLabel} icon="calendar" variant="primary" full disabled={f.past} onPress={save} />
      </Sheet>
      <NotifySheet visitId={notifyId} onClose={() => { setNotifyId(null); onClose(); }} />
    </>
  );
}

/** «Сообщить клиенту?»: a ready text in the CLIENT's language (rule 7). We never send it ourselves: SMS / Email open the
 *  phone's app with the text; the visit is marked notified when a button is pressed. */
export function NotifySheet({ visitId, onClose }: { visitId: ID | null; onClose: () => void }) {
  const store = useStore();
  const { db } = store;
  const { t } = useI18n();
  const toast = useToast();
  const v = visitId ? db.visits.find((x) => x.id === visitId) : undefined;
  // nothing was saved (e.g. a second booking while one is planned): close quietly
  const missing = !!visitId && !v;
  useEffect(() => {
    if (!missing) return;
    const id = setTimeout(onClose, 0);
    return () => clearTimeout(id);
  }, [missing, onClose]);
  if (!v) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const ctx = visitContext(db, v);
  const lead = v.leadId ? db.leads.find((l) => l.id === v.leadId) : undefined;
  const ct = tFor(docLanguageFor(db, { customerId: ctx.customer?.id, leadId: v.leadId }));
  // the client's time is the company's (en-US, company time zone), with the arrival window if the company gives one (П4a)
  const tz = companyTz(db.company);
  const date = clientDate(v.start, tz);
  const w = arrivalWindow(v.start, scheduleSettingsOf(db.company));
  const at = companyTime(v.start, tz);
  const name = (ctx.customer?.name ?? lead?.name ?? "").split(" ")[0] ?? "";
  const company = db.company?.name ?? "";
  const insp = v.kind === "inspection";
  // «Весь день»: the client gets the date only, no hour (17-job §11.1)
  const text = v.allDay
    ? ct("job5.msg.allDay", { name, company, date })
    : w
    ? ct(insp ? "schs.msg.inspection" : "schs.msg.job", { name, company, date, from: companyTime(w.from, tz), to: companyTime(w.to, tz) })
    : ct(insp ? "vf.msg.inspection" : "vf.msg.job", { name, company, date, time: at });
  // numbers and addresses may come from outside (a web form): only digits and + for SMS; an address that looks like one, encoded
  const sms = smsHref(ctx.customer?.phone ?? lead?.phone, text, Platform.OS);
  const mail = mailtoHref(ctx.customer?.email ?? lead?.email, { subject: company, body: text });
  const done = () => {
    store.markNotified(v.id);
    onClose();
  };
  return (
    <Sheet visible={!!v} onClose={onClose} title={t("vf.notify.title")}>
      <T v="body">{text}</T>
      {sms ? <Button label={t("vf.notify.sms")} icon="sms" variant="secondary" full onPress={() => { Linking.openURL(sms).catch(() => {}); done(); }} /> : null}
      {mail ? <Button label={t("vf.notify.email")} icon="mail" variant="secondary" full onPress={() => { Linking.openURL(mail).catch(() => {}); done(); }} /> : null}
      <Button label={t("vf.notify.copy")} icon="copy" variant="secondary" full onPress={() => { Clipboard.setStringAsync(text).catch(() => {}); toast.show(t("vf.notify.copied")); done(); }} />
      <Button label={t("vf.notify.later")} variant="ghost" full onPress={onClose} />
    </Sheet>
  );
}

/** «Сообщить клиенту об отмене?» (§7.4, §13): the cancelled visit is read from `cancelledVisits`; a ready text in the
 *  CLIENT's language. SMS / Email open the phone's app and write an `sms` / `email` event (spec 20, «Отменить» 5 s,
 *  offline — the queue); «Скопировать» writes nothing (we do not know the channel). A tech never gets here (office only). */
export function CancelNotifySheet({ visitId, onClose }: { visitId: ID | null; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const n = visitId ? cancelNotice(store.db, visitId) : null;
  // the cancel was undone (the visit is back in the Plan) or never happened: close quietly
  const missing = !!visitId && !n;
  useEffect(() => {
    if (!missing) return;
    const id = setTimeout(onClose, 0);
    return () => clearTimeout(id);
  }, [missing, onClose]);
  if (!n) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const sms = smsHref(n.phone, n.text, Platform.OS);
  const mail = mailtoHref(n.email, { subject: store.db.company?.name ?? "", body: n.text });
  const open = (url: string, channel: "sms" | "email") => {
    Linking.openURL(url).catch(() => {});
    const undo = n.subject ? store.logMessage({ ...n.subject, channel, text: n.text }) : undefined;
    toast.show(store.online ? t("visitP2.notify.opened") : t("offline.queued"), undo);
    onClose();
  };
  return (
    <Sheet visible={!!n} onClose={onClose} title={t("visitP2.notify.title")}>
      <T v="body">{n.text}</T>
      {!sms && !mail ? <T v="caption" tone="mut">{t("visitP2.notify.noContact")}</T> : null}
      {sms ? <Button label={t("vf.notify.sms")} icon="sms" variant="secondary" full onPress={() => open(sms, "sms")} /> : null}
      {mail ? <Button label={t("vf.notify.email")} icon="mail" variant="secondary" full onPress={() => open(mail, "email")} /> : null}
      <Button label={t("vf.notify.copy")} icon="copy" variant="secondary" full onPress={() => { Clipboard.setStringAsync(n.text).catch(() => {}); toast.show(t("vf.notify.copied")); onClose(); }} />
      <Button label={t("vf.notify.later")} variant="ghost" full onPress={onClose} />
    </Sheet>
  );
}

/** «Отменить выезд» (§7.4): a reason (5), a text for "other", what happens next; an ordinary button, «Не отменять» beside it */
export function CancelVisitSheet({ visitId, onClose, onDone }: { visitId: ID | null; onClose: () => void; onDone?: (visitId: ID) => void }) {
  const store = useStore();
  const { db } = store;
  const { t } = useI18n();
  const toast = useToast();
  const [reason, setReason] = useState<CancelReason>("client_cancelled");
  const [text, setText] = useState("");
  if (!visitId) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const leadBack = leadRollsBack(db, visitId);
  const jobBack = jobRollsBack(db, visitId);
  const ok = reason !== "other" || text.trim().length > 0;
  const cancel = () => {
    if (!ok) return;
    toast.show(t("vc.done"), store.cancelVisit(visitId, reason, text));
    onClose();
    onDone?.(visitId);
  };
  return (
    <Sheet visible={!!visitId} onClose={onClose} title={t("vc.title")} dirty={text.trim().length > 0}>
      {CANCEL_REASONS.map((r) => (
        <ListRow key={r} title={`${reason === r ? "✓ " : ""}${t(`vc.r.${r}` as DictKey)}`} onPress={() => setReason(r)} />
      ))}
      {reason === "other" ? <TextField type="note" value={text} onChangeText={setText} placeholder={t("vc.otherPh")} /> : null}
      <Divider />
      {leadBack ? <T v="caption" tone="mut">{t("vc.leadBack")}</T> : null}
      {jobBack ? <T v="caption" tone="mut">{t("vc.jobBack")}</T> : null}
      <RowView style={{ gap: space[2] }}>
        <View style={{ flex: 1 }}>
          <Button label={t("vc.keep")} variant="ghost" full onPress={onClose} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={t("vc.title")} variant="secondary" full disabled={!ok} onPress={cancel} />
        </View>
      </RowView>
    </Sheet>
  );
}

/** «Когда и кто» on the visit card, for the office (§7.3): date, time – end, the person; «Перенести» · «Отменить выезд»
 *  (only before the tech is on site); «Клиенту сообщили …» or «Сообщить клиенту». */
export function WhenWho({ visitId, onCancelled }: { visitId: ID; onCancelled?: (visitId: ID) => void }) {
  const store = useStore();
  const { db } = store;
  const { t, day, time } = useI18n();
  const toast = useToast();
  const [sheet, setSheet] = useState<"move" | "cancel" | "notify" | "assign" | null>(null);
  const moveHeld = useHeldSheet(sheet === "move" ? true : null); // the sheet goes out before it is unmounted (#1163)
  const v = db.visits.find((x) => x.id === visitId);
  if (!v) return null;
  const people = assigneesOf(v);
  const who = people.length ? people.map((id) => memberName(db, id, t) ?? "").filter(Boolean).join(", ") : t("vf.dispatcherAssigns");
  const open = canReschedule(v);
  return (
    <Card>
      <T v="heading">{t("vw.title")}</T>
      <T v="body" tabular>{`${day(v.start)} · ${visitWhen(v, time, t("plan5.allDay"))} · ${who}`}</T>
      {v.customerNotifiedAt ? (
        <T v="caption" tone="mut">{t("vw.notified", { date: day(v.customerNotifiedAt) })}</T>
      ) : (
        <Button label={t("vw.notify")} icon="send" variant="secondary" size="sm" onPress={() => setSheet("notify")} />
      )}
      {open ? (
        <RowView style={{ gap: space[2], flexWrap: "wrap" }}>
          <Button label={t("vw.reschedule")} icon="calendar" variant="secondary" size="sm" onPress={() => setSheet("move")} />
          <Button label={t("plan.assign")} icon="user" variant="secondary" size="sm" onPress={() => setSheet("assign")} />
          <Button label={t("vc.title")} icon="close" variant="secondary" size="sm" onPress={() => setSheet("cancel")} />
        </RowView>
      ) : null}
      {moveHeld.value ? (
        <VisitFormSheet
          key={moveHeld.opening}
          visible={moveHeld.visible}
          onExited={moveHeld.onExited}
          onClose={() => setSheet(null)}
          title={t("vw.reschedule")}
          saveLabel={t("vw.reschedule")}
          withNote={false}
          init={{ durationMin: v.durationMin, techIds: people, start: v.start, exceptId: v.id, propertyId: visitPropertyId(db, v), jobId: v.jobId, allDay: v.allDay, allowAllDay: !!v.jobId && v.kind !== "inspection" }}
          onSave={(f) => {
            const undoMove = store.rescheduleVisit(v.id, f.start, f.durationMin, f.allDay);
            const undoTech = f.assigneeIds.join() !== people.join() ? store.assignVisit(v.id, f.assigneeIds) : NO_UNDO;
            toast.show(f.allDay ? t("job5.allDaySaved", { date: day(f.start) }) : t("vf.rescheduled", { date: day(f.start), time: time(f.start) }), store.undoTogether([undoMove, undoTech]));
            // the client was told the old time: offer to tell the new one (§5.2)
            return v.customerNotifiedAt ? v.id : null;
          }}
        />
      ) : null}
      {/* a cancelled visit leaves the screens: the screen asks «Сообщить клиенту?» (it outlives this card), then goes back */}
      <CancelVisitSheet visitId={sheet === "cancel" ? v.id : null} onClose={() => setSheet(null)} onDone={(id) => (onCancelled ? onCancelled(id) : router.canGoBack() ? router.back() : router.replace("/plan"))} />
      <NotifySheet visitId={sheet === "notify" ? v.id : null} onClose={() => setSheet(null)} />
      <AssignSheet visitId={sheet === "assign" ? v.id : null} onClose={() => setSheet(null)} />
    </Card>
  );
}
