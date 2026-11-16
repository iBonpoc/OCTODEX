import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { canServe } from "@/features/clients";
import { useDevice } from "@/theme/ThemeProvider";
import { Button } from "@/ui/controls";

/**
 * «＋ <object>» in a section of a client's or a property's card (DS §5.3, §12.2; #1395): the card has no floating «＋», so the list of
 * jobs or estimates names its own button. Office only; none for «не обслуживаем» (S4 / S5 / S17).
 */
export function AddObject({ kind, customerId, propertyId, testID, full, short, inList }: { kind: "job" | "estimate"; customerId: string; propertyId?: string; testID: string; full?: boolean; short?: boolean; inList?: boolean }) {
  const { t } = useI18n();
  const { db, role } = useStore();
  const { wide } = useDevice();
  // `inList`: above a list on the phone; from 820 the screen puts the same button in its header on the right (DS §12.2, #1664)
  if (role === "tech" || !canServe(db, customerId) || (inList && wide)) return null;
  const q = `?customerId=${customerId}${propertyId ? `&propertyId=${propertyId}` : ""}`;
  return (
    <Button
      testID={testID}
      label={t(short ? (kind === "job" ? "fab.obj.job" : "fab.obj.estimate") : kind === "job" ? "path.jobNew" : "path.estimateNew")}
      icon="plus"
      variant="secondary"
      full={full}
      onPress={() => router.push((kind === "job" ? `/job/new${q}` : `/estimate/new${q}`) as never)}
    />
  );
}
