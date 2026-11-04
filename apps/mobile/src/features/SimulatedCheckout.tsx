import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { Labeled } from "./fields";
import { Button, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet } from "@/ui/overlays";
import { RowView } from "@/ui/surfaces";

/**
 * Stripe Checkout imitation (test mode): the client sees a card form, nothing is charged.
 * Founder's decision 04.11: build the app first; the real Stripe Payment Element replaces this later.
 */
export function SimulatedCheckout({
  visible,
  amountCents,
  title,
  onClose,
  onPaid,
}: {
  visible: boolean;
  amountCents: number;
  title: string;
  onClose: () => void;
  onPaid: () => Promise<void> | void;
}) {
  const { t, money } = useI18n();
  const [card, setCard] = useState("4242 4242 4242 4242");
  const [exp, setExp] = useState("12/30");
  const [cvc, setCvc] = useState("123");
  const [zip, setZip] = useState("91105");
  const [busy, setBusy] = useState(false);
  const ok = card.replace(/\D/g, "").length >= 15 && /^\d{2}\/\d{2}$/.test(exp) && cvc.length >= 3;
  return (
    <Sheet visible={visible} onClose={onClose} title={t("pay.checkout")}>
      <View style={{ gap: space[3] }}>
        <StatusChip status="warn" label={t("pay.testMode")} />
        <T v="caption" tone="mut">
          {t("pay.testModeHint")}
        </T>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="body" tone="mut">
            {title}
          </T>
          <T v="title" tabular>
            {money(amountCents)}
          </T>
        </RowView>
        <Labeled label={t("pay.cardNumber")}>
          <TextField value={card} onChangeText={setCard} placeholder="4242 4242 4242 4242" keyboardType="phone-pad" icon="wallet" />
        </Labeled>
        <RowView>
          <Labeled label={t("pay.exp")}>
            <TextField value={exp} onChangeText={setExp} placeholder="MM/YY" keyboardType="phone-pad" />
          </Labeled>
          <Labeled label="CVC">
            <TextField value={cvc} onChangeText={setCvc} placeholder="123" keyboardType="phone-pad" />
          </Labeled>
          <Labeled label="ZIP">
            <TextField value={zip} onChangeText={setZip} placeholder="ZIP" keyboardType="phone-pad" />
          </Labeled>
        </RowView>
        <Button
          label={t("pay.payAmount", { amount: money(amountCents) })}
          icon="check"
          full
          disabled={!ok || busy}
          onPress={async () => {
            setBusy(true);
            try {
              await onPaid();
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </Sheet>
  );
}
