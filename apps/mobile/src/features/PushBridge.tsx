/**
 * Mounted once in the root layout (docs/specs/27-push.md §5), inside the auth and i18n providers. Renders nothing.
 * 1) A tap on a push opens its record (`data.route`, only our own screens — safeRoute); a tap that started the app too,
 *    once the navigator, the session and the store are ready (routeNow); not signed in — after the sign-in.
 * 2) While someone is signed in and turned pushes on here: the token is registered again on start, on return to the
 *    foreground and on a language change (the language of the push texts is the interface language of this phone).
 * 3) Spec 42 S27 (#1673): a push from another of the person's companies switches there first (only to a company among the
 *    confirmed memberships — pushTarget), then opens the record. A switch mounts the app again (the store's cache key):
 *    the route waits in `carried` (outside React) and opens after the remount.
 * On the web and in Expo Go it does nothing.
 */
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { router, useRootNavigationState } from "expo-router";
import { useAuth } from "@/cloud/auth";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { companyOf, pushTarget, refresh, routeNow, safeRoute } from "./push";

type Tapped = { route: string; company: string | null };
/** a push's screen across the remount a company switch makes (this component mounts again, its state is gone); the
 *  person's own — another person signed in meanwhile never gets it */
let carried: (Tapped & { uid: string }) | null = null;
import { appVersion, nativePushDeps, notifications } from "./pushNative";

export function PushBridge() {
  const auth = useAuth();
  const { session, ready: authReady } = auth;
  const { loading } = useStore();
  const { lang } = useI18n();
  const navReady = !!useRootNavigationState()?.key;
  const uid = session?.user?.id;
  // the tapped push's screen, kept until it can open (routeNow)
  const [pending, setPending] = useState<Tapped | null>(() => {
    const c = carried;
    carried = null;
    return c && c.uid === auth.session?.user?.id ? { route: c.route, company: null } : null;
  });

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

  // the push's company is decided only on confirmed memberships (a cold start reads them first)
  const confirmed = !!uid && auth.membershipsFor === uid;
  useEffect(() => {
    if (routeNow({ route: pending?.route ?? null, navReady, authReady, signedIn: !!uid, storeReady: !loading }) !== "open" || !pending) return;
    // only a push of another company waits for the confirmed memberships (offline, its own company's opens as before)
    if (pending.company && pending.company !== auth.company?.companyId && !confirmed) return;
    setPending(null);
    const to = pushTarget({ route: pending.route, company: pending.company, active: auth.company?.companyId ?? null, companies: auth.memberships.map((m) => m.companyId) });
    if (to.kind === "switch") {
      carried = uid ? { route: to.route, company: null, uid } : null;
      if (auth.switchCompany(to.company, { why: "push" })) return;
      carried = null;
      return void router.push("/notifications" as never);
    }
    router.push(to.route as never);
  }, [pending, navReady, authReady, uid, loading, confirmed, auth]);

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

function listen(n: NonNullable<ReturnType<typeof notifications>>, keep: (t: Tapped) => void): () => void {
  // a push that comes while the app is open is shown as a banner too (the bell has it as well)
  n.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  const open = (data: unknown) => {
    const to = safeRoute(data);
    if (to) keep({ route: to, company: companyOf(data) });
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
