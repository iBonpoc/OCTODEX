import type { ComponentProps } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { component, space } from "@octo/design-tokens";
import { BrandMark } from "@/ui/brand";
import { T } from "@/ui/primitives";
import { Card, Empty } from "@/ui/surfaces";
import { listEmptyKind } from "@/ui/filterBarRules";

/**
 * The empty states of a screen (DS §13, Н-65, S-42…S-47). Two kinds of «empty» in a list and two of «not found», one wording each:
 * - `ListEmpty` — an empty list (founder 20.11, #2264): nothing at all → `Empty` («Clients yet» + the button that makes the first one);
 *   something hidden by the search, the lane or the sheet → «Nothing found» + «Reset», and, when «All» has it, «Found in «All» · N → Show»;
 *   the choice is `listEmptyKind` (filterBarRules);
 * - `NotFound` — the thing is gone or the link is old: «{Thing} not found» + why + the way back (no silent redirect);
 * - `PageNotFound` — an address that does not exist: «No such page» + «Home».
 */
export function ListEmpty({
  base,
  narrowed,
  none,
  onReset,
  inAll,
  testID = "list-empty",
}: {
  /** everything the list could hold, whatever the lane, the search and the sheet say */
  base: number;
  /** the search, a lane other than the default or a group of the sheet is on */
  narrowed: boolean;
  /** «nothing at all»: the object's icon, «{Objects} yet», why, the button — the list's own words */
  none: ComponentProps<typeof Empty>;
  /** «Reset»: the search, the lane and the sheet back to the broad default */
  onReset: () => void;
  /** the search finds N in «All» (the lane hides them) */
  inAll?: { n: number; onShow: () => void };
  testID?: string;
}) {
  const { t } = useI18n();
  if (listEmptyKind(base, narrowed) === "none") return <Empty {...none} testID={none.testID ?? `${testID}-none`} />;
  return (
    <Empty
      icon="search"
      title={t("empty.nothing")}
      hint={t("empty.nothingHint")}
      testID={`${testID}-notfound`}
      action={
        <View style={{ gap: space[2], alignItems: "center" }}>
          <View testID={`${testID}-reset`}>
            <Button label={t("empty.reset")} variant="secondary" onPress={onReset} />
          </View>
          {inAll && inAll.n > 0 ? (
            <View testID={`${testID}-all`}>
              <Button label={t("empty.searchAll", { n: inAll.n })} variant="ghost" onPress={inAll.onShow} />
            </View>
          ) : null}
        </View>
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

export function PageNotFound({ testID = "page-not-found", titled = true }: { testID?: string; /** false — the screen's own title already says «Страницы нет» */ titled?: boolean }) {
  const { t } = useI18n();
  // the app speaks for itself here — the GoRix mark, not an object's icon (DS §18.2); the screen has a yellow main
  // button, so the mark's dot is ink (one accent, rule 2)
  return (
    <Card style={{ alignItems: "center", paddingVertical: space[8], gap: space[3], alignSelf: "center", width: "100%", maxWidth: component.modalW }}>
      <View testID={testID}>
        <BrandMark size={component.brand.mark} screenHasPrimary testID={`${testID}-mark`} />
      </View>
      {titled ? (
        <T v="heading" center>
          {t("empty.page")}
        </T>
      ) : null}
      <T v="body" tone="mut" center>
        {t("empty.pageHint")}
      </T>
      <View testID={`${testID}-home`}>
        <Button label={t("empty.home")} onPress={() => router.replace("/")} />
      </View>
    </Card>
  );
}
