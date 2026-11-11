import { useState } from "react";
import { View } from "react-native";
import { layout, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { Icon, T } from "@/ui/primitives";
import { Button } from "@/ui/controls";

/**
 * The device did not give back what it keeps (A-01, #756): the store is not loaded and writes nothing, so the outbox on
 * the phone stays as it is. «Повторить» only reads again. A broken record (`onSalvage`): «Сохранить копию и продолжить»
 * — after a confirmation its copy is kept on the device and the app starts without it (review of #910 №1).
 * Rendered by StoreProvider instead of the app (no store here).
 */
export function StorageReadError({ onRetry, onSalvage, notSaved }: { onRetry: () => void; onSalvage?: (() => void) | null; notSaved?: boolean }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  return (
    <View testID="storage-read-error" style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: space[6] }}>
      <View style={{ width: "100%", maxWidth: layout.contentMax, alignItems: "center", gap: space[3] }}>
        <Icon name="alert" s={size.iconLg} color={c.status.bad.text} />
        <T v="heading" center>
          {t("storage.readFailed.title")}
        </T>
        <T v="body" tone="mut" center>
          {t(onSalvage ? "storage.corrupt.body" : "storage.readFailed.body")}
        </T>
        {asking && onSalvage ? (
          <View testID="storage-salvage-confirm" style={{ alignItems: "center", gap: space[3] }}>
            <T v="body" center>
              {t("storage.corrupt.confirm")}
            </T>
            {notSaved ? (
              // the copy was refused (full storage): «Продолжить» did nothing — say why and what to do
              <View testID="storage-salvage-failed" style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
                <Icon name="alert" s={size.iconSm} color={c.status.bad.text} />
                <T v="body" w="semibold" style={{ color: c.status.bad.text, flexShrink: 1 }}>
                  {t("storage.corrupt.noSpace")}
                </T>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space[2] }}>
              <View testID="storage-salvage-cancel">
                <Button variant="secondary" label={t("storage.corrupt.cancel")} onPress={() => setAsking(false)} />
              </View>
              <View testID="storage-salvage-yes">
                <Button variant="danger" label={t("storage.corrupt.confirmYes")} onPress={onSalvage} />
              </View>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space[2] }}>
            <View testID="storage-read-retry">
              <Button variant={onSalvage ? "secondary" : "primary"} label={t("storage.readFailed.retry")} onPress={onRetry} />
            </View>
            {onSalvage ? (
              <View testID="storage-salvage">
                <Button label={t("storage.corrupt.salvage")} onPress={() => setAsking(true)} />
              </View>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}
