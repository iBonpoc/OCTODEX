/**
 * The marks of an estimate line a module wrote (C4, spec 33 П23.7): «from measurement»;
 * «no price» / «test price» / «not in measurement» — a status each, icon + word (rule 2). Company screens only.
 */
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import type { LineMark } from "./estimateDoc";
import { useI18n } from "@/i18n";
import { StatusChip } from "@/ui/controls";

const KEY = { module: "ue.src.module", noPrice: "ue.src.noPrice", testPrice: "ue.src.testPrice", gone: "ue.src.gone" } as const;

export function LineMarks({ marks, lineId }: { marks: LineMark[]; lineId: string }) {
  const { t } = useI18n();
  if (!marks.length) return null;
  return (
    <View testID={`ue-line-marks-${lineId}`} style={{ flexDirection: "row", flexWrap: "wrap", gap: space[1] }}>
      {marks.map((m) => (
        <View key={m} testID={`ue-line-mark-${m}`}>
          <StatusChip status={m === "module" ? "neutral" : "warn"} label={t(KEY[m])} soft={m === "module"} />
        </View>
      ))}
    </View>
  );
}
