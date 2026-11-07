import { useEffect, useState } from "react";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/cloud/auth";
import { peekInviteKey } from "@/features/team";
import { legalErrorKey } from "@/features/legal";
import { useI18n } from "@/i18n";
import { Button, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, Screen } from "@/ui/surfaces";
import { ClosedCompanies } from "@/features/ClosedCompany";

/** First run after sign-in: create the company (the creator becomes the owner, lead sources are seeded). */
export default function CompanySetup() {
  const { t } = useI18n();
  const auth = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (auth.company && !busy) router.replace("/");
  }, [auth.company, busy]);
  // a person who came by an invitation link joins that company instead of creating one (7-2, S21)
  useEffect(() => {
    AsyncStorage.getItem(peekInviteKey).then((v) => v && router.replace("/auth/invite")).catch(() => {});
  }, []);
  return (
    <Screen title={t("company.title")} back={() => router.replace("/")}>
      {/* 7а-3 «в»: why there is no company any more (docs/specs/22 §3.6) */}
      <ClosedCompanies />
      <Card>
        <TextField type="company" value={name} onChangeText={setName} placeholder={t("company.name")} icon="home2" />
        <T v="caption" tone="mut">
          {t("company.hint")}
        </T>
        {err ? (
          <T v="caption" tone="bad">
            {err}
          </T>
        ) : null}
        <Button
          label={t("company.create")}
          icon="check"
          full
          disabled={name.trim().length < 2 || busy}
          onPress={async () => {
            setBusy(true);
            const e = await auth.createCompany(name.trim());
            setBusy(false);
            // no consent (7а-1): the gate asks for it; an old app with an old text — «update the app»
            const k = legalErrorKey(e);
            if (k === "legal.err.needed") router.push("/auth/terms");
            if (e) setErr(k ? t(k) : e);
            // first run (13 §3.11): «Чем вы занимаетесь?» → the company profile
            else router.replace("/auth/trade");
          }}
        />
      </Card>
    </Screen>
  );
}
