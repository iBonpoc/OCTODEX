import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { usePathname } from "expo-router";
import { BUILD } from "@/config/version";
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
  const v = Constants.expoConfig?.version ?? "1.0.0";
  const at = publishedAt();
  return `OCTODEX v${v} · ${BUILD || "dev"}${at ? ` · ${day(at)} ${time(at)}` : ""}`;
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
