import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Onest_400Regular, Onest_500Medium, Onest_600SemiBold, Onest_700Bold } from "@expo-google-fonts/onest";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { I18nProvider } from "@/i18n";
import { StoreProvider } from "@/data/store";
import { AuthProvider } from "@/cloud/auth";
import { ToastProvider } from "@/ui/overlays";
import { HintsProvider } from "@/ui/hints";
import { PushBridge } from "@/features/PushBridge";
import { NoticeWatcher } from "@/features/notices";
import { GuardedScreen, RouteGuard } from "@/nav/RouteGuard";
import { NavMenuProvider } from "@/nav/NavMenu";
import { SideNav } from "@/nav/SideNav";
import { TabBar } from "@/nav/TabBar";
import { ClosedCompanyNotice } from "@/nav/ClosedCompanyNotice";
import { SlashToSearch } from "@/nav/SearchEntry";
import { LegalGate } from "@/nav/LegalGate";

function Shell() {
  const { c, name } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <StatusBar style={name === "dark" ? "light" : "dark"} />
      <ToastProvider>
        <NavMenuProvider>
          <NoticeWatcher />
          <SlashToSearch />
          {/* 820/1280: the side menu next to every screen (docs/specs/13 §2.5); the phone: nothing here */}
          <View style={{ flex: 1, flexDirection: "row" }}>
            <SideNav />
            <View style={{ flex: 1 }}>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} screenLayout={(props) => <GuardedScreen {...props} />} />
              {/* the phone's bottom bar over every screen but forms (docs/specs/28); 820/1280: SideNav instead */}
              <TabBar />
              <RouteGuard />
              <LegalGate />
              {/* 7а-3 «в»: once per company its owner closed (docs/specs/22 §3.6) */}
              <ClosedCompanyNotice />
            </View>
          </View>
        </NavMenuProvider>
      </ToastProvider>
    </View>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({ Onest_400Regular, Onest_500Medium, Onest_600SemiBold, Onest_700Bold });
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>
              <StoreProvider>
                <HintsProvider>
                  {/* pushes: a tap opens its record; the token is registered again (docs/specs/27-push.md §5) */}
                  <PushBridge />
                  <Shell />
                </HintsProvider>
              </StoreProvider>
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
