/**
 * «Ещё → Компания → Модули» (docs/specs/33-gutters-module.md П15.4 C2b; S0b): the add-on modules of a trade, one card
 * each — what it does, the status (icon + word), the price (founder О1: 7 days free, then $30 a month) and one action.
 * Only the director switches them (owner / admin in the database); the office sees the page read-only (spec 26 §3).
 * «Подключить» starts the 7-day trial once (founder О2); after it the button is a payment — step «Оплаты», not here yet.
 * «Отключить» deletes nothing, «Отменить» 5 s (rule 5). Locally at once, offline into the queue (rule 6).
 */
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { allModules, type ModuleDef } from "@/modules/registry";
import { moduleView } from "@/modules/moduleView";
import { Button, StatusChip } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Empty, RowView, Screen } from "@/ui/surfaces";

export default function CompanyModules() {
  const store = useStore();
  const { t, money } = useI18n();
  const toast = useToast();
  const c = store.db.company;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/company"));
  const ro = store.role !== "director";
  if (!c) {
    return (
      <Screen title={t("mod.title")} back={back}>
        <Empty icon="home2" title={t("co.none")} />
      </Screen>
    );
  }
  const saved = (key: Parameters<typeof t>[0]) => (store.online ? t(key) : t("offline.queued"));

  const card = (d: ModuleDef) => {
    const v = moduleView(c.modules?.[d.key]);
    const title = t(d.titleKey);
    return (
      <View key={d.key} testID={`module-${d.key}`}>
        <Card>
          <RowView style={{ alignItems: "flex-start" }}>
            <Icon name="sliders" />
            <View style={{ flex: 1, gap: space[1] }}>
              <T v="heading">{title}</T>
              <T v="caption" tone="mut">{t(d.hintKey)}</T>
            </View>
          </RowView>
          <View testID={`module-${d.key}-status`}>
            <StatusChip status={v.status} label={t(v.label, { n: v.n ?? 0 })} />
          </View>
          <T v="caption" tone="mut">{t("mod.price", { days: d.trialDays, price: money(d.priceCentsMonthly) })}</T>
          {v.locked ? <T v="caption">{t("mod.lockedHint")}</T> : null}
          {/* the module's own card is its «settings» place: its tools that save nothing show for everyone, on or off (spec 33 П20.3) */}
          {(d.places?.settings?.({ role: store.role }) ?? []).map((a) => (
            <View key={a.id} testID={`module-${d.key}-${a.id}`}>
              <Button label={t(a.labelKey)} icon={a.icon} variant="secondary" onPress={() => router.push(a.href as never)} />
            </View>
          ))}
          {ro ? null : (
            <View style={{ gap: space[2] }}>
              {v.main === "start" || v.main === "resume" ? (
                <View testID={`module-${d.key}-enable`}>
                  <Button
                    label={v.main === "start" ? t("mod.start", { days: d.trialDays }) : t("mod.resume")}
                    icon="check"
                    onPress={() => toast.show(saved(v.main === "start" ? "mod.started" : "mod.resumed"), store.enableModule(d.key))}
                  />
                </View>
              ) : null}
              {v.main === "pay" ? (
                <View testID={`module-${d.key}-pay`} style={{ gap: space[1] }}>
                  <Button label={t("mod.pay")} icon="wallet" disabled onPress={() => {}} />
                  <T v="caption" tone="mut">{t("mod.paySoon")}</T>
                </View>
              ) : null}
              {v.canDisable ? (
                <View testID={`module-${d.key}-disable`}>
                  <Button label={t("mod.disable")} variant="secondary" onPress={() => toast.show(saved("mod.disabled"), store.disableModule(d.key))} />
                </View>
              ) : null}
            </View>
          )}
        </Card>
      </View>
    );
  };

  return (
    <Screen title={t("mod.title")} back={back} subtitle={t("schs.who")}>
      {ro ? <StatusChip status="info" label={t("fix.co.readOnly")} soft /> : null}
      <T v="caption" tone="mut">{t("mod.intro")}</T>
      {allModules().map(card)}
    </Screen>
  );
}
