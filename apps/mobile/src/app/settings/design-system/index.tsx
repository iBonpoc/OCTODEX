import { View } from "react-native";
import { Redirect, router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Icon, T } from "@/ui/primitives";
import { Card, Divider, ListRow, Screen } from "@/ui/surfaces";
import { canSeeShowcase } from "@/features/showcase/access";
import { SCREENS } from "@/features/showcase/registry";

/**
 * «Дизайн-система» — the showcase (#1093, founder 11.11–12.11.2026): the first screen is the list of its sections,
 * each section is its own screen (#1150: a list, then a screen of its own). Every sample is the live component of the
 * app, in both themes and on every width. Registry and guard: features/showcase/registry.ts, test/designSystem.test.ts.
 */
export default function DesignSystemShowcase() {
  const { t } = useI18n();
  const { mode, role } = useStore();
  // the showcase is the company owner's (and the demo's): the Settings row is hidden for others, the address checks too
  if (!canSeeShowcase(mode, role)) return <Redirect href="/settings" />;
  return (
    <Screen title={t("ds.title")} back={() => router.replace("/settings")}>
      <View testID="showcase-intro">
        <T v="caption" tone="mut">{t("ds.intro")}</T>
      </View>
      <Card>
        <View testID="showcase-sections">
          {SCREENS.map((s, i) => (
            <View key={s.id} testID={`showcase-row-${s.id}`}>
              {i ? <Divider /> : null}
              <ListRow
                title={t(s.title)}
                subtitle={`${t(s.hint)} · ${s.ds}`}
                left={<Icon name={s.icon} />}
                onPress={() => router.push(`/settings/design-system/${s.id}`)}
              />
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}
