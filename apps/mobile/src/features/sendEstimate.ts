/**
 * Sending an estimate: a link to the client page (/p/<token>) by SMS / email from the phone, copy or share.
 * Automatic sending (Twilio / email service) comes later; the link and the page are the same.
 */
import { Linking, Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { WEB_APP_URL } from "@/config/backend";

export function clientLink(token: string): string {
  const origin = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : WEB_APP_URL;
  return `${origin}/p/${token}`;
}

export async function openSms(phone: string, body: string) {
  const sep = Platform.OS === "ios" ? "&" : "?";
  await Linking.openURL(`sms:${phone.replace(/[^\d+]/g, "")}${sep}body=${encodeURIComponent(body)}`);
}

export async function openEmail(email: string, subject: string, body: string) {
  await Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
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
