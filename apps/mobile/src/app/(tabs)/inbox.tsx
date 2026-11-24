import { Redirect, useLocalSearchParams } from "expo-router";

/** The old «Sales» address (/inbox?tab=…): the lists now live on /leads (docs/specs/13а §2). Kept for old links. */
export default function InboxRedirect() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  // #2273: one hop — estimates and invoices straight to their sections (not through /leads?tab=…)
  const to = tab === "estimates" ? "/estimates" : tab === "invoices" ? "/invoice" : tab ? `/leads?tab=${tab}` : "/leads";
  return <Redirect href={to} />;
}
