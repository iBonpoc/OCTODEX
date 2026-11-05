import { Platform } from "react-native";
import { smsHref } from "@/features/contactLinks";

/** Messages with a prefilled text (iOS uses "&body=", Android "?body="). */
export function smsWithBody(phone: string, body: string) {
  return smsHref(phone, body, Platform.OS) ?? "";
}
