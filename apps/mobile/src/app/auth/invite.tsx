import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { space } from "@octo/design-tokens";
import { useAuth } from "@/cloud/auth";
import { acceptInvitation } from "@/cloud/team";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { isInviteToken, peekInviteKey, rememberInvite, takeInvite, teamErrorKey } from "@/features/team";
import { LegalAgree } from "@/features/LegalAgree";
import { legalErrorKey } from "@/features/legal";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, Empty, Screen } from "@/ui/surfaces";

/**
 * The invitation link (wave 7-2, S21; 13 §3.13): sign in or create an account with the invited email →
 * join the company with the invited role → Главная of that role. The link waits through sign-in (it is remembered).
 * 7а-1: joining needs the current Terms and Privacy. The consent check runs first (auth.legalChecked); without the
 * consent the tick is shown right here and the link is kept (map-keeper 7а-1: it used to be wiped on any refusal).
 */
export default function AcceptInvite() {
  const { token: param } = useLocalSearchParams<{ token?: string }>();
  const { t } = useI18n();
  const auth = useAuth();
  const store = useStore();
  const [state, setState] = useState<"idle" | "joining" | "error" | "legal">("idle");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);
  const [err, setErr] = useState("");
  const tried = useRef(false);
  const signedIn = !!auth.userId;
  const needsLegal = auth.legal === "first" || auth.legal === "changed";
  useEffect(() => {
    if (!signedIn || !auth.legalChecked || tried.current) return;
    if (needsLegal) return setState("legal");
    tried.current = true;
    (async () => {
      const token = isInviteToken(param) ? param! : await takeInvite(AsyncStorage);
      if (!token) return setState("error"), setErr(t("invite.noLink"));
      setState("joining");
      try {
        await acceptInvitation(token);
        await AsyncStorage.removeItem(peekInviteKey);
        await auth.reloadMemberships();
        router.replace("/");
      } catch (e) {
        const msg = (e as Error).message;
        if (legalErrorKey(msg) === "legal.err.needed") {
          // not a dead link: the consent is missing — keep the link, ask here, then try again
          await rememberInvite(token, AsyncStorage).catch(() => {});
          tried.current = false;
          return setState("legal");
        }
        // a dead link is not kept for the next sign-in (security-check 7-2)
        await AsyncStorage.removeItem(peekInviteKey).catch(() => {});
        setState("error");
        setErr(t(legalErrorKey(msg) ?? teamErrorKey(msg)));
      }
    })();
  }, [signedIn, param, auth, t, needsLegal, round]);
  const agreeAndJoin = async () => {
    setBusy(true);
    const e = await auth.agree();
    setBusy(false);
    if (e) return setErr(t(legalErrorKey(e) ?? "legal.err.network"));
    setErr("");
    tried.current = false;
    setState("idle");
    setRound((r) => r + 1);
  };
  const signIn = async () => {
    if (isInviteToken(param)) await rememberInvite(param!, AsyncStorage);
    router.push("/auth/sign-in?next=invite");
  };
  if (!isInviteToken(param) && !signedIn)
    return (
      <Screen title={t("invite.title")}>
        <Empty icon="users" title={t("invite.noLink")} />
      </Screen>
    );
  return (
    <Screen title={t("invite.title")}>
      <View testID="invite-accept" style={{ gap: space[3] }}>
        <Card>
          {!signedIn ? (
            <>
              <T v="body">{t("invite.signInFirst")}</T>
              {store.mode === "demo" ? (
                <T v="caption" tone="mut">
                  {t("invite.demo")}
                </T>
              ) : null}
              <Button label={t("invite.signIn")} icon="user" full onPress={signIn} />
            </>
          ) : state === "legal" ? (
            <View testID="invite-legal" style={{ gap: space[3] }}>
              <T v="body">{t("invite.legal")}</T>
              <LegalAgree on={agreed} onChange={setAgreed} testID="invite-agree" />
              {err ? (
                <T v="caption" tone="bad">
                  {err}
                </T>
              ) : null}
              <Button label={t("legal.gate.accept")} icon="check" full disabled={!agreed || busy} onPress={agreeAndJoin} />
            </View>
          ) : state === "error" ? (
            <>
              <T v="body" tone="bad">{`${t("invite.failed")} ${err}`}</T>
              <T v="caption" tone="mut">
                {t("invite.askAgain")}
              </T>
              <Button label={t("invite.home")} variant="secondary" full onPress={() => router.replace("/")} />
            </>
          ) : (
            <T v="body">{t("invite.joining")}</T>
          )}
        </Card>
      </View>
    </Screen>
  );
}
