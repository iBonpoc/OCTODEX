import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { Sheet } from "@/ui/overlays";
import { DateField } from "@/ui/dateField";
import { canSnoozeTo, pickMin } from "@/features/attentionSnooze";
import type { DayKey } from "@/features/zone";

/**
 * #2123: «Позже» → «Выбрать дату…» of «Разбор дел» — a day of one's own in a sheet (DateField, DS А7). Only a day after the
 * company's today; «Завтра» and the others are already in the menu, so no quick days here. The sheet is its own layer: its one
 * main button is its own (the screen's step stays the screen's).
 */
export function PickDaySheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (day: DayKey) => void }) {
  const { t } = useI18n();
  const [day, setDay] = useState<DayKey | null>(null);
  // each opening starts without a day chosen
  useEffect(() => {
    if (open) setDay(null);
  }, [open]);
  return (
    <Sheet visible={open} onClose={onClose} title={t("triage.pickTitle")}>
      <DateField label={t("triage.pickDate")} value={day} onChange={setDay} min={pickMin()} quick={false} testID="triage-pick-date" />
      <Button
        label={t("triage.pickDo")}
        variant="primary"
        full
        disabled={!day || !canSnoozeTo(day)}
        testID="triage-pick-do"
        onPress={() => {
          if (day) onPick(day);
        }}
      />
    </Sheet>
  );
}
