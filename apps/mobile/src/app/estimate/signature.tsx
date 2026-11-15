import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { mySignature } from "@/features/estimateSign";
import { SignaturePad, SignaturePreview } from "@/features/SignaturePad";
import { StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, FieldGroup, Screen } from "@/ui/surfaces";

/**
 * «Моя подпись» (docs/specs/07 «E2b»): the signature an employee puts on contracts for the company in their own name.
 * A new one replaces the old; the old stays in history (the server never deletes a signature).
 */
export default function MySignatureScreen() {
  const store = useStore();
  const { t, day } = useI18n();
  const toast = useToast();
  const me = store.db.members.find((m) => m.id === store.db.me);
  const current = mySignature(store.db, store.db.me);
  const [name, setName] = useState(current?.name ?? me?.name ?? "");
  const [title, setTitle] = useState(current?.title ?? me?.title ?? "");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/settings"));
  return (
    <Screen title={t("est.sig.title")} back={back} help={t("est.sig.help")}>
      {current ? (
        <Card status="ok">
          <StatusChip status="ok" label={t("est.sig.saved", { date: day(current.createdAt) })} />
          <SignaturePreview svg={current.svg} label={t("est.sig.title")} />
          <T v="body">{[current.name, current.title].filter(Boolean).join(", ")}</T>
        </Card>
      ) : (
        <Card>
          <T v="body" tone="mut">
            {t("est.sig.none")}
          </T>
        </Card>
      )}
      <FieldGroup title={current ? t("est.sig.redraw") : t("est.sig.draw")}>
        <View style={{ gap: space[3] }}>
          <TextField type="name" value={name} onChangeText={setName} placeholder={t("est.sig.name")} icon="user" />
          {me?.title ? (
            // security-check #98: the title on contracts comes from the profile (owner / admin set it in «Команда»)
            <View>
              <T v="body">{me.title}</T>
              <T v="caption" tone="mut">
                {t("est.sig.titleFromProfile")}
              </T>
            </View>
          ) : (
            <TextField type="jobTitle" value={title} onChangeText={setTitle} placeholder={t("est.sig.jobTitle")} />
          )}
          <SignaturePad
            label={t("est.countersign.padLabel")}
            consent={null}
            confirmLabel={t("est.sig.save")}
            disabled={name.trim().length < 2}
            onConfirm={(svg) => toast.show(t("est.sig.done"), store.saveMySignature(svg, name, me?.title || title))}
          />
        </View>
      </FieldGroup>
    </Screen>
  );
}
