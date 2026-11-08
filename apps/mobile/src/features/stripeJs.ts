/**
 * The one door to Stripe.js (step 20в): @stripe/stripe-js loads https://js.stripe.com/v3 — the only place the client's card or
 * bank details are typed (an iframe of Stripe). Only what the Payment Element on /p/ needs, typed narrowly, so the rest of
 * the app never depends on the package and e2e can stand in for js.stripe.com (spec 183).
 */
export interface PaymentElementLike {
  mount: (node: HTMLElement) => void;
}
export interface ElementsLike {
  create: (kind: "payment", opts: { layout: "tabs"; paymentMethodOrder: string[] }) => PaymentElementLike;
}
export type ConfirmResult = { error: { message?: string } } | { error?: undefined; paymentIntent?: { status: string } };
export interface StripeLike {
  elements: (opts: { clientSecret: string; appearance: Record<string, unknown> }) => ElementsLike;
  confirmPayment: (opts: { elements: ElementsLike; redirect: "if_required"; confirmParams: { return_url: string } }) => Promise<ConfirmResult>;
}

/** Stripe.js for the contractor's account (a direct charge) in the client's language; null — Stripe.js did not load */
export async function loadStripeJs(publishableKey: string, o: { stripeAccount: string; locale: string }): Promise<StripeLike | null> {
  const { loadStripe } = await import("@stripe/stripe-js");
  const s = await loadStripe(publishableKey, { stripeAccount: o.stripeAccount, locale: o.locale as "en" });
  return s as unknown as StripeLike | null;
}
