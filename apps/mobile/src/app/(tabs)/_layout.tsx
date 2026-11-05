import { Tabs } from "expo-router/js-tabs";
import { TabBar } from "@/nav/TabBar";
import { GuardedScreen } from "@/nav/RouteGuard";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenLayout={(props) => <GuardedScreen {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" } }}
    >
      {/* no `href: null` here: a hidden screen cannot be opened by its address, and «/» fell to the first tab (Visits) */}
      <Tabs.Screen name="index" />
      <Tabs.Screen name="visits" />
      <Tabs.Screen name="triage" />
      <Tabs.Screen name="today" />
      <Tabs.Screen name="inbox" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="clients" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
