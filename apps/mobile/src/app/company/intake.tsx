/**
 * «Ещё → Компания → Лиды → Приём заявок» (step 16, docs/specs/34-lead-intake.md §3в, PR 3): the company's request form
 * (a link for its site, Google Business Profile, Facebook, a QR) and a key for Zapier / Make; the journal of requests and
 * «Принять / Отклонить» for the held ones. Cloud only and online: the server makes links and keys (like «Команда»).
 * The director changes the ways in (owner / admin); the office reads the journal and decides held requests (T112).
 * The top line says in words whether the form takes requests — never silently «on» without INTAKE_IP_SECRET (director 08.11).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useAuth } from "@/cloud/auth";
import { useI18n, type DictKey } from "@/i18n";
import { WEB_APP_URL } from "@/config/backend";
import { fetchIntakeStatus } from "@/cloud/intake";
import { createEndpoint, decideEvent, listEndpoints, listEvents, rotateEndpoint, setEndpoint } from "@/cloud/intakeSettings";
import { formLink, heldFirst, readiness, READINESS_TONE, siteSnippet, type IntakeEndpoint, type IntakeEvent } from "@/features/intakeSettings";
import { copyText, shareText } from "@/features/sendEstimate";
import { Button, ChoiceChips, ReadOnly, StatusChip, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, CardList, Empty, Screen, SectionTitle } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";

export default function CompanyIntake() {
  const store = useStore();
  const auth = useAuth();
  const { t, day, time } = useI18n();
  const toast = useToast();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/company/leads"));
  const cloud = store.mode === "cloud";
  const companyId = auth.company?.companyId;
  const director = store.role === "director";
  const [eps, setEps] = useState<IntakeEndpoint[] | null>(null);
  const [events, setEvents] = useState<IntakeEvent[]>([]);
  const [status, setStatus] = useState<{ ipSecret: boolean } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [sourceId, setSourceId] = useState<string>("");
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [ask, setAsk] = useState<IntakeEndpoint | null>(null);
  const [held, setHeld] = useState<IntakeEvent | null>(null);
  // always the production site: a link made on a PR preview would die with the preview (security-check #422 №1)
  const origin = WEB_APP_URL;
  const latch = useRef(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    if (!cloud || !companyId) return;
    fetchIntakeStatus().then(setStatus).catch(() => setStatus(null));
    try {
      const [e, ev] = await Promise.all([director ? listEndpoints(companyId) : Promise.resolve([]), listEvents(companyId)]);
      setEps(e);
      setEvents(ev);
      setLoadFailed(false);
    } catch {
      // never offer «Создать» on a failed read: a second form / key would be made (review #422 №1)
      setLoadFailed(true);
    }
  }, [cloud, companyId, director]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [load]);

  if (!cloud || !companyId) {
    return (
      <Screen title={t("intake.set.title")} back={back}>
        <View testID="intake-cloud-only">
          <Empty icon="inbox" title={t("intake.set.cloudOnly")} hint={t("intake.set.cloudOnlyHint")} />
        </View>
      </Screen>
    );
  }
  const sources = store.db.sources.filter((s) => s.active !== false);
  const form = eps?.find((e) => e.kind === "form");
  const hook = eps?.find((e) => e.kind === "webhook");
  const ready = readiness(status, form, director);
  const link = form?.publicToken ? formLink(origin, form.publicToken) : "";
  const run = async (fn: () => Promise<void>, done?: string) => {
    if (!store.online) return toast.show(t("intake.set.needOnline"));
    if (latch.current) return; // a double tap runs once (review #422 №3)
    latch.current = true;
    setBusy(true);
    try {
      await fn();
      await load();
      if (done) toast.show(done);
    } catch {
      toast.show(t("intake.set.failed"));
    } finally {
      latch.current = false;
      setBusy(false);
    }
  };
  const pickSource = sourceId || sources[0]?.id || "";

  return (
    <Screen title={t("intake.set.title")} back={back}>
      <CardList>
        <Card>
          <View testID="intake-readiness" style={{ gap: space[2] }}>
            <StatusChip status={READINESS_TONE[ready]} label={t(`intake.set.ready.${ready}` as DictKey)} />
            <T v="caption" tone="mut">{t(`intake.set.readyHint.${ready}` as DictKey)}</T>
          </View>
        </Card>

        {director && (eps === null || loadFailed) ? (
          <Card>
            <View testID="intake-loading">
              {loadFailed ? (
                <Empty icon="alert" title={t("intake.set.loadFailed")} action={<Button label={t("intake.retry")} variant="secondary" onPress={() => load()} />} />
              ) : (
                <Empty icon="clock" title={t("portal.loading")} />
              )}
            </View>
          </Card>
        ) : null}
        {director && eps !== null && !loadFailed ? (
          <>
            <SectionTitle title={t("intake.set.form")} />
            <Card>
              {form ? (
                <View testID="intake-form-card" style={{ gap: space[3] }}>
                  <T v="body" numberOfLines={2}>{link}</T>
                  <ReadOnly value={busy}>
                    <Toggle label={t("intake.set.enabled")} on={form.enabled} onChange={(on) => run(() => setEndpoint(form.id, { enabled: on }))} />
                    <Toggle label={t("intake.set.smsBox")} on={form.smsConsent} onChange={(on) => run(() => setEndpoint(form.id, { smsConsent: on }))} />
                  </ReadOnly>
                  <Button label={t("intake.set.copyLink")} icon="copy" variant="secondary" full onPress={() => copyText(link).then(() => toast.show(t("intake.set.copied")))} />
                  <Button label={t("intake.set.share")} icon="send" variant="secondary" full onPress={() => shareText(t("intake.set.shareText"), link)} />
                  <Button label={t("intake.set.copyCode")} icon="copy" variant="secondary" full
                    onPress={() => copyText(siteSnippet(link, t("intake.title"))).then(() => toast.show(t("intake.set.copied")))} />
                  <T v="caption" tone="mut">{t("intake.set.codeHint")}</T>
                  <Button label={t("intake.set.rotate")} variant="ghost" onPress={() => setAsk(form)} disabled={busy} />
                </View>
              ) : (
                <View testID="intake-form-new" style={{ gap: space[3] }}>
                  <T v="caption" tone="mut">{t("intake.set.formHint")}</T>
                  <T v="caption" tone="mut">{t("intake.set.source")}</T>
                  <ChoiceChips items={sources.map((s) => ({ key: s.id, label: s.name }))} value={pickSource} onChange={setSourceId} />
                  <Button label={t("intake.set.makeForm")} full disabled={busy || !pickSource} onPress={() => run(async () => void (await createEndpoint(companyId, "form", pickSource)))} />
                </View>
              )}
            </Card>

            <SectionTitle title={t("intake.set.hook")} />
            <Card>
              <View testID="intake-hook-card" style={{ gap: space[3] }}>
                <T v="caption" tone="mut">{t("intake.set.hookHint")}</T>
                {hook ? (
                  <>
                    <T v="body">{t("intake.set.keyEnds", { hint: hook.tokenHint })}</T>
                    <ReadOnly value={busy}>
                      <Toggle label={t("intake.set.enabled")} on={hook.enabled} onChange={(on) => run(() => setEndpoint(hook.id, { enabled: on }))} />
                    </ReadOnly>
                    <Button label={t("intake.set.newKey")} variant="ghost" onPress={() => setAsk(hook)} disabled={busy} />
                  </>
                ) : (
                  <Button label={t("intake.set.makeKey")} variant="secondary" full disabled={busy || !pickSource}
                    onPress={() => run(async () => setShownKey((await createEndpoint(companyId, "webhook", pickSource)).token))} />
                )}
              </View>
            </Card>
          </>
        ) : null}

        <SectionTitle title={t("intake.set.journal")} />
        {events.length ? (
          <CardGrid>
            {heldFirst(events).map((e) => (
              <ListCard
                key={e.id}
                density="compact"
                testID={`intake-event-${e.id}`}
                lead={{ kind: "icon", icon: "inbox" }}
                title={e.name || e.phone || e.email || t("intake.set.noName")}
                when={`${day(e.at)} ${time(e.at)}`}
                status={{ tone: e.status === "held" ? "warn" : e.status === "accepted" || e.status === "merged" ? "ok" : "neutral", label: t(`intake.set.st.${e.status}` as DictKey) }}
                onPress={e.status === "held" ? () => setHeld(e) : e.leadId ? () => router.push(`/lead/${e.leadId}`) : undefined}
              />
            ))}
          </CardGrid>
        ) : (
          <T v="caption" tone="mut">{t("intake.set.noEvents")}</T>
        )}
      </CardList>

      {/* closed only by «Готово»: a tap beside it would lose the key for good (security-check #422 №2) */}
      <Sheet visible={!!shownKey} canClose={false} onClose={() => {}} title={t("intake.set.keyTitle")}>
        <View testID="intake-key-sheet" style={{ gap: space[3] }}>
          <T v="caption" tone="mut">{t("intake.set.keyOnce")}</T>
          <T v="body" tabular>{shownKey ?? ""}</T>
          <Button label={t("intake.set.copyKey")} icon="copy" full onPress={() => shownKey && copyText(shownKey).then(() => toast.show(t("intake.set.copied")))} />
          <Button label={t("intake.set.keyDone")} variant="secondary" full onPress={() => setShownKey(null)} />
        </View>
      </Sheet>

      <Sheet visible={!!ask} onClose={() => setAsk(null)} title={ask?.kind === "webhook" ? t("intake.set.newKey") : t("intake.set.rotate")}>
        <View testID="intake-rotate-sheet" style={{ gap: space[3] }}>
          <T v="body">{ask?.kind === "webhook" ? t("intake.set.newKeyAsk") : t("intake.set.rotateAsk")}</T>
          <Button label={ask?.kind === "webhook" ? t("intake.set.newKey") : t("intake.set.rotate")} variant="danger" full disabled={busy}
            onPress={() => {
              const ep = ask;
              setAsk(null);
              if (ep) run(async () => {
                const r = await rotateEndpoint(ep.id);
                if (ep.kind === "webhook") setShownKey(r.token);
              });
            }} />
        </View>
      </Sheet>

      <Sheet visible={!!held} onClose={() => setHeld(null)} title={t("intake.set.heldTitle")}>
        <View testID="intake-held-sheet" style={{ gap: space[3] }}>
          <T v="caption" tone="mut">{t(`intake.set.reason.${held?.reason ?? "other"}` as DictKey)}</T>
          {[held?.name, held?.phone, held?.email, held?.message].filter(Boolean).map((x, i) => <T key={i} v="body">{x}</T>)}
          <Button label={t("intake.set.accept")} full disabled={busy} onPress={() => { const e = held; setHeld(null); if (e) run(async () => void (await decideEvent(e.id, true)), t("intake.set.accepted")); }} />
          <Button label={t("intake.set.reject")} variant="secondary" full disabled={busy} onPress={() => { const e = held; setHeld(null); if (e) run(async () => void (await decideEvent(e.id, false))); }} />
        </View>
      </Sheet>
    </Screen>
  );
}
