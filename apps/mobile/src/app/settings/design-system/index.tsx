import { View } from "react-native";
import { Redirect, router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Icon, T } from "@/ui/primitives";
import { Card, Divider, ListRow, Screen, SectionTitle } from "@/ui/surfaces";
import { space } from "@octo/design-tokens";
import type { DictKey } from "@/i18n";
import { ShowcaseThemeSwitch } from "@/features/showcase/ThemeSwitch";
import { canSeeShowcase } from "@/features/showcase/access";
import { SCREENS } from "@/features/showcase/registry";
import { useGraphiteFlag } from "@/features/showcase/graphite/flag";
import { ToggleRow } from "@/ui/toggleRow";

/**
 * «Дизайн-система» — the showcase (#1093, founder 11.11–12.11.2026): the first screen is the list of its sections,
 * each section is its own screen (#1150: a list, then a screen of its own). Every sample is the live component of the
 * app, in both themes and on every width. Registry and guard: features/showcase/registry.ts, test/designSystem.test.ts.
 */
/** the two groups of the first screen (#2745): the tokens, then the parts */
const GROUPS: { id: "tokens" | "parts"; title: DictKey }[] = [
  { id: "tokens", title: "ds.group.tokens" },
  { id: "parts", title: "ds.group.parts" },
];

export default function DesignSystemShowcase() {
  const { t } = useI18n();
  const { mode, role } = useStore();
  const [graphite, setGraphite] = useGraphiteFlag();
  // the showcase is the company owner's (and the demo's): the Settings row is hidden for others, the address checks too
  if (!canSeeShowcase(mode, role)) return <Redirect href="/settings" />;
  return (
    <Screen title={t("ds.title")} back={() => router.replace("/settings")}>
      <View testID="showcase-intro">
        <T v="caption" tone="mut">{t("ds.intro")}</T>
      </View>
      <ShowcaseThemeSwitch />
      {/* #2745 (founder 25.11, #2744): the tokens are rows again — a group of their own above the parts made of them */}
      {GROUPS.map((g) => {
        const rows = SCREENS.filter((s) => !s.hidden && (!s.pilot || graphite) && (s.group === "tokens") === (g.id === "tokens"));
        return (
          <View key={g.id} style={{ gap: space[3] }}>
            <SectionTitle title={t(g.title)} />
            <Card>
              <View testID={g.id === "tokens" ? "showcase-sections-tokens" : "showcase-sections"}>
                {rows.map((s, i) => (
                  <View key={s.id} testID={`showcase-row-${s.id}`}>
                    {i ? <Divider /> : null}
                    <ListRow
                      title={t(s.title)}
                      subtitle={`${t(s.hint)} · ${s.ds}`}
                      lines={0}
                      left={<Icon name={s.icon} />}
                      onPress={() => router.push(`/settings/design-system/${s.id}`)}
                    />
                  </View>
                ))}
              </View>
            </Card>
          </View>
        );
      })}
      {/* «Графит» — пилот #2254, не правило: off by default, this device only */}
      <Card>
        <ToggleRow testID="showcase-graphite-flag" label={t("ds.gr.flag")} caption={t("ds.gr.flagHint")} value={graphite} onChange={setGraphite} />
      </Card>
    </Screen>
  );
}
