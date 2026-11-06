import { useState } from "react";
import { Platform, View } from "react-native";
import { router } from "expo-router";
import { space, size } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { usePersistentState } from "@/data/persist";
import { setupProgress, stepTitle } from "./companySetup";
import { firstSteps, firstStepsLeft } from "./firstSteps";
import { Button, ProgressBar } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Sheet } from "@/ui/overlays";
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

/** opened from the home screen: the browser shows the app without its bars (docs/specs/12) */
function isStandalone(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return !!nav.standalone || !!window.matchMedia?.("(display-mode: standalone)").matches;
}

/**
 * «Первые шаги» on the owner's Главная (13 §3.11 п.2): профиль компании · первая работа · пригласить команду ·
 * установить на телефон (browser only). Hidden when all done or when the owner hides it (13 §5а).
 */
export function FirstStepsCard() {
  const { db, role } = useStore();
  const { t } = useI18n();
  const [hidden, setHidden] = usePersistentState<boolean>("octo.firstSteps.hidden.v1", false);
  const [howTo, setHowTo] = useState(false);
  const steps = firstSteps(db, role, { web: Platform.OS === "web", standalone: isStandalone() });
  if (hidden || !steps.length || firstStepsLeft(steps) === 0) return null;
  const done = steps.length - firstStepsLeft(steps);
  return (
    <View testID="first-steps">
    <Card>
      <RowView style={{ justifyContent: "space-between" }}>
        <T v="heading">{t("first.title")}</T>
        <Button label={t("first.hide")} size="sm" variant="ghost" onPress={() => setHidden(true)} />
      </RowView>
      <ProgressBar value={done} max={steps.length} label={t("co.progress", { done, total: steps.length })} />
      <View style={{ gap: space[1] }}>
        {steps.map((s) => (
          <View key={s.id} testID={`first-${s.id}`}>
          <RowView style={{ minHeight: size.controlMdPhone }}>
            <Icon name={s.done ? "check" : "chevronRight"} s={size.iconSm} />
            <T v="body" tone={s.done ? "mut" : "ink"} style={{ flex: 1 }}>
              {t(s.label)}
            </T>
            {!s.done ? (
              <Button label={t("first.go")} size="sm" variant="secondary" onPress={() => (s.href ? router.push(s.href) : setHowTo(true))} />
            ) : (
              <T v="caption" tone="mut">
                {t("first.done")}
              </T>
            )}
          </RowView>
          </View>
        ))}
      </View>
      <Sheet visible={howTo} onClose={() => setHowTo(false)} title={t("first.install")}>
        <View style={{ gap: space[2] }}>
          <T v="body">{t("first.install.ios")}</T>
          <T v="body">{t("first.install.android")}</T>
          <T v="caption" tone="mut">
            {t("first.install.note")}
          </T>
        </View>
      </Sheet>
    </Card>
    </View>
  );
}
