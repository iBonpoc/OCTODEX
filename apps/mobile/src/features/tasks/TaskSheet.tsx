import { useMemo, useState, type ReactNode } from "react";
import { useHeldSheet } from "@/ui/heldSheet";
import { View } from "react-native";
import { router } from "expo-router";
import { component, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { ID, Task } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { todayKey, isoDayKey, type DayKey } from "@/features/calendar";
import { uid } from "@/features/estimateDoc";
import { DatePick } from "@/features/DatePick";
import { eventRange } from "@/features/planFeed";
import { dayAtHour } from "@/features/lead/bookRules";
import { atMinute, SCHEDULE_DEFAULTS } from "@/features/schedule";
import { minuteIn, getZone } from "@/features/zone";
import { Button, ChoiceChips, IconButton, Stepper, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast, SheetScroll } from "@/ui/overlays";
import { Divider, ListRow, RowView } from "@/ui/surfaces";
import { SUBJECT_KIND, taskAssignees, taskPlaces, taskSubject } from "./tasks";
import { goneId } from "@/features/team";

/**
 * The one task form (docs/specs/13 §3.7, 20 §7): what it is tied to (on top, opens it), the title, the due date,
 * «В Плане» (no time / all day / with a time — then the task shows in the Plan), the description, who.
 * Used by the «Задачи» screen, the lead and the client. A new task without a subject first asks «к чему» (13 §2.4:
 * nothing is created loose). One id per opening: a double tap saves the same task twice, never two tasks.
 */
export type TaskDraft = Omit<Task, "id"> & { id?: ID };

const STEP = 30;
const DAY_MIN = 24 * 60;
/** today of the company + n days at h:00 of its clock (П4b) */
const WHEN = [
  { key: "today", n: 0, h: 17 },
  { key: "tomorrow", n: 1, h: 9 },
  { key: "in3", n: 3, h: 9 },
  { key: "week", n: 7, h: 9 },
] as const;
type PlanMode = "none" | "allDay" | "time";

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

export function TaskSheet({ value, onClose }: { value: TaskDraft | null; onClose: () => void }) {
  const h = useHeldSheet(value);
  if (!h.value) return null;
  return <TaskSheetBody key={`${h.value.id ?? `new-${h.value.subjectId}`}-${h.opening}`} value={h.value} visible={h.visible} onExited={h.onExited} onClose={onClose} />;
}

function TaskSheetBody({ value, onClose, visible, onExited }: { value: TaskDraft; onClose: () => void; visible: boolean; onExited: () => void }) {
  const store = useStore();
  const { db, role } = store;
  const { t, day: dayText, time } = useI18n();
  const toast = useToast();
  const tz = getZone();
  const [id] = useState<ID>(() => value.id ?? uid());
  const [subject, setSubject] = useState({ subjectType: value.subjectType, subjectId: value.subjectId });
  const [title, setTitle] = useState(value.title);
  const [dueAt, setDueAt] = useState(value.dueAt);
  // the person on the task is not at work any more (docs/specs/22 §2): no chip chosen, «Сохранить» waits for a choice
  const wasGone = goneId(db, value.assigneeId);
  const [assigneeId, setAssigneeId] = useState(wasGone ? undefined : value.assigneeId);
  const [description, setDescription] = useState(value.description ?? "");
  const [mode, setMode] = useState<PlanMode>(value.startsAt ? (value.allDay ? "allDay" : "time") : "none");
  const [day, setDay] = useState<DayKey>(value.startsAt ? isoDayKey(value.startsAt, tz) : todayKey(tz));
  const [startMin, setStartMin] = useState(value.startsAt && !value.allDay ? minuteIn(value.startsAt, tz) : 9 * 60);
  const [duration, setDuration] = useState(
    value.startsAt && value.endsAt && !value.allDay ? Math.max(15, Math.round((Date.parse(value.endsAt) - Date.parse(value.startsAt)) / 60_000)) : 60,
  );
  const [calendar, setCalendar] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  // the technician gives a task only to himself (S26); the office to anyone
  const people = taskAssignees(db, role, value.assigneeId);

  const draft: Task = useMemo(() => {
    const range = mode === "none" ? undefined : eventRange({ day, allDay: mode === "allDay", days: 1, startMin, duration }, tz);
    return {
      id,
      ...subject,
      title: title.trim(),
      dueAt,
      assigneeId,
      doneAt: value.doneAt,
      startsAt: range?.startsAt,
      endsAt: range?.endsAt,
      allDay: mode === "allDay" ? true : undefined,
      description: description.trim() || undefined,
    };
  }, [id, subject, title, dueAt, assigneeId, value.doneAt, mode, day, startMin, duration, description, tz]);
  const ok = !!draft.subjectId && draft.title.length >= 2 && !(wasGone && !assigneeId);
  const dirty = JSON.stringify({ ...draft, id: undefined }) !== JSON.stringify({ ...value, id: undefined, title: value.title.trim(), description: value.description || undefined, allDay: value.allDay || undefined });

  const save = () => {
    if (!ok) return;
    const r = store.saveTask(draft);
    toast.show(store.online ? t("task.saved") : t("offline.queued"), r.undo);
    onClose();
  };
  const toggleDone = () => {
    const r = store.saveTask({ ...draft, doneAt: draft.doneAt ? undefined : new Date().toISOString() });
    toast.show(t(draft.doneAt ? "task.reopened" : "task.doneToast"), r.undo);
    onClose();
  };
  const s = draft.subjectId ? taskSubject(db, draft) : undefined;
  const places = draft.subjectId ? [] : taskPlaces(db, role, placeQuery).slice(0, 20);

  return (
    <Sheet visible={visible} onExited={onExited} onClose={onClose} title={value.id ? t("task.edit") : t("task.new")} dirty={dirty} onSave={ok ? save : undefined}>
      <View style={{ gap: space[3] }}>
        <Field label={t("w6.task.subject")}>
          {s ? (
            <ListRow
              title={s.label || t("w6.task.subjectGone")}
              subtitle={t(SUBJECT_KIND[s.kind])}
              onPress={s.href ? () => { onClose(); router.push(s.href as never); } : undefined}
              right={!value.subjectId ? <IconButton icon="close" label={t("w6.task.subjectChange")} onPress={() => setSubject({ subjectType: "customer", subjectId: "" })} /> : undefined}
            />
          ) : (
            <View style={{ gap: space[2] }} testID="task-places">
              <TextField type="search" icon="search" value={placeQuery} onChangeText={setPlaceQuery} placeholder={t("w6.task.subjectSearch")} />
              <SheetScroll style={{ maxHeight: component.sheetListMax }} keyboardShouldPersistTaps="handled">
                {places.length === 0 ? (
                  <T v="caption" tone="mut">{t("w6.task.subjectNone")}</T>
                ) : (
                  places.map((p, i) => (
                    <View key={`${p.kind}-${p.subjectId}`}>
                      {i > 0 ? <Divider /> : null}
                      <ListRow title={p.label} subtitle={t(SUBJECT_KIND[p.kind])} onPress={() => setSubject({ subjectType: p.kind, subjectId: p.subjectId })} />
                    </View>
                  ))
                )}
              </SheetScroll>
            </View>
          )}
        </Field>
        <Field label={t("task.what")}>
          <TextField type="title" value={title} onChangeText={setTitle} placeholder={t("task.whatPh")} />
        </Field>
        <Field label={t("task.when")}>
          <ChoiceChips<string>
            value={WHEN.find((w) => dueAt === dayAtHour(w.n, w.h))?.key ?? (dueAt ? "" : "none")}
            onChange={(k) => {
              if (k === "none") return setDueAt(undefined);
              const w = WHEN.find((x) => x.key === k);
              if (w) setDueAt(dayAtHour(w.n, w.h));
            }}
            items={[...WHEN.map((w) => ({ key: w.key, label: t(`task.when.${w.key}` as DictKey) })), { key: "none", label: t("task.noDate") }]}
          />
          {dueAt ? <T v="caption" tone="mut">{`${dayText(dueAt)} ${time(dueAt)}`}</T> : null}
        </Field>
        <Field label={t("w6.task.inPlan")}>
          {/* chips, not a switch: the form keeps one yellow — «Сохранить» (rule 2) */}
          <ChoiceChips<PlanMode>
            value={mode}
            onChange={setMode}
            items={[
              { key: "none", label: t("w6.task.planNone") },
              { key: "allDay", label: t("plan5.allDay") },
              { key: "time", label: t("plan5.withTime") },
            ]}
          />
        </Field>
        {mode !== "none" ? (
          <>
            <Field label={t("plan5.ev.day")}>
              <RowView style={{ justifyContent: "space-between" }}>
                <T v="body" style={{ flex: 1 }}>
                  {dayText(atMinute(day, 12 * 60))}
                </T>
                <Button label={t("vf.otherDate")} icon="calendar" size="sm" variant="ghost" onPress={() => setCalendar((x) => !x)} />
              </RowView>
              {calendar ? <DatePick value={day} onPick={(k) => { setDay(k); setCalendar(false); }} /> : null}
            </Field>
            {mode === "time" ? (
              <>
                <Field label={t("sch.start")}>
                  <RowView style={{ justifyContent: "space-between" }}>
                    <IconButton icon="minus" label={`${t("sch.start")} −${STEP} ${t("sch.min")}`} onPress={() => setStartMin(Math.max(0, startMin - STEP))} />
                    <T v="title" tabular>
                      {draft.startsAt ? time(draft.startsAt) : ""}
                    </T>
                    <IconButton icon="plus" label={`${t("sch.start")} +${STEP} ${t("sch.min")}`} onPress={() => setStartMin(Math.min(DAY_MIN - STEP, startMin + STEP))} />
                  </RowView>
                </Field>
                <Stepper label={t("sch.duration")} unit={t("sch.min")} value={duration} step={15} min={15} max={Math.max(SCHEDULE_DEFAULTS.maxDurationMin, duration)} onChange={setDuration} />
              </>
            ) : null}
          </>
        ) : null}
        <Field label={t("plan5.ev.description")}>
          <TextField type="note" value={description} onChangeText={setDescription} placeholder={t("w6.task.descriptionPh")} />
        </Field>
        <Field label={t("task.who")}>
          <ChoiceChips<string> value={assigneeId ?? ""} onChange={setAssigneeId} items={people.map((m) => ({ key: m.id, label: m.name }))} />
        </Field>
        <Button label={t("ue.save")} icon="check" variant="primary" full disabled={!ok} onPress={save} />
        {value.id ? <Button label={t(draft.doneAt ? "task.undo" : "task.done")} icon={draft.doneAt ? "undo" : "check"} variant="secondary" full onPress={toggleDone} /> : null}
      </View>
    </Sheet>
  );
}
