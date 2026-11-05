import { View } from "react-native";
import { router } from "expo-router";
import { space, size } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { setupProgress, stepTitle } from "./companySetup";
import { Button, ProgressBar } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Card, RowView } from "@/ui/surfaces";

/** "Company setup 3 of 8" on Today until everything is filled in. */
export function CompanySetupCard() {
  const { db } = useStore();
  const { t } = useI18n();
  const p = setupProgress(db.company, db.serviceCategories);
  if (!db.company || p.done === p.total) return null;
  return (
    <Card status="warn" onPress={() => router.push("/company")} accessibilityLabel={t("co.setupTitle")}>
      <RowView style={{ justifyContent: "space-between" }}>
        <T v="heading">{t("co.setupTitle")}</T>
      </RowView>
      <ProgressBar value={p.done} max={p.total} label={t("co.progress", { done: p.done, total: p.total })} />
      {p.next ? (
        <T v="caption" tone="mut">
          {t("co.nextStep", { step: t(stepTitle(p.next)) })}
        </T>
      ) : null}
      {p.next ? <Button label={t("co.continue")} icon="chevronRight" size="sm" variant="secondary" onPress={() => router.push(`/company/${p.next}?wizard=1`)} /> : null}
    </Card>
  );
}

/** First steps of the core workflow: catalog → lead → estimate sent → signed. Hidden when all done. */
export function FirstStepsCard() {
  const { db } = useStore();
  const { t } = useI18n();
  const steps = [
    { done: db.catalog.length > 0, label: t("first.catalog"), go: () => router.push("/catalog") },
    { done: db.leads.length > 0, label: t("first.lead"), go: () => router.push("/lead/new") },
    { done: db.estimates.some((e) => e.status !== "draft"), label: t("first.estimate"), go: () => router.push("/estimate/new") },
    { done: db.estimates.some((e) => e.status === "approved"), label: t("first.signed"), go: () => router.navigate("/clients") },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <Card>
      <T v="heading">{t("first.title")}</T>
      <View style={{ gap: space[1] }}>
        {steps.map((s, i) => (
          <RowView key={i} style={{ minHeight: size.controlMdPhone }}>
            <Icon name={s.done ? "check" : "chevronRight"} s={size.iconSm} />
            <T v="body" tone={s.done ? "mut" : "ink"} style={{ flex: 1 }}>
              {i + 1}. {s.label}
            </T>
            {!s.done ? <Button label={t("first.go")} size="sm" variant="secondary" onPress={s.go} /> : null}
          </RowView>
        ))}
      </View>
    </Card>
  );
}
