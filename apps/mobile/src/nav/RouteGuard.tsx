import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { useToast } from "@/ui/overlays";
import { canOpen, roleHome } from "./roles";

/**
 * Screens by role (routeRoles in ./roles): a screen this role may not open — by a link, a typed address or the
 * browser's history — sends it to its home screen with a toast «Нет доступа». Until the redirect lands, a plain
 * cover hides the screen, so a technician never sees the company's money even for a frame.
 */
export function RouteGuard() {
  const path = usePathname();
  const { role } = useStore();
  const { t } = useI18n();
  const { c } = useTheme();
  const toast = useToast();
  const allowed = canOpen(role, path);
  useEffect(() => {
    if (allowed) return;
    // after the navigator is mounted (it is a sibling rendered before this one)
    const id = setTimeout(() => {
      router.replace(`/${roleHome[role]}`);
      toast.show(t("guard.noAccess"));
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, path, role]);
  if (allowed) return null;
  return <View testID="route-guard" style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]} />;
}
