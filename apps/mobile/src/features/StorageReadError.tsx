import { View } from "react-native";
import { layout, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { Icon, T } from "@/ui/primitives";
import { Button } from "@/ui/controls";

/**
 * The device did not give back what it keeps (A-01, #756): the store is not loaded and writes nothing, so the outbox on
 * the phone stays as it is. «Повторить» only reads again. Rendered by StoreProvider instead of the app (no store here).
 */
export function StorageReadError({ onRetry }: { onRetry: () => void }) {
  const { c } = useTheme();
  const { t } = useI18n();
  return (
    <View testID="storage-read-error" style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: space[6] }}>
      <View style={{ width: "100%", maxWidth: layout.contentMax, alignItems: "center", gap: space[3] }}>
        <Icon name="alert" s={size.iconLg} color={c.status.bad.text} />
        <T v="heading" center>
          {t("storage.readFailed.title")}
        </T>
        <T v="body" tone="mut" center>
          {t("storage.readFailed.body")}
        </T>
        <Button label={t("storage.readFailed.retry")} onPress={onRetry} />
      </View>
    </View>
  );
}
