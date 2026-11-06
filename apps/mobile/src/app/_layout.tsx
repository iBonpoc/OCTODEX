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
import { NoticeWatcher } from "@/features/notices";
import { GuardedScreen, RouteGuard } from "@/nav/RouteGuard";
import { NavMenuProvider } from "@/nav/NavMenu";

function Shell() {
  const { c, name } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <StatusBar style={name === "dark" ? "light" : "dark"} />
      <ToastProvider>
        <NavMenuProvider>
          <NoticeWatcher />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} screenLayout={(props) => <GuardedScreen {...props} />} />
          <RouteGuard />
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
