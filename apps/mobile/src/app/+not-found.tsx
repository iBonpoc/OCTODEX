import { Redirect } from "expo-router";

/** Unknown path (e.g. the web build opened from a sub-path or a stale link): go to the role's home. */
export default function NotFound() {
  return <Redirect href="/" />;
}
