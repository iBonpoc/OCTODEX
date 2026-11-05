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

/**
 * `screenLayout` of the tab bar and the root Stack: a screen this role may not open is not rendered at all.
 * The tab navigator keeps a visited tab mounted (hidden) after the redirect, so without this the technician's page
 * still held Today's amounts in the DOM (found by the list-cards chat on #131). Route names are file paths:
 * "today", "company/[section]", "figures/[metric]" — the first part is the key of routeRoles.
 */
export function GuardedScreen({ route, children }: { route: { name: string }; children: React.ReactNode }) {
  const { role } = useStore();
  return <>{canOpen(role, `/${route.name}`) ? children : null}</>;
}
