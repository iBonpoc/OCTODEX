import { Tabs } from "expo-router/js-tabs";
import { TabBar } from "@/nav/TabBar";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" } }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
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
