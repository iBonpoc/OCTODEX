import { useI18n } from "@/i18n";
import { PageNotFound } from "@/ui/emptyStates";
import { Screen } from "@/ui/surfaces";

/** An address the app does not have (a stale link, a typo): «Страницы нет» with the way home — no silent redirect
 *  (DS §13, S-46; the GoRix mark, §18.2) */
export default function NotFound() {
  const { t } = useI18n();
  return (
    <Screen title={t("empty.page")}>
      <PageNotFound titled={false} />
    </Screen>
  );
}
