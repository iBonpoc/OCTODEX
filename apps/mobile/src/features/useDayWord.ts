import { useI18n } from "@/i18n";
import { dayOffsetOf, isoDayKey } from "./calendar";
import { dayWord, type DayWords } from "./dayWords";

/** the screen's form: `(iso, mid?) → «Сегодня» / «вчера» / «пт, 19 нояб.»` on the company's calendar */
export function useDayWord() {
  const { t, day } = useI18n();
  const w: DayWords = { today: t("common.today"), tomorrow: t("common.tomorrow"), yesterday: t("proto.client.yesterday"), day };
  return (iso: string, mid = false) => dayWord(dayOffsetOf(isoDayKey(iso)), iso, w, mid);
}
