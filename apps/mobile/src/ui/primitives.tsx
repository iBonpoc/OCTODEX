import { type ReactNode, useId } from "react";
import { Pressable, Text, type PressableProps, type StyleProp, type TextStyle, type ViewStyle, type Insets } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Defs, G, Mask, Path } from "react-native-svg";
import { component, extraIcons, font, iconLayers, icons, iconMeta, motion, size, type IconLayers, type StatusName } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";

/* ---------- Text ---------- */
export type TextVariant = Exclude<keyof typeof font.size, "input">;
type Weight = keyof typeof font.families;
type Tone = "ink" | "mut" | "onAcc" | StatusName;

/** visual v2 (docs/design/visual-v2.html «Шрифт»): the title 30/600, a figure 26 · 18/700, a card 17/700, text 15/500, the second
 *  line 13/500, a caption 12/600 */
const defaultWeight: Record<TextVariant, Weight> = {
  display: "semibold",
  title: "bold",
  heading: "bold",
  body: "medium",
  button: "bold",
  caption: "medium",
  micro: "semibold",
  figure: "bold",
  figureSm: "bold",
};
/** the letter spacing of a size (v2: the title −0.02 em, a figure −0.01 em) */
const trackingOf = (v: TextVariant, fs: number) =>
  v === "display" ? fs * font.tracking.display : v === "figure" || v === "figureSm" || v === "title" ? fs * font.tracking.figure : undefined;

export function T({
  v = "body",
  w,
  tone = "ink",
  style,
  children,
  numberOfLines,
  tabular,
  center,
  capped,
  fit,
}: {
  v?: TextVariant;
  w?: Weight;
  tone?: Tone;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
  tabular?: boolean;
  center?: boolean;
  /** a label in a fixed shape (StatusPill, QuickActions, a day pill, tab labels): Dynamic Type grows it at most `font.labelMaxScale` (BUILD-SPEC §0) */
  capped?: boolean;
  /** one line that shrinks to fit (down to `font.fitMinScale`) before it is cut: a screen's title (iOS / Android; the web cuts with «…») */
  fit?: boolean;
}) {
  const { c } = useTheme();
  const color =
    tone === "ink" ? c.ink : tone === "mut" ? c.mut : tone === "onAcc" ? c.onAcc : c.status[tone].text;
  const fs = font.size[v];
  const lh = v === "display" || v === "title" || v === "figure" || v === "figureSm" ? font.lineHeight.tight : font.lineHeight.body;
  return (
    <Text
      numberOfLines={fit ? 1 : numberOfLines}
      adjustsFontSizeToFit={fit || undefined}
      minimumFontScale={fit ? font.fitMinScale : undefined}
      maxFontSizeMultiplier={capped ? font.labelMaxScale : undefined}
      style={[
        {
          fontFamily: font.families[w ?? defaultWeight[v]],
          fontSize: fs,
          lineHeight: Math.round(fs * lh),
          color,
          // v2: figures are tabular everywhere (a column of sums, a timer lines up); `tabular={false}` keeps the proportional ones
          fontVariant: tabular === false ? undefined : ["tabular-nums"],
          letterSpacing: trackingOf(v, fs),
          textAlign: center ? "center" : undefined,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/* ---------- Icon ----------
 * The «Тонкие острые» set (founder 20.11.2026, #2350; DS §18.1): a thin line 1,3 at 20 pt that keeps its width on screen at any
 * size, butt ends and mitre corners, the drawing on `air` of the field. `active` — the selected state: the same icon filled
 * (its body in the colour, the details cut out of it), like Camera / Call in the founder's iOS sample. */
export type IconKey = keyof typeof icons | keyof typeof extraIcons;
/** the line width in the icon's own units: 1,3 at 20 pt, scaled so the line on screen is the same at 12…24, and undone for `air` */
export const iconStrokeFor = (s: number): number => +((iconMeta.stroke * 20) / s / iconMeta.air).toFixed(3);
export function Icon({ name, s = size.iconMd, color, active }: { name: IconKey; s?: number; color?: string; active?: boolean }) {
  const { c } = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const col = color ?? c.ink;
  const d = (icons as Record<string, string>)[name] ?? (extraIcons as Record<string, string>)[name];
  const L = (iconLayers as Record<string, IconLayers | undefined>)[name];
  const sw = iconStrokeFor(s);
  const air = iconMeta.air;
  const line = { stroke: col, strokeWidth: sw, strokeLinecap: iconMeta.cap, strokeLinejoin: iconMeta.join, strokeMiterlimit: 2, fill: "none" } as const;
  const filled = !!(active && L?.fill);
  return (
    <Svg width={s} height={s} viewBox={iconMeta.viewBox} fill="none">
      <G transform={`translate(12 12) scale(${air}) translate(-12 -12)`}>
        {filled ? (
          <>
            <Defs>
              <Mask id={`m${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
                <Path d={L!.fill!} fill={iconMeta.mask.show} />
                {L!.inner ? <Path d={L!.inner} stroke={iconMeta.mask.hide} strokeWidth={sw} strokeLinecap={iconMeta.cap} strokeLinejoin={iconMeta.join} fill="none" /> : null}
                {L!.innerDots ? <Path d={L!.innerDots} fill={iconMeta.mask.hide} /> : null}
              </Mask>
            </Defs>
            <Path d={L!.fill!} fill={col} mask={`url(#m${id})`} />
            {L!.outer ? <Path d={L!.outer} {...line} /> : null}
            {L!.outerDots ? <Path d={L!.outerDots} fill={col} /> : null}
          </>
        ) : (
          <>
            <Path d={d} {...line} />
            {L?.dots ? <Path d={L.dots} fill={col} /> : null}
          </>
        )}
      </G>
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
        if (!reduce) s.value = withTiming(motion.pressScale, { duration: motion.durPress });
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
