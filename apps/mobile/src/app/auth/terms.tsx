import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useAuth } from "@/cloud/auth";
import { LegalAgree } from "@/features/LegalAgree";
import { legalErrorKey } from "@/features/legal";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, Screen } from "@/ui/surfaces";

/**
 * The consent gate (7а-1, docs/specs/19 §5; legal/01 §3.2 п.10, §3.5): a signed-in person without the current Terms and
 * Privacy — the first time («Примите…», e.g. the account was confirmed by the email link on another device) or a new
 * edition («Условия изменились»). The tick, «Принять», or «Выйти». Opened by LegalGate; never without the network.
 */
export default function TermsGate() {
  const { t } = useI18n();
  const auth = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const changed = auth.legal === "changed";
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  return (
    <Screen title={t(changed ? "legal.gate.changedTitle" : "legal.gate.firstTitle")}>
      <View testID="legal-gate" style={{ gap: space[3] }}>
        <Card>
          <View style={{ gap: space[3] }}>
            <T v="body">{t(changed ? "legal.gate.changedBody" : "legal.gate.firstBody")}</T>
            {changed ? (
              <T v="caption" tone="mut">
                {t("legal.gate.whatChanged")}
              </T>
            ) : null}
            <LegalAgree on={agreed} onChange={setAgreed} testID="legal-gate-agree" />
            {err ? (
              <T v="caption" tone="bad">
                {err}
              </T>
            ) : null}
            <Button
              label={t("legal.gate.accept")}
              icon="check"
              full
              disabled={!agreed || busy}
              onPress={async () => {
                setBusy(true);
                setErr(null);
                const e = await auth.agree();
                setBusy(false);
                if (e) setErr(t(legalErrorKey(e) ?? "legal.err.network"));
                else leave();
              }}
            />
          </View>
        </Card>
        <Button
          label={t("legal.gate.signOut")}
          variant="ghost"
          onPress={async () => {
            await auth.signOut();
            router.replace("/");
          }}
        />
      </View>
    </Screen>
  );
}
