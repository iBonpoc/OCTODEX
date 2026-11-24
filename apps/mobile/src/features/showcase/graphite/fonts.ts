/**
 * «Графит» (#2292): Jost is loaded here, by the pilot only (the rest of the app's start is not touched). One file per weight:
 * the package root would bring all 18 weights into the bundle (≈1.1 MB); we need three.
 */
import { useFonts } from "expo-font";
import { Jost_300Light } from "@expo-google-fonts/jost/300Light";
import { Jost_400Regular } from "@expo-google-fonts/jost/400Regular";
import { Jost_500Medium } from "@expo-google-fonts/jost/500Medium";

/** `true` once the three weights are ready */
export function useGrFonts(): boolean {
  const [loaded] = useFonts({ Jost_300Light, Jost_400Regular, Jost_500Medium });
  return loaded;
}
