import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { font, radius, space } from "@octo/design-tokens";
import { useI18n, type DictKey } from "@/i18n";
import { startOnlinePay } from "@/cloud/portal";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet } from "@/ui/overlays";
import { RowView } from "@/ui/surfaces";
import { loadStripeJs, type StripeLike } from "./stripeJs";

export type OnlineOutcome = "succeeded" | "processing";
type Phase = "loading" | "ready" | "paying" | "error";

/** the edge function's / Stripe's refusal → the client's words (never Stripe's or the database's English text) */
const ERR: Record<string, DictKey> = {
  not_connected: "pay.online.err.unavailable",
  not_configured: "pay.online.err.unavailable",
  live_refused: "pay.online.err.unavailable",
  closed: "pay.online.err.closed",
  not_found: "pay.online.err.closed",
  nothing_to_pay: "pay.online.err.nothing",
  retry_later: "pay.online.err.retry",
};

/**
 * Step 20в (docs/specs/35-stripe.md): the real Stripe Payment Element on /p/, in place of SimulatedCheckout when the company's
 * Stripe takes charges. Web only (the client's browser). The card or bank details go from the client's browser straight to Stripe
 * (js.stripe.com) — never through our server or this code. ACH comes first from $1,000 (the order comes from stripe-pay).
 * Nothing is recorded here: the payment appears when Stripe's webhook reaches the server (20г).
 */
export function StripeCheckout({
  visible,
  token,
  invoiceId,
  title,
  amountCents,
  onClose,
  onDone,
}: {
  visible: boolean;
  token: string;
  invoiceId: string | null;
  title: string;
  amountCents: number;
  onClose: () => void;
  onDone: (o: OnlineOutcome) => void;
}) {
  const { t, money, lang } = useI18n();
  const { c, name } = useTheme();
  const host = useRef<HTMLElement | null>(null);   // on the web a View is a <div>
  const session = useRef<{ stripe: StripeLike; elements: ReturnType<StripeLike["elements"]> } | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [err, setErr] = useState<string | null>(null);
  const [amount, setAmount] = useState(amountCents);

  useEffect(() => {
    if (!visible || !invoiceId || Platform.OS !== "web") return;
    let gone = false;
    setPhase("loading");
    setErr(null);
    session.current = null;
    (async () => {
      const r = await startOnlinePay(token, invoiceId);
      if (gone) return;
      if (r.state === "processing") return onDone("processing");
      if (r.state === "error") {
        setErr(t(ERR[r.error] ?? "pay.online.err.retry"));
        return setPhase("error");
      }
      const stripe = await loadStripeJs(r.publishableKey, { stripeAccount: r.account, locale: lang }).catch(() => null);
      if (gone) return;
      if (!stripe) {
        setErr(t("pay.online.err.retry"));
        return setPhase("error");
      }
      const elements = stripe.elements({
        clientSecret: r.clientSecret,
        // the form looks like the page: the theme, its ink and radius (rule 1 — token values only)
        appearance: {
          theme: name === "dark" ? "night" : "stripe",
          variables: { colorPrimary: c.ink, colorText: c.ink, colorBackground: c.bg, colorDanger: c.status.bad.fill, borderRadius: `${radius.field}px`, fontFamily: font.family },
        },
      });
      const el = elements.create("payment", { layout: "tabs", paymentMethodOrder: r.methods });
      const node = host.current;
      if (!node) return;
      el.mount(node);
      session.current = { stripe, elements };
      setAmount(r.amountCents || amountCents);
      setPhase("ready");
    })();
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, invoiceId, token]);

  const pay = async () => {
    const s = session.current;
    if (!s) return;
    setPhase("paying");
    setErr(null);
    const r = await s.stripe
      .confirmPayment({ elements: s.elements, redirect: "if_required", confirmParams: { return_url: window.location.href.split("?")[0] + "?paid=1" } })
      .catch(() => ({ error: { message: undefined } }) as const);
    if ("error" in r && r.error) {
      // Stripe's message is for the client and already in their language (locale); without one — ours
      setErr(r.error.message ?? t("pay.online.err.retry"));
      return setPhase("ready");
    }
    const st = "paymentIntent" in r ? r.paymentIntent?.status : undefined;
    onDone(st === "succeeded" ? "succeeded" : "processing");
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t("pay.online.title")}>
      <View style={{ gap: space[3] }}>
        <StatusChip status="warn" label={t("pay.testMode")} />
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="body" tone="mut">
            {title}
          </T>
          <T v="title" tabular>
            {money(amount)}
          </T>
        </RowView>
        {Platform.OS !== "web" ? (
          <T v="body">{t("pay.online.webOnly")}</T>
        ) : (
          <>
            {phase === "loading" ? (
              <View testID="stripe-loading">
                <T v="caption" tone="mut">
                  {t("pay.online.loading")}
                </T>
              </View>
            ) : null}
            {/* the Payment Element is mounted here (an iframe of js.stripe.com) */}
            <View ref={host as never} testID="stripe-payment-element" style={{ minHeight: phase === "error" ? 0 : space[8] }} />
            {err ? (
              <View testID="stripe-error">
                <T v="body" tone="bad">
                  {err}
                </T>
              </View>
            ) : null}
            <T v="caption" tone="mut">
              {t("pay.online.secure")}
            </T>
            <View testID="stripe-pay">
              <Button label={t("pay.payAmount", { amount: money(amount) })} icon="check" full disabled={phase !== "ready"} onPress={pay} />
            </View>
          </>
        )}
      </View>
    </Sheet>
  );
}
