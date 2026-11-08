import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space } from "@octo/design-tokens";
import { I18nOverride, useI18n } from "@/i18n";
import type { DocLang } from "@/i18n/translate";
import { categoryLabel } from "@/features/serviceCategories";
import {
  attribution, browserLang, canSend, fetchIntakeForm, newNonce, submitIntake, type IntakeFields, type IntakeForm,
} from "@/cloud/intake";
import { Button, ChoiceChips, TextField, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, CardList, Empty, RowView, Screen } from "@/ui/surfaces";

/**
 * The request page of a company (step 16, docs/specs/34-lead-intake.md §3): opened from the contractor's site, Google
 * Business Profile, Facebook or a QR code, in a phone browser, without the app and without signing in. The homeowner
 * leaves a phone or an email and what they need; the contractor gets a new lead with a push. The page speaks the
 * client's language (rule 7): ?lang= → the browser → the company's; EN / ES / RU chips change it.
 */
export default function IntakePage() {
  const params = useLocalSearchParams<{ token: string; lang?: string }>();
  const token = String(params.token ?? "");
  const [form, setForm] = useState<IntakeForm | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [lang, setLang] = useState<DocLang | null>(params.lang === "en" || params.lang === "es" || params.lang === "ru" ? params.lang : browserLang());
  useEffect(() => {
    fetchIntakeForm(token)
      .then(setForm)
      .catch(() => setFailed(true));
  }, [token]);
  const back = router.canGoBack() ? () => router.back() : undefined;
  if (!form) {
    // before the company is known: the browser's language (the parent's t would be the app's)
    return (
      <I18nOverride lang={lang ?? "en"}>
        <IntakeState loading={form === undefined && !failed} failed={failed} back={back} />
      </I18nOverride>
    );
  }
  return (
    <I18nOverride lang={lang ?? form.language}>
      <IntakeBody token={token} form={form} lang={lang ?? form.language} setLang={setLang} back={back} search={params} />
    </I18nOverride>
  );
}

function IntakeState({ loading, failed, back }: { loading: boolean; failed: boolean; back?: () => void }) {
  const { t } = useI18n();
  return (
    <Screen title={t("intake.title")} back={back}>
      <View testID="intake-state">
        {loading ? <Empty icon="clock" title={t("portal.loading")} /> : <Empty icon="alert" title={failed ? t("intake.error") : t("intake.notFound")} />}
      </View>
    </Screen>
  );
}

const EMPTY = { name: "", phone: "", email: "", address: "", city: "", state: "", zip: "", message: "", website: "" };

function IntakeBody({ token, form, lang, setLang, back, search }: {
  token: string; form: IntakeForm; lang: DocLang; setLang: (l: DocLang) => void; back?: () => void;
  search: Record<string, string | string[] | undefined>;
}) {
  const { t } = useI18n();
  const opened = useRef(Date.now());
  const nonce = useRef(newNonce());
  const [f, setF] = useState(EMPTY);
  const [categoryId, setCategoryId] = useState<string>("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  if (sent) {
    return (
      <Screen title={t("intake.title")} back={back}>
        <View testID="intake-sent">
          <Empty icon="check" title={t("intake.sent")} hint={t("intake.sentHint", { company: form.company })} />
        </View>
      </Screen>
    );
  }

  const ready = canSend(f);
  const send = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const fields: IntakeFields = { ...f, categoryId: categoryId || undefined, language: lang, consent: form.smsConsent && consent };
    const referrer = typeof document !== "undefined" ? document.referrer : undefined;
    try {
      await submitIntake(token, fields, { openedAt: opened.current, nonce: nonce.current, utm: attribution(search, referrer) });
      setSent(true);
    } catch {
      setError(t("intake.error")); // the same nonce on a retry: the server takes it as one request
    } finally {
      setBusy(false);
    }
  };
  const langs: { key: DocLang; label: string }[] = [{ key: "en", label: "English" }, { key: "es", label: "Español" }, { key: "ru", label: "Русский" }];
  return (
    <Screen title={t("intake.title")} back={back}>
      <CardList>
        <View testID="intake-lang">
          <ChoiceChips items={langs} value={lang} onChange={setLang} />
        </View>
        <Card>
          <T v="heading">{form.company}</T>
          <T v="body" tone="mut">{t("intake.intro", { company: form.company })}</T>
        </Card>
        <Card>
          <View style={{ gap: space[3] }}>
            <View testID="intake-name"><TextField type="name" value={f.name} onChangeText={set("name")} placeholder={t("intake.name")} label={t("intake.name")} /></View>
            <View testID="intake-phone"><TextField type="phone" value={f.phone} onChangeText={set("phone")} placeholder={t("intake.phone")} label={t("intake.phone")} /></View>
            <View testID="intake-email"><TextField type="email" value={f.email} onChangeText={set("email")} placeholder={t("intake.email")} label={t("intake.email")} /></View>
            <View testID="intake-address"><TextField type="street" value={f.address} onChangeText={set("address")} placeholder={t("intake.address")} label={t("intake.address")} /></View>
            <RowView>
              <View style={{ flex: 2 }}><TextField type="city" value={f.city} onChangeText={set("city")} placeholder={t("intake.city")} label={t("intake.city")} /></View>
              <View style={{ flex: 1 }}><TextField type="state" value={f.state} onChangeText={set("state")} placeholder={t("intake.state")} label={t("intake.state")} /></View>
              <View style={{ flex: 1 }}><TextField type="zip" value={f.zip} onChangeText={set("zip")} placeholder={t("intake.zip")} label={t("intake.zip")} /></View>
            </RowView>
            {form.categories.length > 1 ? (
              <View testID="intake-category" style={{ gap: space[2] }}>
                <T v="caption" tone="mut">{t("intake.service")}</T>
                <ChoiceChips
                  items={form.categories.map((c) => ({ key: c.id, label: categoryLabel({ id: c.id, seedKey: c.key, name: c.name, position: 0 }, t as never) }))}
                  value={categoryId}
                  onChange={setCategoryId}
                />
              </View>
            ) : null}
            <View testID="intake-message"><TextField type="note" value={f.message} onChangeText={set("message")} placeholder={t("intake.message")} label={t("intake.message")} /></View>
            {/* people never see this field; a bot fills every field it finds */}
            <View style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }} aria-hidden importantForAccessibility="no-hide-descendants">
              <View testID="intake-website"><TextField type="text" value={f.website} onChangeText={set("website")} label="website" /></View>
            </View>
          </View>
        </Card>
        {form.smsConsent ? (
          <Card>
            {/* the consent text is on the screen, next to its switch, off by default (TCPA: clear and separate) */}
            <View testID="intake-consent" style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
              <View style={{ flex: 1 }}><T v="caption">{t("intake.consent", { company: form.company })}</T></View>
              <Toggle on={consent} onChange={setConsent} label={t("intake.consent", { company: form.company })} />
            </View>
          </Card>
        ) : null}
        {!ready ? <T v="caption" tone="mut">{t("intake.needContact")}</T> : null}
        {error ? <View testID="intake-error"><T v="caption" tone="mut">{error}</T></View> : null}
        <View testID="intake-send">
          <Button label={busy ? t("intake.sending") : t("intake.send")} onPress={send} disabled={!ready || busy} full />
        </View>
        <T v="caption" tone="mut">{t("intake.privacy", { company: form.company })}</T>
      </CardList>
    </Screen>
  );
}
