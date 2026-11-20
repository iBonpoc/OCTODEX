/**
 * «Графит» — пилот витрины (#2254), НЕ ПРАВИЛО. Its own theme, text and press: the pilot does not touch src/ui or the
 * «Наряд» tokens; it reads only `graphite` (packages/design-tokens/src/graphite.ts). Roll-back = delete this folder.
 * The guard (test/designSystem.test.ts, PILOT_GRAPHITE) lets this folder have its own Text / Pressable / TextInput / Modal;
 * the tokens-only rules hold here as everywhere.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Pressable,
  Text,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  graphite,
  type GraphiteColors,
  type ThemeName,
} from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";

export type GrThemePref = "system" | ThemeName;

interface GrCtx {
  name: ThemeName;
  g: GraphiteColors;
  pref: GrThemePref;
  setPref: (p: GrThemePref) => void;
  reduceMotion: boolean;
  reduceTransparency: boolean;
}

const Ctx = createContext<GrCtx | null>(null);

/** the one curve of the pilot (handoff §2.8) */
export const grEase = Easing.bezier(...graphite.motion.curve);

/** a duration under «уменьшить движение»: only opacity, `reduced` ms, linear */
export function grTiming(ms: number, reduce: boolean) {
  return reduce
    ? { duration: graphite.motion.reduced, easing: Easing.linear }
    : { duration: ms, easing: grEase };
}

function useReduceTransparency(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then((v) => live && setOn(!!v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      (v: boolean) => setOn(!!v),
    );
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  return on;
}

/** «Как в системе» follows the app's theme (the system one, or what the person chose in Settings); the pilot's own switch overrides it */
export function GraphiteProvider({ children }: { children: ReactNode }) {
  const app = useTheme();
  const [pref, setPref] = useState<GrThemePref>("system");
  const reduceMotion = useReducedMotion();
  const reduceTransparency = useReduceTransparency();
  const name: ThemeName = pref === "system" ? app.name : pref;
  const value = useMemo(
    () => ({
      name,
      g: graphite.themes[name],
      pref,
      setPref,
      reduceMotion,
      reduceTransparency,
    }),
    [name, pref, reduceMotion, reduceTransparency],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGr(): GrCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGr outside GraphiteProvider");
  return v;
}

type Variant = keyof typeof graphite.font.size;
type Weight = keyof typeof graphite.font.family;
type Tone = keyof GraphiteColors;

/** Jost text; tabular figures always (handoff §2.3) */
export function GrText({
  v = "body",
  w = "regular",
  tone = "text",
  center,
  lines,
  style,
  children,
}: {
  v?: Variant;
  w?: Weight;
  tone?: Tone;
  center?: boolean;
  lines?: number;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
}) {
  const { g } = useGr();
  const f = graphite.font;
  return (
    <Text
      numberOfLines={lines}
      style={[
        {
          fontFamily: f.family[w],
          fontSize: f.size[v],
          lineHeight: f.lineHeight[v],
          letterSpacing: v === "display" ? f.displayTracking : undefined,
          color: g[tone],
          fontVariant: ["tabular-nums"],
          textAlign: center ? "center" : undefined,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** a press: scale 0.97 and 16 % darker in 80 ms, back in 150 ms (handoff §2.8); the hit area never under 44 */
export function GrPress({
  children,
  style,
  visible,
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  visible?: number;
}) {
  const { reduceMotion } = useGr();
  const p = useSharedValue(0);
  const m = graphite.motion;
  const a = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - m.pressScale) * p.value }],
    opacity: 1 - m.pressDim * p.value,
  }));
  const pad =
    visible && visible < graphite.size.control
      ? (graphite.size.control - visible) / 2
      : 0;
  return (
    <Pressable
      {...rest}
      hitSlop={
        pad ? { top: pad, bottom: pad, left: pad, right: pad } : undefined
      }
      onPressIn={(e) => {
        p.value = reduceMotion
          ? 0
          : withTiming(1, { duration: m.pressIn, easing: grEase });
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        p.value = withTiming(0, { duration: m.pressOut, easing: grEase });
        rest.onPressOut?.(e);
      }}
    >
      <Animated.View style={[a, style]}>{children}</Animated.View>
    </Pressable>
  );
}
