/**
 * Mounted once in the root layout (docs/specs/27-push.md §5), inside the auth and i18n providers. Renders nothing.
 * 1) A tap on a push opens its record (`data.route`, only our own screens — safeRoute); a tap that started the app too.
 * 2) While someone is signed in and turned pushes on here: the token is registered again on start, on return to the
 *    foreground and on a language change (the language of the push texts is the interface language of this phone).
 * On the web and in Expo Go it does nothing.
 */
import { useEffect } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/cloud/auth";
import { useI18n } from "@/i18n";
import { refresh, safeRoute } from "./push";
import { appVersion, nativePushDeps, notifications } from "./pushNative";

export function PushBridge() {
  const { session } = useAuth();
  const { lang } = useI18n();
  const uid = session?.user?.id;

  useEffect(() => {
    const n = notifications();
    if (!n) return;
    // a push that comes while the app is open is shown as a banner too (the bell has it as well)
    n.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    const open = (data: unknown) => {
      const to = safeRoute(data);
      if (to) router.push(to as never);
    };
    const last = n.getLastNotificationResponse();
    if (last) {
      open(last.notification.request.content.data);
      n.clearLastNotificationResponse();
    }
    const sub = n.addNotificationResponseReceivedListener((r) => {
      open(r.notification.request.content.data);
      n.clearLastNotificationResponse();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const d = nativePushDeps();
    if (!d || !uid) return;
    const again = () => void refresh(d, lang, appVersion).catch(() => {});
    again();
    const sub = AppState.addEventListener("change", (s) => s === "active" && again());
    return () => sub.remove();
  }, [uid, lang]);

  return null;
}
