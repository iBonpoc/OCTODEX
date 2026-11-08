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
  const { db, role } = useStore();
  // spec 26 §3 (07.11): the office sees the company settings, only the director changes them
  const ro = role !== "director";
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
  const p = setupProgress(c, db.serviceCategories);
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
        {p.next && !ro ? <Button label={t("co.continue")} icon="chevronRight" onPress={() => router.push(`/company/${p.next}?wizard=1`)} /> : null}
        {ro ? <StatusChip status="info" label={t("fix.co.readOnly")} soft /> : null}
      </Card>
      <View style={{ gap: space[2] }}>
        {SETUP_STEPS.map((s) => {
          const done = stepDone(c, s, db.serviceCategories);
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
      {/* not a setup step (the «N of 8» count stays): working hours, lengths, window, «late» (П4a) */}
      <Card onPress={() => router.push("/company/schedule")} accessibilityLabel={t("schs.title")}>
        <RowView style={{ alignItems: "flex-start" }}>
          <Icon name="calendar" />
          <View style={{ flex: 1, gap: space[1] }}>
            <T v="body" w="semibold">
              {t("schs.title")}
            </T>
            <T v="caption" tone="mut">
              {t("schs.hint")}
            </T>
          </View>
        </RowView>
      </Card>
      {/* not a setup step: checklist templates and photo rules of a visit (docs/specs/08 §6, CH2) */}
      <View testID="company-checklists">
        <Card onPress={() => router.push("/company/checklists")} accessibilityLabel={t("chk2.title")}>
          <RowView style={{ alignItems: "flex-start" }}>
            <Icon name="checklist" />
            <View style={{ flex: 1, gap: space[1] }}>
              <T v="body" w="semibold">
                {t("chk2.title")}
              </T>
              <T v="caption" tone="mut">
                {t("chk2.hint")}
              </T>
            </View>
          </RowView>
        </Card>
      </View>
      {/* E3 (docs/specs/07 §6, §11): estimate templates — a link only; the screen is the estimates' */}
      <View testID="company-estimate-templates">
        <Card onPress={() => router.push("/estimate/templates")} accessibilityLabel={t("est.tpl.title")}>
          <RowView style={{ alignItems: "flex-start" }}>
            <Icon name="copy" />
            <View style={{ flex: 1, gap: space[1] }}>
              <T v="body" w="semibold">
                {t("est.tpl.title")}
              </T>
              <T v="caption" tone="mut">
                {t("est.tpl.hint")}
              </T>
            </View>
          </RowView>
        </Card>
      </View>
      {/* not a setup step either: whom new leads go to (docs/14-leads-spec.md §6.4) */}
      <View testID="company-leads">
        <Card onPress={() => router.push("/company/leads")} accessibilityLabel={t("co.leads.title")}>
          <RowView style={{ alignItems: "flex-start" }}>
            <Icon name="user" />
            <View style={{ flex: 1, gap: space[1] }}>
              <T v="body" w="semibold">
                {t("co.leads.title")}
              </T>
              <T v="caption" tone="mut">
                {t("co.leads.hint")}
              </T>
            </View>
          </RowView>
        </Card>
      </View>
      {/* online payments (docs/specs/35, 20b): the company's own Stripe account */}
      <View testID="company-payments">
        <Card onPress={() => router.push("/company/payments")} accessibilityLabel={t("opay.title")}>
          <RowView style={{ alignItems: "flex-start" }}>
            <Icon name="dollar" />
            <View style={{ flex: 1, gap: space[1] }}>
              <T v="body" w="semibold">
                {t("opay.title")}
              </T>
              <T v="caption" tone="mut">
                {t("opay.entryHint")}
              </T>
            </View>
          </RowView>
        </Card>
      </View>
      {/* add-on modules (docs/specs/33 П15): «Подключить», the trial */}
      <View testID="company-modules">
        <Card onPress={() => router.push("/company/modules")} accessibilityLabel={t("mod.title")}>
          <RowView style={{ alignItems: "flex-start" }}>
            <Icon name="sliders" />
            <View style={{ flex: 1, gap: space[1] }}>
              <T v="body" w="semibold">
                {t("mod.title")}
              </T>
              <T v="caption" tone="mut">
                {t("mod.hint")}
              </T>
            </View>
          </RowView>
        </Card>
      </View>
    </Screen>
  );
}
