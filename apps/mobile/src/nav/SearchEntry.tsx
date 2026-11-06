import { useEffect } from "react";
import { Platform, View } from "react-native";
import { router, usePathname } from "expo-router";
import { component, radius, size, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "@/ui/primitives";
import { isAppPath } from "./SideNav";

/**
 * The «Искать везде» line on «Главная» (docs/specs/13 v2 §2.2, 15-flows §3.2): looks like a field, opens /search.
 * On 820/1280 it shows the «/» key that opens it from anywhere (SlashToSearch).
 */
export function SearchEntry() {
  const { t } = useI18n();
  const { c } = useTheme();
  const { wide } = useDevice();
  return (
    <Press
      testID="search-entry"
      onPress={() => router.push("/search")}
      visibleHeight={wide ? component.field.h : component.field.phone}
      accessibilityRole="search"
      accessibilityLabel={t("nav.search")}
      style={{ flexDirection: "row", alignItems: "center", gap: space[2], minHeight: wide ? component.field.h : component.field.phone, paddingHorizontal: space[3], borderRadius: radius.field, borderWidth: component.hairline, borderColor: c.bd, backgroundColor: c.in }}
    >
      <Icon name="search" s={size.iconSm} color={c.mut} />
      <T v="body" tone="mut" numberOfLines={1} style={{ flex: 1 }}>
        {t("nav.search")}
      </T>
      {wide ? (
        <View style={{ borderWidth: component.hairline, borderColor: c.bd, borderRadius: radius.tip, paddingHorizontal: space[1] }}>
          <T v="caption" w="semibold">
            /
          </T>
        </View>
      ) : null}
    </Press>
  );
}

/** 820/1280, web: «/» opens «Искать везде» with the cursor in the field — not while typing, not over a sheet (10-nav-wide клавиши). */
export function SlashToSearch() {
  const { wide } = useDevice();
  const path = usePathname();
  const on = wide && isAppPath(path) && path !== "/search";
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || !on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.defaultPrevented || e.repeat || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      e.preventDefault();
      router.push("/search");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [on]);
  return null;
}
