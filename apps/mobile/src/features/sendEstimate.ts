/**
 * Sending an estimate: a link to the client page (/p/<token>) by SMS / email from the phone, copy or share.
 * Automatic sending (Twilio / email service) comes later; the link and the page are the same.
 */
import { Linking, Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { WEB_APP_URL } from "@/config/backend";
import { tFor, type DocLang } from "@/i18n/translate";
import { docMoney } from "./docPdf";
import { mailtoHref, smsHref } from "./contactLinks";
import { canServe } from "./clients";
import { exemptDoc } from "./estimateDoc";
import type { DB, Estimate, EstimateDoc } from "@/data/types";

export function clientLink(token: string): string {
  const origin = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : WEB_APP_URL;
  return `${origin}/p/${token}`;
}

/** The number and the address come from outside (web forms, marketplaces): links only through contactLinks (security-check). */
export async function openSms(phone: string, body: string) {
  const href = smsHref(phone, body, Platform.OS);
  if (href) await Linking.openURL(href);
}

export async function openEmail(email: string, subject: string, body: string) {
  const href = mailtoHref(email, { subject, body });
  if (href) await Linking.openURL(href);
}

export async function copyText(s: string) {
  await Clipboard.setStringAsync(s);
}

export async function shareText(message: string, url: string) {
  if (Platform.OS === "web" && typeof navigator !== "undefined" && "share" in navigator) {
    await (navigator as Navigator).share({ text: message, url }).catch(() => {});
    return;
  }
  await Share.share(Platform.OS === "ios" ? { message, url } : { message });
}

/**
 * The SMS / email text to the client — in the CLIENT's language (rule 7), never the app's.
 * Company and client names go as typed; the amount in $.
 */
export function estimateMessage(lang: DocLang, m: { company: string; name: string; totalCents: number; number?: string; link: string }): { text: string; subject: string } {
  const t = tFor(lang);
  return {
    text: t("ue.sendText", { company: m.company, name: m.name, total: docMoney(m.totalCents), link: m.link }),
    subject: t("ue.sendSubject", { number: m.number ?? "", company: m.company }),
  };
}

/**
 * The signed contract to the client's email (founder 05.11: automatically when the client has an email).
 * The one place where sending is wired: step «Почта П1» (Resend, a platform key set once by the operator) replaces the body.
 * Until then it sends nothing anywhere and says so honestly.
 */
export async function sendSignedCopy(_estimateId: string): Promise<{ sent: false; reason: "mail_not_connected" }> {
  return { sent: false, reason: "mail_not_connected" };
}

/**
 * Before «Отправить» (docs/specs/04 §12):
 * - a «do not service» client gets nothing new — not even an old draft (the server refuses too, db T44);
 * - a draft saved WITH tax for a client who became «Без налога» later is saved again without tax first, otherwise the
 *   server refuses to lock the taxed version (22023) and the send is dropped from the queue (wave 4a, exemptDoc).
 * Only a draft is re-saved: a sent version is locked and never changes.
 */
export type BeforeSend = { ok: false; reason: "no_service" } | { ok: true; resave?: EstimateDoc };
export function beforeSend(db: Pick<DB, "customers">, e: Pick<Estimate, "customerId" | "status" | "doc">): BeforeSend {
  if (!canServe(db, e.customerId)) return { ok: false, reason: "no_service" };
  if (e.status !== "draft" || !e.doc) return { ok: true };
  const c = db.customers.find((x) => x.id === e.customerId);
  const doc = exemptDoc(e.doc, c?.taxExempt);
  return doc === e.doc ? { ok: true } : { ok: true, resave: doc };
}
