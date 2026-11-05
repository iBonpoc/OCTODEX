/**
 * The visit form (docs/specs/03-visit-and-plan.md §7.1, wave П2): one form for «Записать осмотр», «Запланировать
 * работу», «Перенести»; «Сообщить клиенту?» after saving; «Отменить выезд» (§7.4). Rules — features/schedule.ts.
 * Menus in sheets are rows (rule 12); one accent: the save button.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Linking, Platform, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { docLanguageFor } from "@/data/people";
import { visitContext } from "@/data/selectors";
import type { CancelReason, ID, Visit } from "@/data/types";
import { CANCEL_REASONS } from "@/data/types";
import { tFor } from "@/i18n/translate";
import { useI18n, type DictKey } from "@/i18n";
import { assigneesOf, atMinute, canReschedule, dayVisits, formWarnings, freeSlots, jobRollsBack, leadRollsBack, SCHEDULE_DEFAULTS } from "@/features/schedule";
import { AssignSheet } from "@/features/sheets";
import { Button, ChoiceChips, IconButton, Stepper, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Divider, ListRow, RowView } from "@/ui/surfaces";
import { mailtoHref, smsHref } from "@/features/contactLinks";

export type VisitFormValue = { start: string; durationMin: number; techId: ID | null; assigneeIds: ID[]; note: string };

const startOfDay = (offset: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

/** a labelled block that keeps its own height (Labeled grows with flex: 1 and collapses inside a wide screen) */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: space[1] }}>
      <T v="micro" tone="mut">
        {label}
      </T>
      {children}
    </View>
  );
}

/** state of the form: day (0 = today), start minute, length, person, note; derived start and warnings */
export function useVisitForm(init: { durationMin: number; techId?: ID | null; techIds?: ID[]; start?: string; exceptId?: ID }) {
  const { db } = useStore();
  const initStart = init.start ? new Date(init.start) : null;
  const initDay = initStart ? Math.max(0, Math.round((new Date(initStart).setHours(0, 0, 0, 0) - startOfDay(0).getTime()) / 86_400_000)) : 1;
  const [dayOffset, setDayOffset] = useState(initDay);
  const [duration, setDuration] = useState(init.durationMin);
  const initTechs = init.techIds ?? (init.techId ? [init.techId] : []);
  // several people on a visit (wave П3a): the first one is techId; none = «Назначит диспетчер»
  const [techIds, setTechIds] = useState<ID[]>(initTechs);
  const techId = techIds[0] ?? null;
  const setTechId = (id: ID | null) => setTechIds(id ? [id] : []);
  const toggleTech = (id: ID) => setTechIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const [note, setNote] = useState("");
  const day = startOfDay(dayOffset);
  const slots = freeSlots(db, techIds, day, duration, { exceptId: init.exceptId });
  const [minute, setMinute] = useState<number | null>(initStart ? initStart.getHours() * 60 + initStart.getMinutes() : null);
  const startMin = minute ?? slots[0] ?? SCHEDULE_DEFAULTS.dayStartMin;
  const start = atMinute(day, startMin);
  const warnings = formWarnings(db, { techId: techIds, start, durationMin: duration, exceptId: init.exceptId });
  const value: VisitFormValue = { start, durationMin: duration, techId, assigneeIds: techIds, note };
  return {
    value, day, dayOffset, setDayOffset, duration, setDuration, techId, techIds, setTechId, toggleTech, note, setNote, slots, startMin,
    setMinute, warnings, past: warnings.some((w) => w.key === "past"), exceptId: init.exceptId,
    dirty: dayOffset !== initDay || duration !== init.durationMin || techIds.join() !== initTechs.join() || note.trim().length > 0 || (minute !== null && !initStart),
  };
}

/** the fields, top to bottom as in §7.1: date → person (with the day's load) → time (free slots) → length → note → warnings → summary */
export function VisitFormFields({ f, noteLabel = true }: { f: ReturnType<typeof useVisitForm>; noteLabel?: boolean }) {
  const { db } = useStore();
  const { t, day, time } = useI18n();
  const [moreDays, setMoreDays] = useState(false);
  const techs = db.members.filter((m) => m.roles.includes("tech") && !m.pending);
  const days = useMemo(
    () =>
      Array.from({ length: moreDays ? SCHEDULE_DEFAULTS.formDays * 2 : SCHEDULE_DEFAULTS.formDays }, (_, i) => ({
        key: String(i),
        label: i === 0 ? t("common.today") : i === 1 ? t("common.tomorrow") : day(startOfDay(i).toISOString()),
      })),
    [t, day, moreDays],
  );
  const range = (v: Visit) => `${time(v.start)}–${time(new Date(new Date(v.start).getTime() + v.durationMin * 60_000).toISOString())}`;
  const load = (id: ID) => {
    const vs = dayVisits(db, id, f.day, f.exceptId);
    return vs.length ? t("vf.load", { n: vs.length, ranges: vs.map(range).join(", ") }) : t("vf.free");
  };
  return (
    <View style={{ gap: space[3] }}>
      <Field label={t("sch.date")}>
        <ChoiceChips value={String(f.dayOffset)} onChange={(k) => { f.setDayOffset(Number(k)); f.setMinute(null); }} items={days} />
        {!moreDays ? <Button label={t("vf.moreDays")} size="sm" variant="ghost" onPress={() => setMoreDays(true)} /> : null}
      </Field>
      <Field label={t("sch.tech")}>
        <T v="caption" tone="mut">{t("vf.techsHint")}</T>
        <View>
          <ListRow title={`${f.techIds.length === 0 ? "✓ " : ""}${t("vf.dispatcherAssigns")}`} onPress={() => f.setTechId(null)} />
          {techs.map((m) => (
            <ListRow key={m.id} title={`${f.techIds.includes(m.id) ? "✓ " : ""}${m.name}`} subtitle={load(m.id)} onPress={() => { f.toggleTech(m.id); f.setMinute(null); }} />
          ))}
        </View>
      </Field>
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
          <IconButton icon="minus" label={`${t("vf.otherTime")} −${SCHEDULE_DEFAULTS.stepMin}`} onPress={() => f.setMinute(Math.max(SCHEDULE_DEFAULTS.earliestMin, f.startMin - SCHEDULE_DEFAULTS.stepMin))} />
          <T v="title" tabular>{time(f.value.start)}</T>
          <IconButton icon="plus" label={`${t("vf.otherTime")} +${SCHEDULE_DEFAULTS.stepMin}`} onPress={() => f.setMinute(Math.min(SCHEDULE_DEFAULTS.latestMin, f.startMin + SCHEDULE_DEFAULTS.stepMin))} />
        </RowView>
      </Field>
      <Stepper label={t("sch.duration")} unit={t("sch.min")} value={f.duration} step={SCHEDULE_DEFAULTS.durationStepMin} min={SCHEDULE_DEFAULTS.durationStepMin} max={SCHEDULE_DEFAULTS.maxDurationMin} onChange={f.setDuration} />
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
        {t("vf.summary", {
          date: day(f.value.start),
          from: time(f.value.start),
          to: time(new Date(new Date(f.value.start).getTime() + f.duration * 60_000).toISOString()),
          who: f.techIds.length ? f.techIds.map((id) => techs.find((m) => m.id === id)?.name ?? "").filter(Boolean).join(", ") : t("vf.dispatcherAssigns"),
        })}
      </T>
    </View>
  );
}

/** «Записать осмотр» / «+ Осмотр» / «Перенести» as one sheet; `onSave` returns the visit id (for «Сообщить клиенту?») */
export function VisitFormSheet({
  visible, onClose, title, saveLabel, init, onSave, withNote = true,
}: {
  visible: boolean; onClose: () => void; title: string; saveLabel: string;
  init: { durationMin: number; techId?: ID | null; techIds?: ID[]; start?: string; exceptId?: ID };
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
      <Sheet visible={visible && !notifyId} onClose={onClose} title={title} dirty={f.dirty} onSave={f.past ? undefined : save}>
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
  const d = new Date(v.start);
  const date = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const at = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const name = (ctx.customer?.name ?? lead?.name ?? "").split(" ")[0] ?? "";
  const company = db.company?.name ?? "";
  const text = ct(v.kind === "inspection" ? "vf.msg.inspection" : "vf.msg.job", { name, company, date, time: at });
  // numbers and addresses may come from outside (a web form): only digits and + for SMS; an address that looks like one, encoded
  const sms = smsHref(ctx.customer?.phone ?? lead?.phone, text, Platform.OS);
  const mail = mailtoHref(ctx.customer?.email ?? lead?.email, { subject: company, body: text });
  const done = () => {
    store.markNotified(v.id);
    onClose();
  };
  return (
    <Sheet visible onClose={onClose} title={t("vf.notify.title")}>
      <T v="body">{text}</T>
      {sms ? <Button label={t("vf.notify.sms")} icon="sms" variant="secondary" full onPress={() => { Linking.openURL(sms).catch(() => {}); done(); }} /> : null}
      {mail ? <Button label={t("vf.notify.email")} icon="mail" variant="secondary" full onPress={() => { Linking.openURL(mail).catch(() => {}); done(); }} /> : null}
      <Button label={t("vf.notify.copy")} icon="copy" variant="secondary" full onPress={() => { Clipboard.setStringAsync(text).catch(() => {}); toast.show(t("vf.notify.copied")); done(); }} />
      <Button label={t("vf.notify.later")} variant="ghost" full onPress={onClose} />
    </Sheet>
  );
}

/** «Отменить выезд» (§7.4): a reason (5), a text for "other", what happens next; an ordinary button, «Не отменять» beside it */
export function CancelVisitSheet({ visitId, onClose, onDone }: { visitId: ID | null; onClose: () => void; onDone?: () => void }) {
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
    onDone?.();
  };
  return (
    <Sheet visible onClose={onClose} title={t("vc.title")} dirty={text.trim().length > 0}>
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
export function WhenWho({ visitId }: { visitId: ID }) {
  const store = useStore();
  const { db } = store;
  const { t, day, time } = useI18n();
  const toast = useToast();
  const [sheet, setSheet] = useState<"move" | "cancel" | "notify" | "assign" | null>(null);
  const v = db.visits.find((x) => x.id === visitId);
  if (!v) return null;
  const end = new Date(new Date(v.start).getTime() + v.durationMin * 60_000).toISOString();
  const people = assigneesOf(v);
  const who = people.length ? people.map((id) => db.members.find((m) => m.id === id)?.name ?? "").filter(Boolean).join(", ") : t("vf.dispatcherAssigns");
  const open = canReschedule(v);
  return (
    <Card>
      <T v="heading">{t("vw.title")}</T>
      <T v="body" tabular>{`${day(v.start)} · ${time(v.start)}–${time(end)} · ${who}`}</T>
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
      {sheet === "move" ? (
        <VisitFormSheet
          visible
          onClose={() => setSheet(null)}
          title={t("vw.reschedule")}
          saveLabel={t("vw.reschedule")}
          withNote={false}
          init={{ durationMin: v.durationMin, techIds: people, start: v.start, exceptId: v.id }}
          onSave={(f) => {
            const undoMove = store.rescheduleVisit(v.id, f.start, f.durationMin);
            const undoTech = f.assigneeIds.join() !== people.join() ? store.assignVisit(v.id, f.assigneeIds) : () => {};
            toast.show(t("vf.rescheduled", { date: day(f.start), time: time(f.start) }), () => { undoTech(); undoMove(); });
            // the client was told the old time: offer to tell the new one (§5.2)
            return v.customerNotifiedAt ? v.id : null;
          }}
        />
      ) : null}
      {/* a cancelled visit leaves the screens: back to where the office came from (the toast keeps «Отменить») */}
      <CancelVisitSheet visitId={sheet === "cancel" ? v.id : null} onClose={() => setSheet(null)} onDone={() => (router.canGoBack() ? router.back() : router.replace("/plan"))} />
      <NotifySheet visitId={sheet === "notify" ? v.id : null} onClose={() => setSheet(null)} />
      <AssignSheet visitId={sheet === "assign" ? v.id : null} onClose={() => setSheet(null)} />
    </Card>
  );
}
