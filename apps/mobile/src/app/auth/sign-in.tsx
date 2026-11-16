import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { space } from "@octo/design-tokens";
import { useAuth } from "@/cloud/auth";
import { LegalAgree } from "@/features/LegalAgree";
import { legalErrorKey, PENDING_LEGAL_KEY, rememberAgreement } from "@/features/legal";
import { nextReadyAt, resendLeft, signInError, type SignInErr } from "@/features/signIn";
import { useI18n } from "@/i18n";
import { Button, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { FieldGroup, FormMain, Screen } from "@/ui/surfaces";
import { StatusNote } from "@/ui/statusNote";

type Mode = "code" | "password";

/**
 * Sign-in = sign-up (#1756): email → a 6-digit code from the email → in. The first code creates the account and
 * confirms the address at once — no link, no separate registration. A password is only a way in for an existing
 * account (the App Store reviewer, #913).
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
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  // «Отправить ещё раз»: on after RESEND_S (or the server's own wait)
  const [readyAt, setReadyAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const left = resendLeft(readyAt, now);
  const ticking = left > 0;
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

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
  const say = (e: SignInErr) => setErr(e.key === "auth.err.wait" ? t(e.key, { s: String(e.seconds ?? 60) }) : t(e.key));

  // busy until the whole step is over (sign-in AND the consent on the server): a second tap gives no false error (M7)
  const act = async (fn: () => Promise<string | null>, onOk?: () => void | Promise<void>, onErr?: (e: SignInErr) => void) => {
    setBusy(true);
    setErr(null);
    try {
      await rememberAgreement(AsyncStorage, email).catch(() => {});
      const e = await fn();
      // a failed sign-in leaves no tick behind (security-check 7а-1); every next try writes it again
      if (e) {
        await AsyncStorage.removeItem(PENDING_LEGAL_KEY).catch(() => {});
        const r = signInError(e);
        say(r);
        onErr?.(r);
      } else await onOk?.();
    } finally {
      setBusy(false);
    }
  };
  const sendCode = () =>
    act(
      () => auth.sendCode(email.trim()),
      () => {
        setSent(true);
        setReadyAt(nextReadyAt(Date.now()));
        setNow(Date.now());
      },
      // the server's own wait moves the timer (a code sent a moment ago is still good)
      (r) => {
        if (r.key === "auth.err.wait") {
          setReadyAt(nextReadyAt(Date.now(), r));
          setNow(Date.now());
        }
      },
    );
  // another address: back to the first step; the code sent to the old one is dropped
  const changeEmail = () => {
    setSent(false);
    setCode("");
    setErr(null);
    setReadyAt(0);
  };
  const onEmail = (v: string) => {
    setEmail(v);
    if (sent) changeEmail();
  };

  return (
    <Screen form title={t("auth.title")} back={back}>
      <FieldGroup under testID="auth-fields">
        <TextField type="email" value={email} onChangeText={onEmail} placeholder={t("auth.email")} icon="mail" testID="auth-email" />
        <LegalAgree on={agreed} onChange={setAgreed} />
        {mode === "code" && !sent ? (
          <FormMain>
            <Button label={t("auth.sendCode")} icon="send" full disabled={!agreed || !okEmail || busy} onPress={sendCode} testID="auth-send-code" />
          </FormMain>
        ) : null}
        {mode === "code" && sent ? (
          <>
            <T v="caption" tone="mut">
              {t("auth.codeSent", { email: email.trim() })}
            </T>
            <TextField type="code" value={code} onChangeText={setCode} placeholder={t("auth.code")} testID="auth-code" autoFocus />
            <FormMain>
              <Button label={t("auth.signIn")} icon="check" full disabled={!agreed || code.trim().length < 6 || busy} onPress={() => act(() => auth.verifyCode(email.trim(), code.trim()), done)} testID="auth-verify" />
            </FormMain>
          </>
        ) : null}
        {mode === "password" ? (
          <>
            <TextField type="password" value={password} onChangeText={setPassword} placeholder={t("auth.password")} testID="auth-password" />
            <FormMain>
              <Button label={t("auth.signIn")} icon="check" full disabled={!agreed || !okEmail || password.length < 6 || busy} onPress={() => act(() => auth.signInPassword(email.trim(), password), done)} testID="auth-password-sign-in" />
            </FormMain>
          </>
        ) : null}
        {err ? (
          <StatusNote tone="bad" testID="auth-note">
            {err}
          </StatusNote>
        ) : null}
      </FieldGroup>
      <View style={{ gap: space[2] }}>
        {mode === "code" && sent ? (
          <>
            <Button
              label={left > 0 ? t("auth.resendIn", { s: String(left) }) : t("auth.resend")}
              variant="ghost"
              icon="send"
              disabled={left > 0 || !agreed || busy}
              onPress={sendCode}
              testID="auth-resend"
            />
            <Button label={t("auth.changeEmail")} variant="ghost" onPress={changeEmail} testID="auth-change-email" />
          </>
        ) : null}
        {mode === "password" ? <Button label={t("auth.useCode")} variant="ghost" onPress={() => setMode("code")} testID="auth-use-code" /> : null}
        {mode === "code" ? (
          <Button
            label={t("auth.usePassword")}
            variant="ghost"
            onPress={() => {
              changeEmail();
              setMode("password");
            }}
            testID="auth-use-password"
          />
        ) : null}
      </View>
      <T v="caption" tone="mut">
        {t("auth.demoNote")}
      </T>
    </Screen>
  );
}
