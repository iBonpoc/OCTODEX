/**
 * «Ещё → Компания → Онлайн-оплата» (step 20b, docs/specs/35-stripe.md): the company connects its own Stripe account so
 * clients can pay invoices and deposits on /p/ by card or bank (ACH). Test mode only for now.
 * Cloud only and online: Stripe makes the account and its form (like «Приём заявок»). Only the OWNER connects and continues
 * Stripe's form — the account and its payouts belong to whoever fills it (security-check 20b №1); an admin and the office
 * read the state. The top line says in words what works.
 */
import { useCallback, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useAuth } from "@/cloud/auth";
import { useI18n, type DictKey } from "@/i18n";
import { callConnect, readOnlinePay } from "@/cloud/stripeConnect";
import { action, fromAnswer, readiness, READINESS_TONE, type OnlinePayState } from "@/features/onlinePay";
import { Button, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, CardList, Empty, ListRow, Screen } from "@/ui/surfaces";

export default function CompanyPayments() {
  const store = useStore();
  const auth = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/company"));
  const cloud = store.mode === "cloud";
  const companyId = auth.company?.companyId;
  const owner = auth.company?.role === "owner";
  const [state, setState] = useState<OnlinePayState | null | undefined | "unknown" | "notSet">(undefined);
  const [busy, setBusy] = useState(false);
  const latch = useRef(false);

  const load = useCallback(async () => {
    if (!cloud || !companyId) return;
    if (owner && store.online) {
      // the owner asks Stripe itself: the state after its form is fresh, not what the server heard last
      const r = await callConnect("status", companyId);
      const a = fromAnswer(r.status, r.body);
      if (a.state !== "unknown") return setState(a.state);
    }
    try {
      setState(await readOnlinePay(companyId));
    } catch {
      setState("unknown");
    }
  }, [cloud, companyId, owner, store.online]);
  // back from Stripe's form (another tab or the browser): read again
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!cloud || !companyId) {
    return (
      <Screen title={t("opay.title")} back={back}>
        <View testID="opay-cloud-only">
          <Empty icon="dollar" title={t("opay.cloudOnly")} hint={t("opay.cloudOnlyHint")} />
        </View>
      </Screen>
    );
  }
  const ready = readiness(state);
  const next = owner ? action(ready) : null;
  const s = state && typeof state === "object" ? state : null;
  const start = async () => {
    if (!store.online) return toast.show(t("opay.needOnline"));
    if (latch.current) return; // a double tap runs once
    latch.current = true;
    setBusy(true);
    try {
      const r = await callConnect("start", companyId);
      const a = fromAnswer(r.status, r.body);
      if (a.state === "notSet") setState("notSet");
      if (!a.url) return toast.show(t("opay.failed"));
      await Linking.openURL(a.url);
    } catch {
      toast.show(t("opay.failed"));
    } finally {
      latch.current = false;
      setBusy(false);
    }
  };

  return (
    <Screen title={t("opay.title")} back={back} help={t("opay.help")}>
      <CardList>
        <Card>
          <View testID={`opay-readiness-${ready}`} style={{ gap: space[2] }}>
            <StatusChip status={READINESS_TONE[ready]} label={t(`opay.ready.${ready}` as DictKey)} />
            <T v="caption" tone="mut">{t(`opay.readyHint.${ready}` as DictKey)}</T>
            {s && !s.livemode ? <StatusChip status="info" label={t("opay.testMode")} soft /> : null}
          </View>
          {next ? (
            <View testID="opay-action">
              <Button label={t(next === "connect" ? "opay.connect" : "opay.continue")} icon="chevronRight" disabled={busy} onPress={start} />
            </View>
          ) : null}
          {!owner ? <StatusChip status="info" label={t("opay.readOnly")} soft /> : null}
        </Card>
        {s ? (
          <Card>
            <View testID="opay-facts">
              <ListRow title={t("opay.charges")} right={<StatusChip status={s.chargesEnabled ? "ok" : "warn"} label={t(s.chargesEnabled ? "opay.yes" : "opay.notYet")} />} />
              <ListRow title={t("opay.payouts")} right={<StatusChip status={s.payoutsEnabled ? "ok" : "warn"} label={t(s.payoutsEnabled ? "opay.yes" : "opay.notYet")} />} />
              {s.requirementsDue > 0 ? <ListRow title={t("opay.due", { n: s.requirementsDue })} subtitle={t("opay.dueHint")} /> : null}
            </View>
          </Card>
        ) : null}
        <Card>
          <T v="caption" tone="mut">{t("opay.how")}</T>
          <Button label={t("opay.refresh")} variant="secondary" size="sm" disabled={busy} onPress={() => load()} />
        </Card>
      </CardList>
    </Screen>
  );
}
