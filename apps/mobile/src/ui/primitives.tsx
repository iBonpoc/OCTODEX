import { type ReactNode } from "react";
import { Pressable, Text, type PressableProps, type StyleProp, type TextStyle, type ViewStyle, type Insets } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { component, extraIcons, font, icons, iconMeta, motion, size, type StatusName } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";

/* ---------- Text ---------- */
export type TextVariant = Exclude<keyof typeof font.size, "input">;
type Weight = keyof typeof font.families;
type Tone = "ink" | "mut" | "onAcc" | StatusName;

const defaultWeight: Record<TextVariant, Weight> = {
  display: "bold",
  title: "semibold",
  heading: "semibold",
  body: "regular",
  button: "semibold",
  caption: "medium",
  micro: "medium",
};

export function T({
  v = "body",
  w,
  tone = "ink",
  style,
  children,
  numberOfLines,
  tabular,
  center,
}: {
  v?: TextVariant;
  w?: Weight;
  tone?: Tone;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
  tabular?: boolean;
  center?: boolean;
}) {
  const { c } = useTheme();
  const color =
    tone === "ink" ? c.ink : tone === "mut" ? c.mut : tone === "onAcc" ? c.onAcc : c.status[tone].text;
  const fs = font.size[v];
  const lh = v === "display" || v === "title" ? font.lineHeight.tight : font.lineHeight.body;
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: font.families[w ?? defaultWeight[v]],
          fontSize: fs,
          lineHeight: Math.round(fs * lh),
          color,
          fontVariant: tabular ? ["tabular-nums"] : undefined,
          textAlign: center ? "center" : undefined,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/* ---------- Icon ---------- */
export type IconKey = keyof typeof icons | keyof typeof extraIcons;
export function Icon({ name, s = size.iconMd, color }: { name: IconKey; s?: number; color?: string }) {
  const { c } = useTheme();
  const d = (icons as Record<string, string>)[name] ?? (extraIcons as Record<string, string>)[name];
  return (
    <Svg width={s} height={s} viewBox={iconMeta.viewBox} fill="none">
      <Path d={d} stroke={color ?? c.ink} strokeWidth={iconMeta.stroke} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/* ---------- Press: spring scale .95, hit area ≥ 44 ---------- */
export function hitSlopFor(visible: number): Insets {
  const pad = Math.max(0, (component.button.hit - visible) / 2);
  return { top: pad, bottom: pad, left: pad, right: pad };
}

export function Press({
  children,
  style,
  visibleHeight,
  disabled,
  containerStyle,
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** layout style for the outer touch target (flex, alignSelf) */
  containerStyle?: StyleProp<ViewStyle>;
  /** visible height of the control; hit area is extended to 44 */
  visibleHeight?: number;
}) {
  const reduce = useReducedMotion();
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      style={containerStyle}
      hitSlop={visibleHeight ? hitSlopFor(visibleHeight) : undefined}
      onPressIn={(e) => {
        if (!reduce) s.value = withTiming(motion.pressScale, { duration: 80 });
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduce) s.value = withSpring(1, motion.spring);
        rest.onPressOut?.(e);
      }}
    >
      <Animated.View style={[a, style, disabled ? { opacity: component.dimOpacity } : null]}>{children}</Animated.View>
    </Pressable>
  );
}
