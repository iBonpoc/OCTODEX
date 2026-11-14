import { APP_NAME } from "@/config/product";
import { useEffect, useState } from "react";
import { Image, Platform, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { component, radius, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { I18nOverride, useI18n, type DictKey } from "@/i18n";
import type { DocLang } from "@/i18n/translate";
import type { EstimateDoc } from "@/data/types";
import { acceptPortal, fetchPortal, licenseLine, localPortal, paySimulated, type PortalData } from "@/cloud/portal";
import { SimulatedCheckout } from "@/features/SimulatedCheckout";
import { StripeCheckout, type OnlineOutcome } from "@/features/StripeCheckout";
import { EstimateView } from "@/features/EstimateView";
import { SignBlock } from "@/features/SignBlock";
import { mainOption, optionTotals, withAddons } from "@/features/estimateDoc";
import { estimateFileName, estimateHtml, saveEstimatePdf } from "@/features/estimatePdf";
import { Button, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, CardList, Empty, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { StatusNote } from "@/ui/statusNote";

/**
 * Client page: opened from the SMS / email link in a phone browser, no app and no sign-in.
 * The client chooses an option and add-ons, signs (E-SIGN consent), sees the deposit; the contractor
 * gets a notification and the job appears in the plan. PDF can be saved at any time.
 */
export default function ClientEstimatePage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const store = useStore();
  const { t } = useI18n();
  const local = localPortal(store.db, token ?? "", store.companyName ?? APP_NAME);
  const [remote, setRemote] = useState<PortalData | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (local || !token) return;
    fetchPortal(token)
      .then(setRemote)
      .catch((e) => setError(String(e?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, !!local]);
  const data = local ?? remote;
  const back = router.canGoBack() ? () => router.back() : undefined;

  // E2b: past "valid until" the server answers only who to call — in the client's language
  // …and after the company declined: only who declined and who to call (the server sends nothing else)
  // 7а-3: the company was closed by its owner — first, only its name (docs/specs/22 §3.5)
  if (data && (data.status === "closed" || data.status === "expired" || data.status === "declined")) {
    return (
      <I18nOverride lang={data.lang}>
        <ExpiredPage data={data} back={back} />
      </I18nOverride>
    );
  }
  if (!data || !data.doc || data.status === "revoked") {
    // rule 7: a revoked link speaks the client's language; with no answer at all (no network) the browser's — never the app's,
    // and never a raw «TypeError: Failed to fetch» (review «Лиды и клиенты» №13)
    return (
      <I18nOverride lang={data?.lang ?? browserLang()}>
        <NoPage loading={data === undefined && !error} failed={!!error} back={back} />
      </I18nOverride>
    );
  }

  // Rule 7: the page, its sheets and toasts speak the client's language, not the app's (or the browser's).
  return (
    <I18nOverride lang={data.lang}>
      <PortalBody data={data} doc={data.doc} token={token!} back={back} setRemote={setRemote} />
    </I18nOverride>
  );
}

/** the client's browser language among the document languages (en / es / ru), en otherwise */
function browserLang(): DocLang {
  const l = (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2).toLowerCase();
  return l === "es" || l === "ru" ? l : "en";
}

/** a failure on the client page in our words: «no connection» or «try again» — never the browser's or the server's text */
function portalFail(t: (k: DictKey) => string, e: unknown): string {
  const m = String((e as Error)?.message ?? e);
  return /fetch|network|timeout|abort/i.test(m) ? t("portal.offline") : t("portal.failed");
}

function NoPage({ loading, failed, back }: { loading: boolean; failed: boolean; back?: () => void }) {
  const { t } = useI18n();
  return (
    <Screen title={t("portal.estimate")} back={back}>
      {loading ? (
        <Empty icon="clock" title={t("portal.loading")} />
      ) : (
        // not found or revoked: the token no longer leads anywhere; no network: say so and how to retry
        <Empty icon="alert" title={failed ? t("portal.offline") : t("est.portal.invalid")} />
      )}
    </Screen>
  );
}

function PortalBody({ data, doc, token, back, setRemote }: { data: PortalData; doc: EstimateDoc; token: string; back?: () => void; setRemote: (d: PortalData | null) => void }) {
  const store = useStore();
  const { t, money, day } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  // 20в: the invoice paid through the real Payment Element, and what Stripe said (the payment itself comes by the webhook)
  const [online, setOnline] = useState<string | null>(null);
  // back from a bank's or 3DS page: Stripe adds redirect_status; «paid» names the invoice (review 20в №2)
  const back3ds = useLocalSearchParams<{ paid?: string; redirect_status?: string }>();
  const [outcome, setOutcome] = useState<Record<string, OnlineOutcome>>({});
  useEffect(() => {
    const id = back3ds.paid;
    if (!id || !data.invoices.some((i) => i.id === id)) return;
    if (back3ds.redirect_status === "succeeded" || back3ds.redirect_status === "processing") {
      setOutcome((m) => ({ ...m, [id]: back3ds.redirect_status === "succeeded" ? "succeeded" : "processing" }));
    }
    router.setParams({ paid: undefined, redirect_status: undefined, payment_intent: undefined, payment_intent_client_secret: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [back3ds.paid, data.invoices.length]);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [addonIds, setAddonIds] = useState<string[]>([]);

  const approved = (data.status === "approved" || data.status === "awaiting_countersign") && data.approval; // E2a: the client has signed
  const chosen = approved ? data.approval!.optionId : optionId ?? mainOption(doc).id;
  const addons = approved ? data.approval!.addonIds : addonIds;
  const base = doc.options.find((o) => o.id === chosen) ?? mainOption(doc);
  const tot = optionTotals(doc, withAddons(base, addons));
  const deposit = approved ? data.approval!.depositCents ?? tot.deposit : tot.deposit;

  const sign = async (name: string, svg: string) => {
    setBusy(true);
    try {
      if (data.source === "local" && data.estimateId) {
        store.approveEstimate(data.estimateId, { optionId: base.id, addonIds: addons, signerName: name, signature: svg, channel: "portal" });
      } else {
        setRemote(await acceptPortal(token, { optionId: base.id, addonIds: addons, signer: name, svg }));
      }
    } catch (e) {
      toast.show(portalFail(t, e));
    } finally {
      setBusy(false);
    }
  };
  const payingInv = data.invoices.find((i) => i.id === paying);
  const paySim = async () => {
    if (!payingInv) return;
    try {
      if (data.source === "local") {
        store.recordPayment(payingInv.id, payingInv.totalCents - payingInv.paidCents, "card", "stripe-simulated", true);
      } else {
        setRemote(await paySimulated(token, payingInv.id));
      }
    } catch (e) {
      toast.show(portalFail(t, e));
    }
  };
  const onlineInv = data.invoices.find((i) => i.id === online);
  const onlineDone = (o: OnlineOutcome) => {
    if (!onlineInv) return;
    setOutcome((m) => ({ ...m, [onlineInv.id]: o }));
    setOnline(null);
    // the webhook may already have recorded it: the page reads the server again (ACH shows as «processing»)
    fetchPortal(token).then((d) => d && setRemote(d)).catch(() => {});
  };
  // the real Payment Element: the company's Stripe takes charges, in the client's browser; the simulation only otherwise
  const canOnline = data.onlinePay && data.source !== "local" && Platform.OS === "web";
  const pdf = () =>
    saveEstimatePdf(estimateHtml(data, { lang: data.lang, choice: { optionId: base.id, addonIds: addons } }), estimateFileName(data)).catch((e) => toast.show(portalFail(t, e)));

  return (
    <Screen
      title={data.company.name || APP_NAME}
      back={back}
      subtitle={[`${t("portal.estimate")}${data.number ? ` ${data.number}` : ""}`, data.sentAt ? day(data.sentAt) : ""].filter(Boolean).join(" · ")}
    >
      {data.source === "local" && back ? (
        <T v="caption" tone="mut">
          {t("portal.preview")}
        </T>
      ) : null}
      <CompanyHeader company={data.company} />
      <Card>
        <T v="caption" tone="mut">
          {t("portal.for")}
        </T>
        <T v="heading">{data.customer.name}</T>
        <T v="body" tone="mut">
          {[data.property.address, data.property.city].filter(Boolean).join(", ")}
        </T>
        {data.title ? <T v="body">{data.title}</T> : null}
      </Card>

      {data.status === "draft" ? (
        <Empty icon="pencil" title={t("portal.draft")} />
      ) : (
        <>
          <EstimateView doc={doc} optionId={base.id} onOption={setOptionId} addonIds={addons} onAddons={setAddonIds} readOnly={!!approved} terms={data.terms} />

          {approved ? (
            <Card status="ok">
              <StatusChip status="ok" label={t("portal.approved")} />
              <T v="body">{t("ue.approvedBy", { name: data.approval!.signerName, date: day(data.approval!.signedAt) })}</T>
              <T v="body" tone="mut">
                {t("portal.thanks", { company: data.company.name || APP_NAME })}
              </T>
              {/* E2b: until the company signs, the client knows where the copy will be */}
              {data.status === "approved" ? (
                <StatusChip status="ok" label={t("est.portal.both")} />
              ) : (
                <T v="body">{t("est.portal.awaiting", { company: data.company.name || APP_NAME })}</T>
              )}
            </Card>
          ) : null}
          {approved && data.invoices.length ? (
            <>
              <SectionTitle title={t("portal.invoices")} />
              <CardList>
                {data.invoices.map((inv) => {
                  const bal = Math.max(0, inv.totalCents - inv.paidCents);
                  // ACH on its way is not money yet, but the client must not be asked for it again
                  const toPay = Math.max(0, bal - inv.pendingCents);
                  const sent = outcome[inv.id];
                  const waiting = bal > 0 && (!!sent || toPay === 0);
                  const tone = bal === 0 ? "ok" : waiting ? "info" : "warn";
                  return (
                    <View key={inv.id} style={{ gap: space[3] }}>
                      <Card status={tone}>
                        <RowView style={{ justifyContent: "space-between" }}>
                          <T v="body" w="semibold" style={{ flex: 1 }}>
                            {[inv.number, inv.title].filter(Boolean).join(" · ")}
                          </T>
                          <StatusChip status={tone} label={bal === 0 ? t("money.paid") : waiting ? t("pay.online.processing") : t("money.awaiting")} />
                        </RowView>
                        <T v="title" tabular>
                          {money(bal === 0 ? inv.totalCents : waiting ? bal : toPay)}
                        </T>
                        {inv.pendingCents > 0 ? (
                          <View testID={`portal-pending-${inv.id}`}>
                            <StatusNote tone="info" v="body">
                              {t("pay.online.pending", { amount: money(inv.pendingCents) })}
                            </StatusNote>
                          </View>
                        ) : null}
                        {sent ? (
                          <T v="caption" tone="mut">
                            {sent === "succeeded" ? t("pay.online.succeeded") : t("pay.online.wait")}
                          </T>
                        ) : waiting ? (
                          <T v="caption" tone="mut">
                            {t("pay.online.processingHint")}
                          </T>
                        ) : null}
                        {toPay > 0 && !sent && canOnline && online !== inv.id ? (
                          <View testID={`portal-pay-online-${inv.id}`}>
                            <Button label={t("pay.online.button")} icon="wallet" full onPress={() => setOnline(inv.id)} />
                          </View>
                        ) : toPay > 0 && !sent && data.onlinePay && Platform.OS !== "web" ? (
                          <T v="caption" tone="mut">
                            {t("pay.online.webOnly")}
                          </T>
                        ) : toPay > 0 && !sent && !data.onlinePay && data.simulatedPay ? (
                          <Button label={t("pay.payByCard")} icon="wallet" full onPress={() => setPaying(inv.id)} />
                        ) : null}
                      </Card>
                      {online === inv.id ? (
                        <StripeCheckout /* ds-allow: a Modal, not a Sheet — the gate and the way out for such Modals are a separate task */
                          visible
                          token={token}
                          invoiceId={inv.id}
                          title={[inv.number, inv.title].filter(Boolean).join(" · ")}
                          amountCents={toPay}
                          onClose={() => setOnline(null)}
                          onDone={onlineDone}
                        />
                      ) : null}
                    </View>
                  );
                })}
              </CardList>
            </>
          ) : approved && deposit > 0 && !data.depositPaid ? (
            <T v="caption" tone="mut">
              {t("portal.payLater")}
            </T>
          ) : null}
          {approved ? (
            <></>
          ) : (
            <>
              <View testID="portal-sign">
                <SectionTitle title={t("portal.sign")} />
              </View>
              <Card>
                <SignBlock onSign={sign} busy={busy} />
              </Card>
            </>
          )}
        </>
      )}
      <View testID="portal-pdf">
        <Button label={data.status === "approved" ? t("est.portal.downloadSigned") : t("portal.pdf")} icon="invoice" variant="secondary" full onPress={pdf} />
      </View>
      <SimulatedCheckout
        visible={!!payingInv}
        amountCents={payingInv ? payingInv.totalCents - payingInv.paidCents : 0}
        title={payingInv ? [payingInv.number, payingInv.title].filter(Boolean).join(" · ") : ""}
        onClose={() => setPaying(null)}
        onPaid={paySim}
      />
      {data.company.phone ? (
        <T v="caption" tone="mut">
          {data.company.name} · {data.company.phone}
        </T>
      ) : null}
    </Screen>
  );
}

/** E2b: expired before the client signed, or declined by the company — only who to call, nothing of the estimate.
 *  7а-3: closed by its owner — only the name (no phone: docs/specs/22 §3.3 q.1). */
function ExpiredPage({ data, back }: { data: PortalData; back?: () => void }) {
  const { t } = useI18n();
  const company = data.company.name || APP_NAME;
  const declined = data.status === "declined";
  const closed = data.status === "closed";
  const status = closed ? "neutral" : declined ? "bad" : "warn";
  const label = closed ? t("fr8.portal.closedChip") : declined ? t("est.portal.declined", { company }) : t("est.portal.expired", { company });
  return (
    <Screen title={company} back={back}>
      <Card status={status}>
        <StatusChip status={status} label={label} />
        {closed ? <T v="body">{t("fr8.portal.closed", { company })}</T> : null}
        {data.company.phone && !closed ? <T v="body">{data.company.phone}</T> : null}
      </Card>
    </Screen>
  );
}

function CompanyHeader({ company }: { company: PortalData["company"] }) {
  const lines = [
    company.address,
    ...company.contacts.map((x) => [[x.name, x.title].filter(Boolean).join(", "), x.phone].filter(Boolean).join(" · ")),
    company.contacts.length ? undefined : company.phone,
    company.email,
    company.website,
    ...company.licenses.map(licenseLine),
  ].filter(Boolean) as string[];
  if (!company.logo && !lines.length) return null;
  return (
    <Card>
      <RowView style={{ alignItems: "flex-start" }}>
        {company.logo ? (
          <Image source={{ uri: company.logo }} style={{ width: component.logo / 2, height: component.logo / 2, borderRadius: radius.tip }} accessibilityLabel={company.name} />
        ) : null}
        <View style={{ flex: 1, gap: space[1] }}>
          {lines.map((l, i) => (
            <T key={i} v="caption" tone="mut">
              {l}
            </T>
          ))}
        </View>
      </RowView>
    </Card>
  );
}
