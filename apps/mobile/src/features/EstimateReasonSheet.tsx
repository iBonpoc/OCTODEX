import { useEffect, useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { Button, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet } from "@/ui/overlays";

/**
 * A reason before an action on a client-signed estimate (docs/specs/07 «E2b»): «don't sign — change it» or «decline».
 * The reason stays in the estimate history; the client never sees it.
 */
export function EstimateReasonSheet({
  visible,
  onClose,
  title,
  hint,
  confirmLabel,
  required,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  hint: string;
  confirmLabel: string;
  /** a decline needs a reason; «change it» may go without */
  required?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  useEffect(() => {
    if (visible) setText("");
  }, [visible]);
  const ok = !required || text.trim().length > 1;
  return (
    <Sheet visible={visible} onClose={onClose} title={title} dirty={text.trim().length > 0}>
      <View style={{ gap: space[3] }}>
        <T v="caption" tone="mut">
          {hint}
        </T>
        <TextField type="note" value={text} onChangeText={setText} placeholder={t("est.reason.placeholder")} />
        <Button
          label={confirmLabel}
          full
          disabled={!ok}
          onPress={() => {
            onConfirm(text.trim());
            onClose();
          }}
        />
      </View>
    </Sheet>
  );
}
