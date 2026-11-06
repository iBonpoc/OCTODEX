import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { space } from "@octo/design-tokens";
import { useAuth } from "@/cloud/auth";
import { LegalAgree } from "@/features/LegalAgree";
import { legalErrorKey, PENDING_LEGAL_KEY, rememberAgreement } from "@/features/legal";
import { useI18n } from "@/i18n";
import { Button, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, Screen } from "@/ui/surfaces";

type Mode = "code" | "password" | "signup";

/**
 * Email sign-in: one-time code (primary), or password. Accounts are created on first sign-in.
 * Clickwrap (7а-1, docs/specs/19 §5): an empty tick «I agree to the Terms of Service and the Privacy Policy» before the
 * buttons — without it every button is off. The tick is kept on the device and goes to the server once signed in.
 */
export default function SignIn() {
  const { t } = useI18n();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("code");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const okEmail = /^\S+@\S+\.\S+$/.test(email.trim());
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  // an invitation link waits through sign-in (7-2): back to it, not to «create a company»
  const { next } = useLocalSearchParams<{ next?: string }>();
  const go = () => router.replace(next === "invite" ? "/auth/invite" : "/auth/company");
  // signed in: the consent to the server first (the company and the invitation need it); a refusal — the words of the app
  const done = async () => {
    const e = await auth.agree();
    const k = legalErrorKey(e);
    if (k) return setErr(t(k));
    go();
  };

  const act = async (fn: () => Promise<string | null>, onOk?: () => void) => {
    setBusy(true);
    setErr(null);
    await rememberAgreement(AsyncStorage, email).catch(() => {});
    const e = await fn();
    // a failed sign-in leaves no tick behind (security-check 7а-1); a sent code keeps it until the code is typed
    if (e) await AsyncStorage.removeItem(PENDING_LEGAL_KEY).catch(() => {});
    setBusy(false);
    if (e) setErr(e);
    else onOk?.();
  };

  return (
    <Screen title={t("auth.title")} back={back}>
      <Card>
        <View style={{ gap: space[3] }}>
          <TextField type="email" value={email} onChangeText={setEmail} placeholder={t("auth.email")} icon="message" />
          <LegalAgree on={agreed} onChange={setAgreed} />
          {mode === "code" ? (
            <>
              {!sent ? (
                <Button label={t("auth.sendCode")} icon="send" full disabled={!agreed || !okEmail || busy} onPress={() => act(() => auth.sendCode(email.trim()), () => setSent(true))} />
              ) : (
                <>
                  <T v="caption" tone="mut">
                    {t("auth.codeSent", { email: email.trim() })}
                  </T>
                  <TextField type="code" value={code} onChangeText={setCode} placeholder={t("auth.code")} />
                  <Button label={t("auth.signIn")} icon="check" full disabled={!agreed || code.trim().length < 6 || busy} onPress={() => act(() => auth.verifyCode(email.trim(), code.trim()), () => void done())} />
                </>
              )}
            </>
          ) : null}
          {mode !== "code" ? (
            <>
              {mode === "signup" ? <TextField type="name" value={name} onChangeText={setName} placeholder={t("auth.name")} icon="user" /> : null}
              <TextField type={mode === "signup" ? "newPassword" : "password"} value={password} onChangeText={setPassword} placeholder={t("auth.password")} />
              {mode === "password" ? (
                <Button label={t("auth.signIn")} icon="check" full disabled={!agreed || !okEmail || password.length < 6 || busy} onPress={() => act(() => auth.signInPassword(email.trim(), password), () => void done())} />
              ) : (
                <Button
                  label={t("auth.signUp")}
                  icon="plus"
                  full
                  disabled={!agreed || !okEmail || password.length < 6 || !name.trim() || busy}
                  onPress={() =>
                    act(() => auth.signUpPassword(email.trim(), password, name.trim()), () => {
                      setMsg(t("auth.checkEmail"));
                      setMode("password");
                    })
                  }
                />
              )}
            </>
          ) : null}
          {msg ? (
            <T v="caption" tone="ok">
              {msg}
            </T>
          ) : null}
          {err ? (
            <T v="caption" tone="bad">
              {err}
            </T>
          ) : null}
        </View>
      </Card>
      <View style={{ gap: space[2] }}>
        {mode !== "code" ? <Button label={t("auth.useCode")} variant="ghost" onPress={() => setMode("code")} /> : null}
        {mode === "code" ? <Button label={t("auth.usePassword")} variant="ghost" onPress={() => setMode("password")} /> : null}
        {mode === "password" ? <Button label={t("auth.noAccount")} variant="ghost" onPress={() => setMode("signup")} /> : null}
        {mode === "signup" ? <Button label={t("auth.haveAccount")} variant="ghost" onPress={() => setMode("password")} /> : null}
      </View>
      <T v="caption" tone="mut">
        {t("auth.demoNote")}
      </T>
    </Screen>
  );
}
