import { View } from "react-native";
import { router } from "expo-router";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { Empty } from "@/ui/surfaces";

/**
 * The empty states of a screen (DS §13, Н-65, S-42…S-47). Three kinds of «empty» and two of «not found», one wording each:
 * - `Empty` (surfaces) — no data at all: the object's icon, «{Objects} yet», why, the button that makes the first one;
 * - `EmptyFilter` — a filter gave nothing: «Nothing in this filter» + «Reset filter» (12.2);
 * - `EmptySearch` — a search gave nothing: «Nothing found for «…»» (12.3), and, when «All» has it, «Found in «All» · N → Show»;
 * - `NotFound` — the thing is gone or the link is old: «{Thing} not found» + why + the way back (no silent redirect);
 * - `PageNotFound` — an address that does not exist: «No such page» + «Home».
 */
export function EmptyFilter({ onReset, testID = "empty-filter" }: { onReset: () => void; testID?: string }) {
  const { t } = useI18n();
  return (
    <Empty
      icon="sliders"
      title={t("empty.filter")}
      testID={testID}
      action={
        <View testID={`${testID}-reset`}>
          <Button label={t("empty.filterReset")} variant="secondary" onPress={onReset} />
        </View>
      }
    />
  );
}

export function EmptySearch({ q, inAll, testID = "empty-search" }: { q: string; /** the search finds N in «All» (the filter hides them) */ inAll?: { n: number; onShow: () => void }; testID?: string }) {
  const { t } = useI18n();
  return (
    <Empty
      icon="search"
      title={t("empty.search", { q })}
      testID={testID}
      action={
        inAll && inAll.n > 0 ? (
          <View testID={`${testID}-all`}>
            <Button label={t("empty.searchAll", { n: inAll.n })} variant="secondary" onPress={inAll.onShow} />
          </View>
        ) : undefined
      }
    />
  );
}

export function NotFound({ title, listLabel, onList, testID = "not-found" }: { /** «Estimate not found» — the object's own words */ title: string; listLabel: string; onList: () => void; testID?: string }) {
  const { t } = useI18n();
  return (
    <Empty
      icon="alert"
      title={title}
      hint={t("empty.notFoundHint")}
      testID={testID}
      action={
        <View testID={`${testID}-back`}>
          <Button label={listLabel} variant="secondary" onPress={onList} />
        </View>
      }
    />
  );
}

export function PageNotFound({ testID = "page-not-found" }: { testID?: string }) {
  const { t } = useI18n();
  return (
    <Empty
      icon="alert"
      title={t("empty.page")}
      hint={t("empty.pageHint")}
      testID={testID}
      action={
        <View testID={`${testID}-home`}>
          <Button label={t("empty.home")} onPress={() => router.replace("/today")} />
        </View>
      }
    />
  );
}
