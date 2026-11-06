import { Redirect, useLocalSearchParams } from "expo-router";

/** The old «Sales» address (/inbox?tab=…): the lists now live on /leads (docs/specs/13а §2). Kept for old links. */
export default function InboxRedirect() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return <Redirect href={tab ? `/leads?tab=${tab}` : "/leads"} />;
}
