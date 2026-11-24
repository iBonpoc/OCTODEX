import { APP_NAME } from "@/config/product";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { BUILD, BUILT_AT } from "@/config/version";
import { versionLabel } from "./versionLabel";
import { useI18n } from "@/i18n";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { T } from "@/ui/primitives";

/** When the running JS bundle was published (EAS Update on the phone; null for the web build). */
function publishedAt(): string | null {
  const fromUpdates = Updates.createdAt?.toISOString?.() ?? null;
  if (fromUpdates) return fromUpdates;
  const m = Constants.manifest2 as { createdAt?: string } | null;
  return m?.createdAt ?? null;
}

export function useVersionLabel(): string {
  const { day, time } = useI18n();
  const version = Constants.expoConfig?.version ?? "1.0.0";
  return versionLabel({ app: APP_NAME, version, build: BUILD, updatedAt: publishedAt(), builtAt: BUILT_AT }, { day, time });
}

/**
 * The version line «GoRix v1.0.0 · 812 · 2026-11-20 08:02» (rule 11: the founder tells which build is open by it) — 12/600 `mut`.
 * Not over the headers any more (visual-v2 «Где строка версии и «Демо»»): at the bottom of the avatar's menu («Ещё») and in
 * «Настройки → О приложении». testID `version-line`.
 */
export function VersionLine({ testID = "version-line" }: { testID?: string }) {
  const label = useVersionLabel();
  const { t } = useI18n();
  return (
    <View testID={testID} accessible accessibilityLabel={`${t("hdr.version")}: ${label}`} style={{ alignItems: "center", paddingVertical: space[2] }}>
      <T v="micro" w="semibold" tone="mut" tabular numberOfLines={1}>
        {label}
      </T>
    </View>
  );
}
