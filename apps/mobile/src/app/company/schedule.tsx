/**
 * «Ещё → Компания → Расписание» (docs/specs/03-visit-and-plan.md §6.1, «П4 — этап 0», wave П4a): time zone, working
 * hours by day, default length by visit kind, slot step, arrival window the client sees, «late» threshold. Only the
 * director (the whole company section, nav/roles.ts; in the database owner / admin, companies_update). Not a step of
 * the first-run setup. Saving is like the profile: at once on the phone, offline into the queue.
 */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { zoneChoices } from "@/features/companySetup";
import { validZone } from "@/features/zone";
import { atMinute } from "@/features/schedule";
import {
  arrivalWindow, businessHoursOf, DURATION_RANGE, LATE_RANGE, scheduleSettingsOf, STEP_CHOICES, tzLabel, WINDOW_CHOICES,
  type BusinessHours, type ScheduleSettings, type WeekDay,
} from "@/features/scheduleSettings";
import { Button, ChoiceChips, IconButton, StatusChip, Stepper, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Empty, RowView, Screen } from "@/ui/surfaces";

/** Monday first, as the Plan's week */
const DAYS_ORDER: WeekDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const HOUR_STEP = 30;

export default function CompanySchedule() {
  const store = useStore();
  const { t, time } = useI18n();
  const toast = useToast();
  const c = store.db.company;
  const [tz, setTz] = useState(c?.timezone ?? "America/Los_Angeles");
  const [s, setS] = useState<ScheduleSettings>(() => scheduleSettingsOf(c));
  const [hours, setHours] = useState<BusinessHours>(() => businessHoursOf(c));
  const back = () => (router.canGoBack() ? router.back() : router.replace("/company"));
  if (!c) {
    return (
      <Screen title={t("schs.title")} back={back}>
        <Empty icon="home2" title={t("co.none")} />
      </Screen>
    );
  }
  const set = (p: Partial<ScheduleSettings>) => setS((x) => ({ ...x, ...p }));
  const setDay = (d: WeekDay, h: BusinessHours[WeekDay]) => setHours((x) => ({ ...x, [d]: h }));
  // a wall-clock label: a minute of a fixed day on the company clock, shown on the same clock (no DST that day)
  const clock = (m: number) => time(atMinute("2026-01-05", m));
  const save = () => {
    // the zone only when it was chosen here: saving the hours does not send it (docs/specs/22 §1.3)
    const undo = store.saveCompany({ ...(tz !== c.timezone ? { timezone: tz } : {}), scheduleSettings: s, businessHours: hours });
    toast.show(store.online ? t("co.saved") : t("offline.queued"), undo);
    back();
  };
  // the example under the window: «Клиент увидит: “Ivan приедет 10:00–12:00”»
  const sample = new Date(2026, 0, 5, 10, 0).toISOString();
  const w = arrivalWindow(sample, s);
  const example = w ? `${clock(600)}–${clock(600 + s.arrivalWindowMin)}` : clock(600);
  const dur = (k: "inspectionMin" | "jobMin" | "serviceMin" | "followUpMin", label: DictKey) => (
    <Stepper label={t(label)} unit={t("sch.min")} value={s[k]} step={DURATION_RANGE.step} min={DURATION_RANGE.min} max={DURATION_RANGE.max} onChange={(v) => set({ [k]: v })} />
  );

  return (
    <Screen title={t("schs.title")} back={back} subtitle={t("schs.who")}>
      <Card>
        <T v="heading">{t("co.timezone")}</T>
        <T v="caption" tone="mut">{t("schs.tzHint")}</T>
        {c.timezone && !validZone(c.timezone) ? (
          <View style={{ gap: space[1] }} testID="tz-unknown">
            <StatusChip status="warn" label={t("fr7.tzUnknownChip")} />
            <T v="caption" tone="mut">{t("fr7.tzUnknown", { tz: c.timezone })}</T>
          </View>
        ) : null}
        <ChoiceChips value={tz} onChange={setTz} items={zoneChoices(c.timezone, validZone).map((z) => ({ key: z, label: tzLabel(z) }))} />
      </Card>

      <Card>
        <T v="heading">{t("schs.hours")}</T>
        <T v="caption" tone="mut">{t("schs.hoursHint")}</T>
        {DAYS_ORDER.map((d) => {
          const h = hours[d];
          return (
            <View key={d} style={{ gap: space[1] }}>
              <RowView style={{ justifyContent: "space-between" }}>
                <T v="body" w="semibold">{t(`schs.day.${d}` as DictKey)}</T>
                <Toggle label={`${t(`schs.day.${d}` as DictKey)} · ${t("schs.workday")}`} on={!!h} onChange={(on) => setDay(d, on ? [480, 1080] : null)} />
              </RowView>
              {h ? (
                <>
                  <HourRow day={t(`schs.day.${d}` as DictKey)} label={t("schs.from")} value={clock(h[0])}
                    onMinus={() => setDay(d, [Math.max(0, h[0] - HOUR_STEP), h[1]])}
                    onPlus={() => setDay(d, [Math.min(h[1] - HOUR_STEP, h[0] + HOUR_STEP), h[1]])} />
                  <HourRow day={t(`schs.day.${d}` as DictKey)} label={t("schs.to")} value={clock(h[1])}
                    onMinus={() => setDay(d, [h[0], Math.max(h[0] + HOUR_STEP, h[1] - HOUR_STEP)])}
                    onPlus={() => setDay(d, [h[0], Math.min(1440, h[1] + HOUR_STEP)])} />
                </>
              ) : (
                <T v="caption" tone="mut">{t("schs.dayOff")}</T>
              )}
            </View>
          );
        })}
      </Card>

      <Card>
        <T v="heading">{t("schs.durations")}</T>
        {dur("inspectionMin", "schs.kind.inspection")}
        {dur("jobMin", "schs.kind.job")}
        {dur("serviceMin", "schs.kind.service")}
        {dur("followUpMin", "schs.kind.followUp")}
      </Card>

      <Card>
        <T v="heading">{t("schs.step")}</T>
        <ChoiceChips value={String(s.stepMin)} onChange={(k) => set({ stepMin: Number(k) })} items={STEP_CHOICES.map((m) => ({ key: String(m), label: `${m} ${t("sch.min")}` }))} />
      </Card>

      <Card>
        <T v="heading">{t("schs.window")}</T>
        <ChoiceChips
          value={String(s.arrivalWindowMin)}
          onChange={(k) => set({ arrivalWindowMin: Number(k) })}
          items={WINDOW_CHOICES.map((m) => ({ key: String(m), label: m ? t("schs.windowH", { n: m / 60 }) : t("schs.exact") }))}
        />
        <T v="caption" tone="mut">{t("schs.windowExample", { time: example })}</T>
      </Card>

      <Card>
        <Stepper label={t("schs.late")} unit={t("sch.min")} value={s.lateAfterMin} step={LATE_RANGE.step} min={LATE_RANGE.min} max={LATE_RANGE.max} onChange={(v) => set({ lateAfterMin: v })} />
        <T v="caption" tone="mut">{t("schs.lateHint")}</T>
      </Card>

      <Button label={t("ue.save")} icon="check" full onPress={save} />
    </Screen>
  );
}

/** «Начало  −  8:00 AM  +»: one end of a working day, by 30 min */
function HourRow({ day, label, value, onMinus, onPlus }: { day: string; label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <RowView style={{ gap: space[2] }}>
      <T v="body" tone="mut" style={{ flex: 1 }}>{label}</T>
      <IconButton icon="minus" label={`${day} · ${label} −${HOUR_STEP}`} onPress={onMinus} />
      <T v="body" tabular>{value}</T>
      <IconButton icon="plus" label={`${day} · ${label} +${HOUR_STEP}`} onPress={onPlus} />
    </RowView>
  );
}
