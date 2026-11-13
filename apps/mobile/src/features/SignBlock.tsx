import { useState } from "react";
import { View } from "react-native";
import { space, size } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { SignaturePad } from "./SignaturePad";
import { TextField, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";

/** Client name + E-SIGN consent + finger signature (client page and on-site signing). */
export function SignBlock({ onSign, defaultName = "", busy }: { onSign: (name: string, svg: string) => void; defaultName?: string; busy?: boolean }) {
  const { t } = useI18n();
  const [name, setName] = useState(defaultName);
  const [consent, setConsent] = useState(false);
  const ready = name.trim().length > 1 && consent && !busy;
  return (
    <View style={{ gap: space[3] }}>
      <TextField type="name" value={name} onChangeText={setName} placeholder={t("portal.name")} icon="user" />
      <RowView style={{ minHeight: size.hitMin, alignItems: "center" }}>
        <T v="caption" style={{ flex: 1 }}>
          {t("portal.consent")}
        </T>
        <Toggle label={t("portal.consent")} on={consent} onChange={setConsent} />
      </RowView>
      {!ready ? (
        <T v="caption" tone="mut">
          {t("portal.need")}
        </T>
      ) : null}
      {/* #1324: the right to cancel — as on the contract PDF: large, bold, right before the signature (B&P §7159) */}
      <View testID="sign-rescission">
        <T v="heading" w="bold">
          {t("est.rescission")}
        </T>
      </View>
      <SignaturePad consent="est.signConsent" confirmLabel={t("portal.approve")} disabled={!ready} onConfirm={(svg) => onSign(name.trim(), svg)} />
    </View>
  );
}
