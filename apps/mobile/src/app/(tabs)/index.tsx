import { Redirect } from "expo-router";
import { useStore } from "@/data/store";
import { roleHome } from "@/nav/roles";

/** Entry: open the home screen of the current role. */
export default function Index() {
  const { role } = useStore();
  return <Redirect href={`/${roleHome[role]}`} />;
}
