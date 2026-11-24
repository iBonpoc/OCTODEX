/**
 * «Демо» in the one header (docs/design/visual-v2.html «Где строка версии и «Демо»»; #1183 п.1): not a strip of its own any more —
 * a plate `warn` 20 («● Демо», 12/600) in the smallest line of the header (a root: next to the date; an object: next to the parent's
 * word; an editor: the word in its state line), and once the header has folded — a dot 6 `warn` on the avatar / at «←».
 * A tap goes where the strip went: sign-in, or creating a company when the person is signed in without one (`demoBadgeTarget`).
 * Shown only in the demo, never on the client's pages and the sign-in pages (`showsDemoBadge`).
 */
import { View, type ViewStyle } from "react-native";
import { router, usePathname } from "expo-router";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { component, radius, space } from "@octo/design-tokens";
import { useAuth } from "@/cloud/auth";
import { useStore } from "@/data/store";
import { demoBadgeTarget, showsDemoBadge } from "@/features/demoBadge";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Press, T } from "../primitives";

/** whether the demo is on here, its short word, what a tap does and what VoiceOver reads */
export function useDemo(always?: boolean) {
  const { mode } = useStore();
  const path = usePathname();
  const { t } = useI18n();
  const auth = useAuth();
  return {
    shown: !!always || showsDemoBadge(mode, path),
    word: t("hdr.demo"),
    label: `${t("demo.badge")}. ${t("demo.badgeAction")}`,
    go: () => router.push(demoBadgeTarget(!!auth.session)),
  };
}

/** the plate «● Демо» 20 (`warn`: the dot and the word — rule 2, never a colour alone); testID `demo-badge` as the strip had */
export function DemoPlate({ always, testID = "demo-badge" }: { always?: boolean; testID?: string }) {
  const { c } = useTheme();
  const d = useDemo(always);
  if (!d.shown) return null;
  const tone = c.status.warn;
  const H = component.header.demo;
  return (
    <View testID={testID} style={{ alignSelf: "center" }}>
      <Press onPress={d.go} visibleHeight={H.h} accessibilityRole="button" accessibilityLabel={d.label}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[1], height: H.h, paddingHorizontal: H.px, borderRadius: radius.pill, backgroundColor: tone.fill }}>
          <View style={{ width: H.dot, height: H.dot, borderRadius: radius.pill, backgroundColor: tone.on }} />
          <T v="micro" w="semibold" capped numberOfLines={1} style={{ color: tone.on }}>
            {d.word}
          </T>
        </View>
      </Press>
    </View>
  );
}

/**
 * The folded header's dot 6 `warn` on the corner of the avatar / «←» (`opacity` — how far the plate with the word has gone:
 * the dot comes in as the word leaves; a word is still there for VoiceOver on the button it sits on). Draws nothing outside the demo.
 */
export function DemoDot({ opacity, always, style }: { opacity?: SharedValue<number>; always?: boolean; style?: ViewStyle }) {
  const { c } = useTheme();
  const d = useDemo(always);
  const look = useAnimatedStyle(() => ({ opacity: opacity ? opacity.value : 1 }), [opacity]);
  if (!d.shown) return null;
  const s = component.header.demo.dot;
  return (
    <Animated.View
      testID="demo-dot"
      pointerEvents="none"
      style={[
        { position: "absolute", top: 0, right: 0, width: s + 2 * component.header.ringGap, height: s + 2 * component.header.ringGap, borderRadius: radius.pill, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" },
        style,
        look,
      ]}
    >
      <View style={{ width: s, height: s, borderRadius: radius.pill, backgroundColor: c.status.warn.text }} />
    </Animated.View>
  );
}
