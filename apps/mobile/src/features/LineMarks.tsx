/**
 * The marks of an estimate line a module wrote (C4, spec 33 П23.7): «from measurement»;
 * «no price» / «not in measurement» — a status each, icon + word (rule 2). Company screens only. A line priced from a
 * sample catalog price has no mark of its own (the founder 16.11, #1873: «Везде убираем… Нигде нет её. Надписи этой»):
 * only the check before the first send reminds once — «Проверьте цены: в каталоге стоят примерные».
 */
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import type { LineMark } from "./estimateDoc";
import { useI18n } from "@/i18n";
import { StatusChip } from "@/ui/controls";

const KEY = { module: "ue.src.module", noPrice: "ue.src.noPrice", gone: "ue.src.gone" } as const;

export function LineMarks({ marks, lineId }: { marks: LineMark[]; lineId: string }) {
  const { t } = useI18n();
  const shown = marks.filter((m): m is Exclude<LineMark, "testPrice"> => m !== "testPrice");
  if (!shown.length) return null;
  return (
    <View testID={`ue-line-marks-${lineId}`} style={{ flexDirection: "row", flexWrap: "wrap", gap: space[1] }}>
      {shown.map((m) => (
        <View key={m} testID={`ue-line-mark-${m}-${lineId}`}>
          <StatusChip status={m === "module" ? "neutral" : "warn"} label={t(KEY[m])} soft={m === "module"} />
        </View>
      ))}
    </View>
  );
}
