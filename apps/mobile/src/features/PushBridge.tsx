/**
 * Mounted once in the root layout (docs/specs/27-push.md §5), inside the auth and i18n providers. Renders nothing.
 * 1) A tap on a push opens its record (`data.route`, only our own screens — safeRoute); a tap that started the app too,
 *    once the navigator, the session and the store are ready (routeNow); not signed in — after the sign-in.
 * 2) While someone is signed in and turned pushes on here: the token is registered again on start, on return to the
 *    foreground and on a language change (the language of the push texts is the interface language of this phone).
 * On the web and in Expo Go it does nothing.
 */
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { router, useRootNavigationState } from "expo-router";
import { useAuth } from "@/cloud/auth";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { refresh, routeNow, safeRoute } from "./push";
import { appVersion, nativePushDeps, notifications } from "./pushNative";

export function PushBridge() {
  const { session, ready: authReady } = useAuth();
  const { loading } = useStore();
  const { lang } = useI18n();
  const navReady = !!useRootNavigationState()?.key;
  const uid = session?.user?.id;
  // the tapped push's screen, kept until it can open (routeNow)
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const n = notifications();
    if (!n) return;
    // a build whose native module is missing or broken: pushes stay off, the app goes on (never a crash)
    try {
      return listen(n, setPending);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    if (routeNow({ route: pending, navReady, authReady, signedIn: !!uid, storeReady: !loading }) !== "open") return;
    setPending(null);
    router.push(pending as never);
  }, [pending, navReady, authReady, uid, loading]);

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

function listen(n: NonNullable<ReturnType<typeof notifications>>, keep: (route: string) => void): () => void {
  // a push that comes while the app is open is shown as a banner too (the bell has it as well)
  n.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  const open = (data: unknown) => {
    const to = safeRoute(data);
    if (to) keep(to);
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
}
