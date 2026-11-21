import { router } from "expo-router";
import { useI18n } from "@/i18n";
import { IconButton } from "@/ui/controls";
import type { IconAction } from "@/ui/templates/types";

/** the one way into search (prototype v2, BUILD-PLAN §2 п.4): /search opens with the keyboard up */
export const openSearch = () => router.push("/search");

/**
 * Search is an icon in the header, not a tab (prototype v2; HIG check п.4): on «Главная» (HomeHeader) and in the lists.
 * A list passes it to its Screen: `<Screen headerIcons={[searchIcon]} …>` — left of «＋», «⋯» stays the last (DS §12.2).
 */
export function useSearchIcon(): IconAction {
  const { t } = useI18n();
  return { icon: "search", a11y: t("nav.searchTab"), onPress: openSearch, testID: "hdr-search" };
}

/** the same icon as a button (HomeHeader: search · bell · avatar) */
export function SearchIcon() {
  const a = useSearchIcon();
  return <IconButton testID={a.testID} icon={a.icon} label={a.a11y} onPress={a.onPress} bare />;
}
