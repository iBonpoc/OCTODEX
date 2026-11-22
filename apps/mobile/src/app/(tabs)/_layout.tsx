import { Tabs } from "expo-router/js-tabs";
import { useReducedMotion } from "react-native-reanimated";
import { GuardedScreen } from "@/nav/RouteGuard";
import { tabTransition } from "@/nav/tabTransition";

export default function TabsLayout() {
  const reduce = useReducedMotion();
  return (
    <Tabs
      // the bar is drawn by the shell on every phone screen, not only on these (app/_layout.tsx, docs/specs/28)
      tabBar={() => null}
      // back walks the tabs as they were opened (Leads from «Ещё» → «Ещё»), not always to the first tab (docs/specs/28)
      backBehavior="history"
      screenLayout={(props) => <GuardedScreen {...props} />}
      // a tab change fades in (motion.durFast), reduced motion — at once; going deeper slides (the root Stack)
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" }, ...tabTransition(reduce) }}
    >
      {/* no `href: null` here: a hidden screen cannot be opened by its address, and «/» fell to the first tab (Visits) */}
      <Tabs.Screen name="index" />
      <Tabs.Screen name="visits" />
      <Tabs.Screen name="triage" />
      <Tabs.Screen name="today" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="clients" />
      <Tabs.Screen name="leads" />
      {/* old addresses: «Продажи» (/inbox → /leads) and «Ещё» (/more → ☰), docs/specs/13а §2 */}
      <Tabs.Screen name="inbox" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
