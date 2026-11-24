import { useMemo, useState, type ReactNode } from "react";
import { useHeldSheet } from "@/ui/heldSheet";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { CalendarEvent, CalendarEventKind, ID } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { addDays, todayKey, type DayKey } from "@/features/calendar";
import { uid } from "@/features/estimateDoc";
import { eventFields, eventProblems, eventRange } from "@/features/planFeed";
import { atMinute, SCHEDULE_DEFAULTS } from "@/features/schedule";
import { ChoiceChips, Stepper, TextField } from "@/ui/controls";
import { DateField } from "@/ui/dateField";
import { ButtonPair } from "@/ui/pairs";
import { SelectField } from "@/ui/selectField";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { FieldAnchor, FieldError, useRequiredForm, type Problem } from "@/ui/requiredForm";

/**
 * «Событие» and «Выходной» of the Plan (docs/specs/13-app-structure.md §3.2, §2.4; wave 5 PR-B): a name, the person (a day
 * off is always someone's; an event may be the whole company's), the day, «Весь день» with a number of days or a start
 * and a length, a description. Saving with problems is not possible (the same rules as the server, eventProblems) — but nothing
 * is said before the person tries (#2220, founder 19.11: a new empty form greeted him with «Нужно название» and a dimmed
 * «Сохранить»): «Сохранить» is always live; pressed with a problem, the form stays, the error is under its field, read aloud,
 * the first one gets the scroll and the focus (`useRequiredForm`, DS §11 п.2, the same as the other forms).
 * An existing one can be changed or removed («Отменить» for 5 s, rule 5). Days and times are the company's.
 */
/** `day` — the day picked in the Plan, for a new one */
export type EventSheetState = { kind: CalendarEventKind; event?: CalendarEvent; day?: DayKey } | null;

const STEP = 30;          // the start moves by half an hour
const DAY_MIN = 24 * 60;

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

export function EventSheet({ state, onClose }: { state: EventSheetState; onClose: () => void }) {
  const h = useHeldSheet(state);
  if (!h.value) return null;
  // a new key per opening: the fields start from the event (or empty) every time
  return <EventSheetBody key={`${h.value.event?.id ?? `new-${h.value.kind}`}-${h.opening}`} state={h.value} visible={h.visible} onExited={h.onExited} onClose={onClose} />;
}

function EventSheetBody({ state, onClose, visible, onExited }: { state: NonNullable<EventSheetState>; onClose: () => void; visible: boolean; onExited: () => void }) {
  const store = useStore();
  const { db } = store;
  const { t, day: dayText, time } = useI18n();
  const toast = useToast();
  const e = state.event;
  const kind = e?.kind ?? state.kind;
  const people = db.members.filter((m) => !m.pending);
  // one id per opening: a double tap on «Сохранить» saves the same event twice (an edit), never two events
  const [id] = useState<ID>(() => e?.id ?? uid());
  const init = useMemo(() => eventFields(e, state.day ?? todayKey()), [e, state.day]);
  const [title, setTitle] = useState(e?.title ?? "");
  const [who, setWho] = useState<ID | "all">(e?.userId ?? (kind === "event" ? "all" : ""));
  const [allDay, setAllDay] = useState(e ? init.allDay : kind === "time_off");
  const [day, setDay] = useState<DayKey>(init.day);
  const [days, setDays] = useState(init.days);
  const [startMin, setStartMin] = useState(init.startMin);
  const [duration, setDuration] = useState(init.duration);
  const [description, setDescription] = useState(e?.description ?? "");
  const form = useRequiredForm();
  // the start every half hour of the day (the one it has, off the grid, stays); a past day can be picked (a record after the fact)
  const startItems = useMemo(() => [...new Set([...Array.from({ length: DAY_MIN / STEP }, (_, i) => i * STEP), startMin])].sort((a, b) => a - b), [startMin]);
  const minDay = useMemo(() => { const back = addDays(todayKey(), -366); return init.day < back ? init.day : back; }, [init.day]);

  const value = useMemo(() => {
    const r = eventRange({ day, allDay, days, startMin, duration });
    return { kind, title, userId: who && who !== "all" ? who : undefined, ...r, allDay, description };
  }, [kind, title, who, allDay, day, days, startMin, duration, description]);
  // a person who left the company cannot keep the event (the server refuses it): choose another
  const gone = !!value.userId && !people.some((m) => m.id === value.userId);
  const problems = [...eventProblems(value), ...(gone ? (["person"] as const) : [])].filter((p, i, a) => a.indexOf(p) === i);
  const changed = e
    ? (e.title ?? "") !== title || (e.userId ?? "") !== (value.userId ?? "") || e.startsAt !== value.startsAt || e.endsAt !== value.endsAt || e.allDay !== allDay || (e.description ?? "") !== description
    : !!title.trim() || !!description.trim();

  // a problem → the field it is under: «long» is the field that is too long
  const problemField = (p: (typeof problems)[number]) => (p === "long" ? (title.trim().length > 200 ? "title" : "description") : p);
  const trySave = () =>
    form.submit(
      problems.map((p): Problem => ({ id: problemField(p), text: t(`plan5.ev.problem.${p}` as DictKey) })),
      save,
    );
  const errorOf = (id: string) => form.errors[id];
  // the error of a chip group or of the time goes when the person changes it (a text field clears its own)
  const changeWho = (k: string) => {
    setWho(k as ID | "all");
    form.field("person").clear();
  };
  const timeEdit = (f: () => void) => {
    f();
    form.field("time").clear();
  };

  const save = () => {
    const r = store.saveCalendarEvent({ ...value, id });
    if (!r) return;
    toast.show(t(kind === "time_off" ? "plan5.ev.savedOff" : "plan5.ev.saved", { date: dayText(value.startsAt) }), r.undo);
    onClose();
  };
  const remove = () => {
    if (!e) return;
    toast.show(t("plan5.ev.removed"), store.removeCalendarEvent(e.id));
    onClose();
  };
  const whoItems = [
    ...(kind === "event" ? [{ key: "all", label: t("plan5.company") }] : []),
    ...people.map((m) => ({ key: m.id, label: m.name })),
  ];
  const sheetTitle = t(kind === "time_off" ? (e ? "plan5.timeOff" : "plan5.ev.newTimeOff") : e ? "plan5.event" : "plan5.ev.newEvent");

  return (
    <Sheet visible={visible} onExited={onExited} onClose={onClose} title={sheetTitle} dirty={changed} onSave={trySave}>
      <View style={{ gap: space[3] }}>
        <Field label={t("plan5.ev.name")}>
          <TextField type="title" value={title} onChangeText={setTitle} placeholder={t(kind === "time_off" ? "plan5.ev.namePhOff" : "plan5.ev.namePh")} field={form.field("title")} testID="ev-title" />
        </Field>
        <Field label={t("plan5.ev.who")}>
          <FieldAnchor field={form.field("person")} testID="ev-person">
            <ChoiceChips value={who || "_"} onChange={changeWho} items={whoItems} />
            <FieldError text={errorOf("person")} testID="ev-person-error" />
          </FieldAnchor>
        </Field>
        {/* chips, not a switch: the form keeps one yellow — «Сохранить» (rule 2); above the day: they decide if a time stands beside it */}
        <ChoiceChips
          value={allDay ? "allDay" : "time"}
          onChange={(k) => timeEdit(() => setAllDay(k === "allDay"))}
          items={[
            { key: "allDay", label: t("plan5.allDay") },
            { key: "time", label: t("plan5.withTime") },
          ]}
        />
        {/* the day and the start in one row while they fit (#2350: «дата, время… горизонтально в ряд»), the calendar under both */}
        <DateField
          testID="ev-day"
          label={t("plan5.ev.day")}
          value={day}
          min={minDay}
          onChange={(k) => { if (k) timeEdit(() => setDay(k)); }}
          beside={allDay ? undefined : (
            <SelectField<string>
              testID="ev-start"
              label={t("sch.start")}
              labelAbove
              value={String(startMin)}
              items={startItems.map((m) => ({ key: String(m), label: time(atMinute(day, m)) }))}
              onChange={(k) => timeEdit(() => setStartMin(Number(k)))}
            />
          )}
        />
        {allDay ? (
          <Stepper label={t("plan5.ev.days")} value={days} min={1} max={Math.max(31, init.days)} onChange={(n) => timeEdit(() => setDays(n))} />
        ) : (
          <Stepper label={t("sch.duration")} unit={t("sch.min")} value={duration} step={15} min={15} max={Math.max(SCHEDULE_DEFAULTS.maxDurationMin, init.duration)} onChange={(n) => timeEdit(() => setDuration(n))} />
        )}
        <FieldAnchor field={form.field("time")} testID="ev-time">
          <FieldError text={errorOf("time")} testID="ev-time-error" />
        </FieldAnchor>
        <Field label={t("plan5.ev.description")}>
          <TextField type="note" value={description} onChangeText={setDescription} placeholder={t("plan5.ev.descriptionPh")} field={form.field("description")} testID="ev-description" />
        </Field>
        {/* always live: the errors come only when the person tries to save (#2220) */}
        <ButtonPair
          main={{ label: t("plan5.ev.save"), icon: "check", variant: "primary", onPress: trySave, testID: "ev-save" }}
          second={e ? { label: t("plan5.ev.remove"), icon: "trash", variant: "secondary", onPress: remove } : null}
        />
      </View>
    </Sheet>
  );
}
