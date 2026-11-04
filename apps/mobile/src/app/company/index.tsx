import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { SETUP_STEPS, setupProgress, stepDone, stepHint, stepIcon, stepTitle } from "@/features/companySetup";
import { Button, StatusChip } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Card, Empty, RowView, Screen } from "@/ui/surfaces";

/** Company profile: 8 sections with a done/not-done chip. Opens a section to edit. */
export default function CompanyScreen() {
  const { db } = useStore();
  const { t } = useI18n();
  const c = db.company;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  if (!c) {
    return (
      <Screen title={t("co.title")} back={back}>
        <Empty icon="home2" title={t("co.none")} />
      </Screen>
    );
  }
  const p = setupProgress(c);
  return (
    <Screen title={t("co.title")} back={back} help={t("co.help")} hintKey="company">
      <Card>
        <RowView style={{ alignItems: "flex-start" }}>
          <View style={{ flex: 1, gap: space[1] }}>
            <T v="title">{c.dba || c.name}</T>
            {c.legalName ? (
              <T v="caption" tone="mut">
                {c.legalName}
              </T>
            ) : null}
          </View>
          <StatusChip status={p.done === p.total ? "ok" : "warn"} label={t("co.progress", { done: p.done, total: p.total })} />
        </RowView>
        {p.next ? <Button label={t("co.continue")} icon="chevronRight" onPress={() => router.push(`/company/${p.next}?wizard=1`)} /> : null}
      </Card>
      <View style={{ gap: space[2] }}>
        {SETUP_STEPS.map((s) => {
          const done = stepDone(c, s);
          return (
            <Card key={s} onPress={() => router.push(`/company/${s}`)} accessibilityLabel={t(stepTitle(s))}>
              <RowView style={{ alignItems: "flex-start" }}>
                <Icon name={stepIcon[s]} />
                <View style={{ flex: 1, gap: space[1] }}>
                  <T v="body" w="semibold">
                    {t(stepTitle(s))}
                  </T>
                  <T v="caption" tone="mut">
                    {t(stepHint(s))}
                  </T>
                </View>
                <StatusChip status={done ? "ok" : c.skipped.includes(s) ? "neutral" : "warn"} label={done ? t("co.done") : c.skipped.includes(s) ? t("co.skipped") : t("co.todo")} />
              </RowView>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
