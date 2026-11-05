import { useEffect } from "react";
import { Redirect } from "expo-router";
import { useStore } from "@/data/store";
import { roleHome } from "@/nav/roles";
import { useNavMenu } from "@/nav/NavMenu";

/** The old «More» tab (/more): its places moved to the ☰ menu (docs/specs/13 §2.3). Opens the role's home with ☰ open. */
export default function MoreRedirect() {
  const { role } = useStore();
  const menu = useNavMenu();
  useEffect(() => {
    menu.open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Redirect href={`/${roleHome[role]}`} />;
}
