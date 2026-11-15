import { APP_NAME } from "@/config/product";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { usePathname } from "expo-router";
import { BUILD, BUILT_AT } from "@/config/version";
import { versionLabel } from "./versionLabel";
import { useI18n } from "@/i18n";
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

/** Small line at the top of every screen header; hidden on the client page (/p/…) and the request page (/f/…). */
export function VersionBadge() {
  const label = useVersionLabel();
  const path = usePathname();
  if (path.startsWith("/p/") || path.startsWith("/f/")) return null;
  return (
    <T v="micro" tone="mut" tabular numberOfLines={1}>
      {label}
    </T>
  );
}
