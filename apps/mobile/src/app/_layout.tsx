import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Onest_400Regular, Onest_500Medium, Onest_600SemiBold, Onest_700Bold } from "@expo-google-fonts/onest";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { I18nProvider } from "@/i18n";
import { StoreProvider } from "@/data/store";
import { ToastProvider } from "@/ui/overlays";

function Shell() {
  const { c, name } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <StatusBar style={name === "dark" ? "light" : "dark"} />
      <ToastProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />
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
            <StoreProvider>
              <Shell />
            </StoreProvider>
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
