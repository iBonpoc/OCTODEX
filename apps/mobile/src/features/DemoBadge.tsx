import { View } from "react-native";
import { router, usePathname } from "expo-router";
import { useAuth } from "@/cloud/auth";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { StatusChip } from "@/ui/controls";
import { Press } from "@/ui/primitives";
import { component } from "@octo/design-tokens";
import { demoBadgeTarget, showsDemoBadge } from "./demoBadge";

/**
 * A permanent strip in every screen's header while the app runs in the demo (#1183): «Демо · данные только на этом
 * телефоне», status `warn` (mark + word). A tap goes to sign-in («Войти или создать компанию»), or — when the person is signed in but has no company — to creating one.
 * `always` — the showcase sample: the showcase is open to the director too, who is in the cloud and would see nothing.
 */
export function DemoBadge({ always }: { always?: boolean }) {
  const { mode } = useStore();
  const path = usePathname();
  const { t } = useI18n();
  const auth = useAuth();
  if (!always && !showsDemoBadge(mode, path)) return null;
  return (
    <View testID="demo-badge" style={{ alignSelf: "flex-start" }}>
      <Press
        onPress={() => router.push(demoBadgeTarget(!!auth.session))}
        visibleHeight={component.chip.h}
        accessibilityRole="button"
        accessibilityLabel={`${t("demo.badge")}. ${t("demo.badgeAction")}`}
      >
        <StatusChip status="warn" label={t("demo.badge")} />
      </Press>
    </View>
  );
}
