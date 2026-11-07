import { router } from "expo-router";
import { useI18n } from "@/i18n";
import { EstimatesBoard } from "@/features/boards";
import { Button } from "@/ui/controls";
import { Screen } from "@/ui/surfaces";

/** «Сметы»: all estimates, a section of its own for every role (founder 07.11, spec 31 §7а). */
export default function Estimates() {
  const { t } = useI18n();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  return (
    <Screen title={t("sales.estimates")} back={back} right={<Button label={t("est.new")} icon="plus" size="sm" variant="secondary" onPress={() => router.push("/estimate/new")} />}>
      <EstimatesBoard />
    </Screen>
  );
}
