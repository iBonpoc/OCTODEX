import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { space } from "@octo/design-tokens";
import { useAuth } from "@/cloud/auth";
import { acceptInvitation } from "@/cloud/team";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { isInviteToken, rememberInvite, takeInvite } from "@/features/team";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, Empty, Screen } from "@/ui/surfaces";

/**
 * The invitation link (wave 7-2, S21; 13 §3.13): sign in or create an account with the invited email →
 * join the company with the invited role → Главная of that role. The link waits through sign-in (it is remembered).
 */
export default function AcceptInvite() {
  const { token: param } = useLocalSearchParams<{ token?: string }>();
  const { t } = useI18n();
  const auth = useAuth();
  const store = useStore();
  const [state, setState] = useState<"idle" | "joining" | "error">("idle");
  const [err, setErr] = useState("");
  const tried = useRef(false);
  const signedIn = !!auth.userId;
  useEffect(() => {
    if (!signedIn || tried.current) return;
    tried.current = true;
    (async () => {
      const token = isInviteToken(param) ? param! : await takeInvite(AsyncStorage);
      if (!token) return setState("error"), setErr(t("invite.noLink"));
      setState("joining");
      try {
        await acceptInvitation(token);
        await AsyncStorage.removeItem("octo.invite.token.v1");
        await auth.reloadMemberships();
        router.replace("/");
      } catch (e) {
        // a dead link is not kept for the next sign-in (security-check 7-2)
        await AsyncStorage.removeItem("octo.invite.token.v1").catch(() => {});
        setState("error");
        setErr((e as Error).message);
      }
    })();
  }, [signedIn, param, auth, t]);
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
