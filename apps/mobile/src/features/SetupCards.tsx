/**
 * The setup of a new company on the owner's «Главная» (prototype v2, template OverviewScreen): grouped rows 56 like the rest of the
 * Overview — no accent frames, no progress cards (LAYOUT-RULES §8 п.19: no «hero» cards). «Настройка компании · 3 из 8» — one row,
 * the next step; «Первые шаги · 2 из 4» (13 §3.11 п.2) — a row per step, «Скрыть» the last row (13 §5а). Both go when all is done.
 */
import { useState } from "react";
import { Platform, View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { usePersistentState } from "@/data/persist";
import { setupProgress, stepTitle } from "./companySetup";
import { firstSteps, firstStepsLeft } from "./firstSteps";
import { GroupRow, ListGroup } from "@/ui/groupedList";
import { T } from "@/ui/primitives";
import { Sheet } from "@/ui/overlays";

/** «Настройка компании · 3 из 8» until everything is filled in: one row with the next step, the whole row opens it. */
export function CompanySetupCard() {
  const { db } = useStore();
  const { t } = useI18n();
  const p = setupProgress(db.company, db.serviceCategories);
  if (!db.company || p.done === p.total) return null;
  return (
    <ListGroup title={`${t("co.setupTitle")} · ${t("co.progress", { done: p.done, total: p.total })}`} testID="company-setup">
      <GroupRow
        testID="company-setup-next"
        lead={{ icon: "settings" }}
        title={p.next ? t(stepTitle(p.next)) : t("co.setupTitle")}
        subtitle={p.next ? t("co.continue") : undefined}
        onPress={() => router.push(p.next ? `/company/${p.next}?wizard=1` : "/company")}
      />
    </ListGroup>
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
      <ListGroup title={`${t("first.title")} · ${t("co.progress", { done, total: steps.length })}`}>
        {steps.map((s) => (
          <GroupRow
            key={s.id}
            testID={`first-${s.id}`}
            lead={{ icon: s.done ? "check" : "chevronRight" }}
            title={t(s.label)}
            subtitle={s.done ? t("first.done") : undefined}
            compact
            onPress={s.done ? undefined : () => (s.href ? router.push(s.href) : setHowTo(true))}
          />
        ))}
        <GroupRow testID="first-hide" lead={{ icon: "close" }} title={t("first.hide")} compact onPress={() => setHidden(true)} />
      </ListGroup>
      <Sheet visible={howTo} onClose={() => setHowTo(false)} title={t("first.install")}>
        <View style={{ gap: space[2] }}>
          <T v="body">{t("first.install.ios")}</T>
          <T v="body">{t("first.install.android")}</T>
          <T v="caption" tone="mut">
            {t("first.install.note")}
          </T>
        </View>
      </Sheet>
    </View>
  );
}
