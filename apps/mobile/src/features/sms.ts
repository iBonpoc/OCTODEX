import { Platform } from "react-native";

/** Messages with a prefilled text (iOS uses "&body=", Android "?body="). */
export function smsWithBody(phone: string, body: string) {
  return `sms:${phone.replace(/[^\d+]/g, "")}${Platform.OS === "ios" ? "&" : "?"}body=${encodeURIComponent(body)}`;
}
