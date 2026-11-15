import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { canServe } from "@/features/clients";
import { Button } from "@/ui/controls";

/**
 * «＋ <object>» in a section of a client's or a property's card (DS §5.3, §12.2; #1395): the card has no floating «＋», so the list of
 * jobs or estimates names its own button. Office only; none for «не обслуживаем» (S4 / S5 / S17).
 */
export function AddObject({ kind, customerId, propertyId, testID }: { kind: "job" | "estimate"; customerId: string; propertyId?: string; testID: string }) {
  const { t } = useI18n();
  const { db, role } = useStore();
  if (role === "tech" || !canServe(db, customerId)) return null;
  const q = `?customerId=${customerId}${propertyId ? `&propertyId=${propertyId}` : ""}`;
  return (
    <Button
      testID={testID}
      label={t(kind === "job" ? "path.jobNew" : "path.estimateNew")}
      icon="plus"
      variant="secondary"
      onPress={() => router.push((kind === "job" ? `/job/new${q}` : `/estimate/new${q}`) as never)}
    />
  );
}
