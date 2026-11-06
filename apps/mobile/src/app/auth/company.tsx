import { useEffect, useState } from "react";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/cloud/auth";
import { peekInviteKey } from "@/features/team";
import { useI18n } from "@/i18n";
import { Button, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, Screen } from "@/ui/surfaces";

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
  // a person who came by an invitation link joins that company instead of creating one (wave 7-2, S21)
  useEffect(() => {
    AsyncStorage.getItem(peekInviteKey).then((v) => v && router.replace("/auth/invite")).catch(() => {});
  }, []);
  return (
    <Screen title={t("company.title")} back={() => router.replace("/")}>
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
            if (e) setErr(e);
            else router.replace("/company/profile?wizard=1");
          }}
        />
      </Card>
    </Screen>
  );
}
