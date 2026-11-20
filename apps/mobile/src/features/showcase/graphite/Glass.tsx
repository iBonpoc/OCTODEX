/**
 * «Графит» — пилот витрины (#2254). Two kinds of glass (handoff §2.2, §3 п.1–2):
 * - matte («Матовое», --glassT 55): panels, fields, buttons — expo-blur + fill + 1 pt edge;
 * - liquid: only the bottom nav, the 44 header circles, a segment track — native on iOS 26 (expo-glass-effect, the same
 *   safe loader as the tab bar: nav/tabGlass.ts), else matte blur + `gl` fill + three-layer rim.
 * «Уменьшить прозрачность»: both become solid (panelSolid / glSolid). While a surface moves, its blur is off and the fill
 * denser (`still`, handoff §3 п.21).
 */
import { type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { graphite } from "@octo/design-tokens";
import { deviceTabSurface, liquidGlassView } from "@/nav/tabGlass";
import { useGr } from "./theme";

export type GlassMode = "native" | "matte" | "solid";

/** which glass the liquid places get on this device now */
export function useGlassMode(): GlassMode {
  const { reduceTransparency } = useGr();
  if (reduceTransparency) return "solid";
  return deviceTabSurface() === "liquid" ? "native" : "matte";
}

const edge = graphite.size.edge;

export function GrMatte({
  radius = graphite.radius.card,
  still,
  style,
  children,
  testID,
}: {
  radius?: number;
  /** moving now: no blur, denser fill */
  still?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
}) {
  const { g, name, reduceTransparency } = useGr();
  const solid = reduceTransparency;
  return (
    <View
      testID={testID}
      style={[
        {
          borderRadius: radius,
          overflow: "hidden",
          borderWidth: edge,
          borderColor: solid ? g.border : g.panelEdge,
        },
        solid ? { backgroundColor: g.panelSolid } : null,
        style,
      ]}
    >
      {solid ? null : still ? (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: g.sheetBg }]}
        />
      ) : (
        <>
          <BlurView
            intensity={graphite.glass.intensity}
            tint={name}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: g.panel }]}
          />
        </>
      )}
      {children}
    </View>
  );
}

export function GrLiquid({
  radius,
  style,
  children,
  testID,
}: {
  radius: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
}) {
  const { g, name } = useGr();
  const mode = useGlassMode();
  if (mode === "native") {
    const GlassView = liquidGlassView();
    return (
      <GlassView
        testID={testID}
        glassEffectStyle="regular"
        colorScheme={name}
        style={[{ borderRadius: radius, overflow: "hidden" }, style]}
      >
        {children}
      </GlassView>
    );
  }
  if (mode === "solid") {
    return (
      <View
        testID={testID}
        style={[
          {
            borderRadius: radius,
            overflow: "hidden",
            backgroundColor: g.glSolid,
            borderWidth: edge,
            borderColor: g.border,
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }
  return (
    <View
      testID={testID}
      style={[
        {
          borderRadius: radius,
          overflow: "hidden",
          borderWidth: edge,
          borderColor: g.glRimLine,
        },
        style,
      ]}
    >
      <BlurView
        intensity={graphite.glass.liquidIntensity}
        tint={name}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: g.gl }]} />
      {/* the rim: light from the top-left, a softer edge bottom-right */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radius,
            borderTopWidth: edge,
            borderLeftWidth: edge,
            borderBottomWidth: edge,
            borderRightWidth: edge,
            borderTopColor: g.glRimHi,
            borderLeftColor: g.glRimHi,
            borderBottomColor: g.glRimLo,
            borderRightColor: g.glRimLo,
          },
        ]}
      />
      {children}
    </View>
  );
}
