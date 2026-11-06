import { useCallback } from "react";
import { Redirect, useFocusEffect } from "expo-router";
import { useStore } from "@/data/store";
import { roleHome } from "@/nav/roles";
import { useNavMenu } from "@/nav/NavMenu";
import { useDevice } from "@/theme/ThemeProvider";

/** The old «More» tab (/more): its places moved to the ☰ menu (docs/specs/13 §2.3). Opens the role's home with ☰ open. */
export default function MoreRedirect() {
  const { role } = useStore();
  const menu = useNavMenu();
  const { device } = useDevice();
  // every visit (the tab navigator keeps this screen mounted, a mount-only effect opened ☰ the first time only)
  useFocusEffect(
    useCallback(() => {
      // 1280: the side menu opens in place; phone and 820: the ☰ drawer
      if (device === "desktop") {
        if (!menu.sideOpen) menu.toggleSide();
      } else menu.open();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
  return <Redirect href={`/${roleHome[role]}`} />;
}
