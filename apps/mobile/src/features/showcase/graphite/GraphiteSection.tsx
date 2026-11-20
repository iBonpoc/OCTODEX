/**
 * «Графит» — пилот витрины (#2254), НЕ ПРАВИЛО: the section «Графит (пилот)» of the showcase. Shown only when the switch
 * on the showcase's first screen is on (flag.ts). The section itself is «Наряд» (src/ui); the button opens the pilot screen
 * full-screen, in its own look. Jost is loaded here, not at the app's start: the rest of the app is not touched.
 */
import { useState } from "react";
import { Modal, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
// one file per weight: the package root would bring all 18 weights into the bundle (≈1.1 MB); we need three
import { useFonts } from "expo-font";
import { Jost_300Light } from "@expo-google-fonts/jost/300Light";
import { Jost_400Regular } from "@expo-google-fonts/jost/400Regular";
import { Jost_500Medium } from "@expo-google-fonts/jost/500Medium";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { ALL_ORIENTATIONS } from "@/ui/overlays";
import { Card } from "@/ui/surfaces";
import { GraphiteScreen } from "./GraphiteScreen";
import { GraphiteProvider } from "./theme";

export function GraphiteSection() {
  const { t } = useI18n();
  const [loaded] = useFonts({ Jost_300Light, Jost_400Regular, Jost_500Medium });
  const [open, setOpen] = useState(false);
  return (
    <View testID="showcase-graphite" style={{ flex: 1 }}>
      <Card>
        <T v="body">{t("ds.gr.intro")}</T>
        <Button
          testID="gr-open"
          label={t("ds.gr.open")}
          onPress={() => setOpen(true)}
          disabled={!loaded}
        />
      </Card>
      <Modal
        visible={open && loaded}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
        supportedOrientations={ALL_ORIENTATIONS}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <GraphiteProvider>
              <GraphiteScreen onClose={() => setOpen(false)} />
            </GraphiteProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}
