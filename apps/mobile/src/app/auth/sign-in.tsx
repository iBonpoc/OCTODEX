import { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { component, space } from "@octo/design-tokens";
import { useAuth } from "@/cloud/auth";
import { SUPPORT_EMAIL, SUPPORT_PLACEHOLDER, mailto } from "@/config/support";
import { useStore } from "@/data/store";
import { emailTypoFix } from "@/features/emailTypo";
import { LegalAgree } from "@/features/LegalAgree";
import { legalErrorKey, PENDING_LEGAL_KEY, rememberAgreement } from "@/features/legal";
import { codeAfterFail, codeDigits, CODE_LENGTH, CODE_MIN, errPlace, needsSupport, nextReadyAt, resendLeft, signInError, type SignInErr } from "@/features/signIn";
import { useI18n } from "@/i18n";
import { Button, TextField } from "@/ui/controls";
import { Sheet } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { FieldError } from "@/ui/requiredForm";
import { haptics } from "@/ui/haptics";
import { FieldGroup, FormMain, ListRow, Screen } from "@/ui/surfaces";
import { StatusNote } from "@/ui/statusNote";

type Step = "email" | "code" | "password";
/** a refusal: under its field or under the button (DS §11 п.2) */
interface Shown {
  text: string;
  place: "email" | "code" | "agree" | "password" | "form";
  support?: boolean;
}

/**
 * Sign-in = sign-up by the email code (docs/specs/52, #1756). Step 1: the email and the consent tick → «Получить код».
 * Step 2: «Код отправлен на <адрес> · Изменить» and the code field only; the last digit signs in by itself (iOS puts
 * the code from Mail over the keyboard). The first code makes the account and confirms the address — no link, no
 * separate sign-up. A password is a small way in for an existing account (the App Store reviewer, #913).
 * The main button is always on: a tap says what is missing under its field (DS §7.4, §11 п.3).
 * Clickwrap (7а-1): the tick is kept on the device and goes to the server once signed in.
 */
export default function SignIn() {
  const { t } = useI18n();
  const auth = useAuth();
  const { online } = useStore();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  // grows after a wrong code: the code field takes the focus and its digits are selected (spec 52 §6)
  const [selectCode, setSelectCode] = useState(0);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Shown | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [noMail, setNoMail] = useState(false);
  // what the screen is waiting for: said under the main button (no spinner in Button yet — Н-49)
  const [doing, setDoing] = useState<"send" | "check" | null>(null);
  const [resends, setResends] = useState(0);
  // the address the code went to (step 2 shows it; a code that comes back for an address changed meanwhile is not shown)
  const [sentTo, setSentTo] = useState("");
  const typed = useRef("");
  typed.current = email.trim();
  // the pause before the next code: RESEND_S, or the server's own wait; it survives «Изменить» (review №4)
  const [readyAt, setReadyAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const left = resendLeft(readyAt, now);
  const ticking = left > 0;
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  const canSupport = !SUPPORT_PLACEHOLDER;
  const okEmail = /^\S+@\S+\.\S+$/.test(email.trim());
  const typo = step === "email" ? emailTypoFix(email) : null;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  // an invitation link waits through sign-in (7-2): back to it, not to «create a company»
  const { next } = useLocalSearchParams<{ next?: string }>();
  const go = () => router.replace(next === "invite" ? "/auth/invite" : "/auth/company");
  const pause = (r?: SignInErr | null) => {
    setReadyAt(nextReadyAt(Date.now(), r));
    setNow(Date.now());
  };
  const say = (e: SignInErr) => {
    // «напишите в поддержку» only while there is a support address to write to (#836); else what to do now (review PR-1 №1)
    const dead = needsSupport(e.key);
    const key = dead && !canSupport ? (`${e.key}.later` as const) : e.key;
    const text = e.key === "auth.err.wait" ? t("auth.err.wait", { s: String(e.seconds ?? 60) }) : t(key as Parameters<typeof t>[0]);
    setErr({ text, place: errPlace(e.key), support: dead });
  };
  // signed in: the consent to the server first (the company and the invitation need it); a refusal — the words of the app
  const done = async () => {
    const e = await auth.agree();
    const k = legalErrorKey(e);
    if (k) return setErr({ text: t(k), place: "form" });
    go();
  };

  // busy until the whole step is over (sign-in AND the consent on the server): a second tap gives no false error (M7)
  // a lock that holds at once (state waits for the next render): iOS may put the code in twice in a row (review PR-1 Ж3)
  const running = useRef(false);
  const act = async (fn: () => Promise<string | null>, onOk?: () => void | Promise<void>, onErr?: (e: SignInErr) => void) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setErr(null);
    setNote(null);
    try {
      await rememberAgreement(AsyncStorage, email).catch(() => {});
      // a call that throws instead of answering (no network on some platforms) is a refusal too: the tick goes
      const e = await fn().catch((x: unknown) => (x instanceof Error && x.message ? x.message : "network"));
      // a failed sign-in leaves no tick behind (security-check 7а-1); every next try writes it again
      if (e) {
        await AsyncStorage.removeItem(PENDING_LEGAL_KEY).catch(() => {});
        const r = signInError(e);
        say(r);
        onErr?.(r);
      } else await onOk?.();
    } finally {
      running.current = false;
      setBusy(false);
      setDoing(null);
    }
  };

  /** what is missing before a code can go — under its field, never a grey button */
  const missing = (): Shown | null => {
    if (!email.trim()) return { text: t("auth.need.email"), place: "email" };
    if (!okEmail) return { text: t("auth.need.emailForm"), place: "email" };
    if (!agreed) return { text: t("auth.need.agree"), place: "agree" };
    if (!online) return { text: t("auth.need.net"), place: "form" };
    return null;
  };
  const sendCode = () => {
    if (busy) return;
    const m = missing();
    if (m) {
      if (m.place === "agree") haptics.warning();
      return setErr(m);
    }
    if (ticking) return; // the countdown under the button says when
    const to = email.trim();
    const again = step === "code";
    setDoing("send");
    return act(
      () => auth.sendCode(to),
      () => {
        pause();
        if (typed.current !== to) return;
        setSentTo(to);
        setStep("code");
        // a new code makes the old one void: the field is cleared and the screen says a new one went (review №8)
        setCode("");
        if (again) {
          setResends((n) => n + 1);
          setNote(t("auth.codeResent", { email: to }));
        }
      },
      (r) => {
        if (r.key === "auth.err.wait") pause(r);
      },
    );
  };
  const verify = (digits = code) => {
    if (busy) return;
    if (digits.length < CODE_MIN) return setErr({ text: t("auth.need.code", { n: String(CODE_LENGTH) }), place: "code" });
    setDoing("check");
    // a wrong or old code stays, its digits selected: the person checks them, the next code is typed over them (spec 52 §6, С1)
    return act(() => auth.verifyCode(sentTo, digits), done, (r) => {
      if (codeAfterFail(r.key) === "select") setSelectCode((n) => n + 1);
    });
  };
  const onCode = (v: string) => {
    const d = codeDigits(v);
    setCode(d);
    if (err?.place === "code") setErr(null);
    // the last digit signs in by itself (a code put in by iOS from Mail too)
    if (d.length === CODE_LENGTH && d !== code && !running.current) void verify(d);
  };
  const signInPassword = () => {
    if (busy) return;
    const m = missing();
    if (m && m.place !== "form") {
      if (m.place === "agree") haptics.warning();
      return setErr(m);
    }
    if (password.length < 6) return setErr({ text: t("auth.need.password"), place: "password" });
    setDoing("check");
    return act(() => auth.signInPassword(email.trim(), password), done);
  };
  // another address: back to step 1; the code sent to the old one is dropped, the pause stays (review №4)
  const changeEmail = () => {
    if (running.current) return; // a request under way finishes on the step it started on
    setStep("email");
    setCode("");
    setErr(null);
    setNote(null);
    setNoMail(false);
  };
  const onEmail = (v: string) => {
    setEmail(v);
    if (err?.place === "email") setErr(null);
  };
  const support = () => void Linking.openURL(mailto(SUPPORT_EMAIL, t("auth.title")));

  // a text link is a real 44-high box (DS §7.1; the web has no hitSlop — §11 п.18)
  const label = (text: string) => (
    <T v="caption" w="semibold" tone="mut">
      {text}
    </T>
  );
  const under = (place: Shown["place"]) => (err?.place === place ? err.text : undefined);
  const countdown = ticking ? (
    <View testID="auth-countdown">
      <T v="caption" tone="mut">
        {t("auth.nextIn", { s: String(left) })}
      </T>
    </View>
  ) : null;

  return (
    <Screen form title={t("auth.title")} back={back}>
      {step !== "code" ? (
        <View testID="auth-no-signup">
          <T v="caption" tone="mut">
            {t("auth.noSignup")}
          </T>
        </View>
      ) : null}
      <FieldGroup under testID="auth-fields">
        {step !== "code" ? (
          <>
            <View style={{ gap: space[1] }}>
              {label(t("auth.emailLabel"))}
              <TextField
                type="email"
                value={email}
                onChangeText={onEmail}
                placeholder={t("auth.emailExample")}
                label={t("auth.emailLabel")}
                icon="mail"
                testID="auth-email"
                autoFocus={step === "email"}
                error={under("email")}
                onSubmit={step === "email" ? sendCode : undefined}
              />
              {typo ? (
                <Button label={t("auth.typo", { email: typo })} variant="ghost" onPress={() => setEmail(typo)} testID="auth-typo" />
              ) : null}
            </View>
            <View style={{ gap: space[1] }}>
              <LegalAgree
                on={agreed}
                error={err?.place === "agree"}
                onChange={(v) => {
                  setAgreed(v);
                  if (err?.place === "agree") setErr(null);
                }}
              />
              <FieldError text={under("agree")} testID="auth-agree-error" />
            </View>
          </>
        ) : (
          <>
            {/* the address on its own line, «Изменить» right by it — never alone on the next line (review PR-1 №10) */}
            <View testID="auth-code-sent">
              <T v="body">{t("auth.sentTo")}</T>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
                <View style={{ flexShrink: 1 }}>
                  <T v="body" w="semibold" numberOfLines={1}>
                    {sentTo}
                  </T>
                </View>
                <Button label={t("auth.change")} variant="ghost" onPress={changeEmail} testID="auth-change-email" />
              </View>
            </View>
            <View style={{ gap: space[1] }}>
              {label(t("auth.codeLabel"))}
              <TextField
                type="code"
                value={code}
                onChangeText={onCode}
                placeholder={t("auth.codeExample", { n: String(CODE_LENGTH) })}
                label={t("auth.codeLabel")}
                testID="auth-code"
                autoFocus
                selectOnFocus
                focusNow={selectCode}
                error={under("code")}
                onSubmit={() => void verify()}
              />
              <T v="caption" tone="mut">
                {t("auth.codeLife")}
              </T>
            </View>
          </>
        )}
        {step === "password" ? (
          <View style={{ gap: space[1] }}>
            {label(t("auth.password"))}
            <TextField type="password" value={password} onChangeText={setPassword} label={t("auth.password")} testID="auth-password" error={under("password")} onSubmit={signInPassword} />
          </View>
        ) : null}
        <FormMain>
          {step === "email" ? <Button label={t("auth.sendCode")} icon="send" full onPress={sendCode} testID="auth-send-code" /> : null}
          {step === "code" ? <Button label={t("auth.signIn")} icon="check" full onPress={() => void verify()} testID="auth-verify" /> : null}
          {step === "password" ? <Button label={t("auth.signIn")} icon="check" full onPress={signInPassword} testID="auth-password-sign-in" /> : null}
        </FormMain>
        {doing ? (
          <View testID="auth-busy" accessibilityLiveRegion="polite">
            <T v="caption" tone="mut">
              {t(doing === "send" ? "auth.busy.send" : "auth.busy.check")}
            </T>
          </View>
        ) : null}
        {step === "email" ? countdown : null}
        {note ? (
          <StatusNote tone="ok" testID="auth-resent">
            {note}
          </StatusNote>
        ) : null}
        {err?.place === "form" ? (
          <View style={{ gap: space[2] }}>
            <StatusNote tone="bad" testID="auth-note">
              {err.text}
            </StatusNote>
            {err.support && canSupport ? <Button label={t("auth.support")} variant="ghost" icon="mail" onPress={support} testID="auth-support" /> : null}
          </View>
        ) : null}
      </FieldGroup>
      <View style={{ gap: space[2] }}>
        {/* one place for «Отправить ещё раз»: the countdown, then the button — nothing under the finger jumps (§14.4) */}
        {step === "code" ? (
          <View style={{ minHeight: component.button.hit, justifyContent: "center" }}>
            {ticking ? countdown : <Button label={t("auth.resend")} variant="ghost" icon="send" onPress={sendCode} testID="auth-resend" />}
          </View>
        ) : null}
        {step === "code" ? <Button label={t("auth.noMail")} variant="ghost" onPress={() => setNoMail(true)} testID="auth-no-mail" /> : null}
        {step === "password" ? (
          <Button
            label={t("auth.useCode")}
            variant="ghost"
            onPress={() => {
              setErr(null);
              setStep("email");
            }}
            testID="auth-use-code"
          />
        ) : null}
      </View>
      {step === "email" ? (
        <View style={{ gap: space[2] }}>
          <T v="caption" tone="mut">
            {t("auth.demoNote")}
          </T>
          <Button label={t("auth.demoGo")} variant="ghost" onPress={() => router.replace("/")} testID="auth-demo" />
          <Button
            label={t("auth.usePassword")}
            variant="ghost"
            onPress={() => {
              setErr(null);
              setStep("password");
            }}
            testID="auth-use-password"
          />
        </View>
      ) : null}
      <Sheet visible={noMail} onClose={() => setNoMail(false)} title={t("auth.noMail")}>
        <View testID="auth-no-mail-sheet">
          <ListRow title={t("auth.noMail.spam")} subtitle={t("auth.noMail.spamSub")} lines={2} />
          <ListRow title={t("auth.noMail.sender")} subtitle={t("auth.noMail.senderSub")} lines={2} />
          <ListRow
            title={t("auth.noMail.check", { email: sentTo })}
            subtitle={t("auth.noMail.checkSub")}
            lines={2}
            onPress={() => {
              setNoMail(false);
              changeEmail();
            }}
          />
          {countdown}
          {!ticking ? (
            <Button
              label={t("auth.resend")}
              variant="secondary"
              icon="send"
              onPress={() => {
                setNoMail(false);
                void sendCode();
              }}
              testID="auth-no-mail-resend"
            />
          ) : null}
          {resends >= 2 && canSupport ? <Button label={t("auth.support")} variant="ghost" icon="mail" onPress={support} testID="auth-no-mail-support" /> : null}
        </View>
      </Sheet>
    </Screen>
  );
}
