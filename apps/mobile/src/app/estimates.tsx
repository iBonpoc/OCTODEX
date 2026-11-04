import { router } from "expo-router";
import { useI18n } from "@/i18n";
import { EstimatesBoard } from "@/features/boards";
import { Button } from "@/ui/controls";
import { Screen } from "@/ui/surfaces";

/** All estimates (for roles without the Sales tab). */
export default function Estimates() {
  const { t } = useI18n();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  return (
    <Screen title={t("sales.estimates")} back={back} right={<Button label={t("est.new")} icon="plus" size="sm" onPress={() => router.push("/estimate/new")} />}>
      <EstimatesBoard />
    </Screen>
  );
}
