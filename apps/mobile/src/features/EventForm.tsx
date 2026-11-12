import { useMemo, useState, type ReactNode } from "react";
import { useHeldSheet } from "@/ui/heldSheet";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { CalendarEvent, CalendarEventKind, ID } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { todayKey, type DayKey } from "@/features/calendar";
import { uid } from "@/features/estimateDoc";
import { DatePick } from "@/features/DatePick";
import { eventFields, eventProblems, eventRange } from "@/features/planFeed";
import { atMinute, SCHEDULE_DEFAULTS } from "@/features/schedule";
import { Button, ChoiceChips, IconButton, Stepper, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { RowView } from "@/ui/surfaces";

/**
 * «Событие» and «Выходной» of the Plan (docs/specs/13-app-structure.md §3.2, §2.4; wave 5 PR-B): a name, the person (a day
 * off is always someone's; an event may be the whole company's), the day, «Весь день» with a number of days or a start
 * and a length, a description. Saving with problems is not possible (the same rules as the server, eventProblems).
 * An existing one can be changed or removed («Отменить» for 5 s, rule 5). Days and times are the company's.
 */
/** `day` — the day picked in the Plan, for a new one */
export type EventSheetState = { kind: CalendarEventKind; event?: CalendarEvent; day?: DayKey } | null;

const STEP = 30;          // the start moves by half an hour
const DAY_MIN = 24 * 60;

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

export function EventSheet({ state, onClose }: { state: EventSheetState; onClose: () => void }) {
  const h = useHeldSheet(state);
  if (!h.value) return null;
  // a new key per opening: the fields start from the event (or empty) every time
  return <EventSheetBody key={h.value.event?.id ?? `new-${h.value.kind}`} state={h.value} visible={h.visible} onExited={h.onExited} onClose={onClose} />;
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
  const [calendar, setCalendar] = useState(false);

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
    <Sheet visible={visible} onExited={onExited} onClose={onClose} title={sheetTitle} dirty={changed} onSave={problems.length ? undefined : save}>
      <View style={{ gap: space[3] }}>
        <Field label={t("plan5.ev.name")}>
          <TextField type="title" value={title} onChangeText={setTitle} placeholder={t(kind === "time_off" ? "plan5.ev.namePhOff" : "plan5.ev.namePh")} />
        </Field>
        <Field label={t("plan5.ev.who")}>
          <ChoiceChips value={who || "_"} onChange={(k) => setWho(k as ID | "all")} items={whoItems} />
        </Field>
        <Field label={t("plan5.ev.day")}>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="body" style={{ flex: 1 }}>
              {dayText(atMinute(day, 12 * 60))}
            </T>
            <Button label={t("vf.otherDate")} icon="calendar" size="sm" variant="ghost" onPress={() => setCalendar((x) => !x)} />
          </RowView>
          {calendar ? <DatePick value={day} onPick={(k) => { setDay(k); setCalendar(false); }} /> : null}
        </Field>
        {/* chips, not a switch: the form keeps one yellow — «Сохранить» (rule 2) */}
        <ChoiceChips
          value={allDay ? "allDay" : "time"}
          onChange={(k) => setAllDay(k === "allDay")}
          items={[
            { key: "allDay", label: t("plan5.allDay") },
            { key: "time", label: t("plan5.withTime") },
          ]}
        />
        {allDay ? (
          <Stepper label={t("plan5.ev.days")} value={days} min={1} max={Math.max(31, init.days)} onChange={setDays} />
        ) : (
          <>
            <Field label={t("sch.start")}>
              <RowView style={{ justifyContent: "space-between" }}>
                <IconButton icon="minus" label={`${t("sch.start")} −${STEP} ${t("sch.min")}`} onPress={() => setStartMin(Math.max(0, startMin - STEP))} />
                <T v="title" tabular>
                  {time(value.startsAt)}
                </T>
                <IconButton icon="plus" label={`${t("sch.start")} +${STEP} ${t("sch.min")}`} onPress={() => setStartMin(Math.min(DAY_MIN - STEP, startMin + STEP))} />
              </RowView>
            </Field>
            <Stepper label={t("sch.duration")} unit={t("sch.min")} value={duration} step={15} min={15} max={Math.max(SCHEDULE_DEFAULTS.maxDurationMin, init.duration)} onChange={setDuration} />
          </>
        )}
        <Field label={t("plan5.ev.description")}>
          <TextField type="note" value={description} onChangeText={setDescription} placeholder={t("plan5.ev.descriptionPh")} />
        </Field>
        {problems.map((p) => (
          <T key={p} v="caption" tone="warn">
            {`⚠ ${t(`plan5.ev.problem.${p}` as DictKey)}`}
          </T>
        ))}
        <Button label={t("plan5.ev.save")} icon="check" variant="primary" full disabled={problems.length > 0} onPress={save} />
        {e ? <Button label={t("plan5.ev.remove")} icon="trash" variant="secondary" full onPress={remove} /> : null}
      </View>
    </Sheet>
  );
}
