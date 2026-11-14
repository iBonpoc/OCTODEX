import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Circle, G, Path } from "react-native-svg";
import { motion } from "@octo/design-tokens";
import { APP_NAME } from "@/config/product";
import { useTheme } from "@/theme/ThemeProvider";
import { DOT, G_PATH, G_PLACE, GR_VIEW, LOGO_DOT, LOGO_LETTERS, LOGO_LETTERS_DX, LOGO_SHIFT, LOGO_VIEW, R_DX, R_PATH, dotTone, dotWay, gToMark, pointOnWay } from "./brandRules";

/**
 * GoRix in the app (DS §18.2, #1156): the mark GR and the logo «GoRix», and the two moves of its yellow dot —
 * the full-screen wait and the logo's intro (the showcase only, #1394). The only place that draws the brand
 * (`brandGuard.test.ts`): the brand is to be redrawn after 1.0, then this file and `brandRules.ts` change, nothing else.
 * Letters are `ink`; the dot is `acc` or `ink` by `dotTone` (DS §18.2 «Цвет»). Reduced motion: the dot stands still.
 */

const G_TRANSFORM = `translate(${G_PLACE.dx} ${G_PLACE.dy}) scale(${G_PLACE.k})`;
const markW = (h: number) => (h * GR_VIEW.w) / GR_VIEW.h;

type Tone = { dot: string; ring?: string };
function useTone(size: number, screenHasPrimary: boolean): Tone {
  const { c, name } = useTheme();
  const t = dotTone({ size, theme: name, screenHasPrimary });
  return { dot: t.dot === "acc" ? c.acc : c.ink, ring: t.ring ? c.ink : undefined };
}

/** the letters G and R; `dot` — draw the dot at rest (the moves draw their own) */
function GrSvg({ h, ink, tone, dot }: { h: number; ink: string; tone: Tone; dot: boolean }) {
  return (
    <Svg width={markW(h)} height={h} viewBox={`${GR_VIEW.x} ${GR_VIEW.y} ${GR_VIEW.w} ${GR_VIEW.h}`}>
      <G fill={ink}>
        <G transform={G_TRANSFORM}>
          <Path d={G_PATH} />
        </G>
        <G transform={`translate(${R_DX} 0)`}>
          <Path d={R_PATH} />
        </G>
      </G>
      {dot ? (
        <G transform={G_TRANSFORM}>
          {tone.ring ? <Circle cx={DOT.cx} cy={DOT.cy} r={DOT.ring} fill={tone.ring} /> : null}
          <Circle cx={DOT.cx} cy={DOT.cy} r={DOT.r} fill={tone.dot} />
        </G>
      ) : null}
    </Svg>
  );
}

/** the mark GR, `size` — its height. `screenHasPrimary`: the screen has a yellow main button — the dot is ink */
export function BrandMark({ size, screenHasPrimary = false, testID }: { size: number; screenHasPrimary?: boolean; testID?: string }) {
  const { c } = useTheme();
  const tone = useTone(size, screenHasPrimary);
  return (
    <View testID={testID} accessibilityRole="image" accessibilityLabel={APP_NAME}>
      <GrSvg h={size} ink={c.ink} tone={tone} dot />
    </View>
  );
}

/** the logo «GoRix», `width` — its width; the dot over the «i» is yellow (bigger than 24), in a ring on light */
export function BrandLogo({ width, testID, dot = true }: { width: number; testID?: string; dot?: boolean }) {
  const { c } = useTheme();
  const h = (width * LOGO_VIEW.h) / LOGO_VIEW.w;
  const tone = useTone(h, false);
  return (
    <View testID={testID} accessibilityRole="image" accessibilityLabel={APP_NAME}>
      <Svg width={width} height={h} viewBox={`${LOGO_VIEW.x} ${LOGO_VIEW.y} ${LOGO_VIEW.w} ${LOGO_VIEW.h}`}>
        <G transform={`translate(${LOGO_SHIFT.dx} ${LOGO_SHIFT.dy})`}>
          <G fill={c.ink}>
            <G transform={G_TRANSFORM}>
              <Path d={G_PATH} />
            </G>
            <G transform={`translate(${LOGO_LETTERS_DX} 0)`}>
              {LOGO_LETTERS.map((d, i) => (
                <Path key={i} d={d} />
              ))}
            </G>
          </G>
          {dot ? (
            <>
              {tone.ring ? <Circle cx={LOGO_DOT.cx} cy={LOGO_DOT.cy} r={LOGO_DOT.ring} fill={tone.ring} /> : null}
              <Circle cx={LOGO_DOT.cx} cy={LOGO_DOT.cy} r={LOGO_DOT.r} fill={tone.dot} />
            </>
          ) : null}
        </G>
      </Svg>
    </View>
  );
}

const INTRO_WAY = dotWay(700);
const WAIT_WAY = dotWay(600);

/** the dot as a view over the svg (transforms move on every platform, the web included) */
function MovingDot({ box, d, tone, style }: { box: { w: number; h: number }; d: number; tone: Tone; style: ReturnType<typeof useAnimatedStyle> }) {
  const ring = tone.ring ? (d * (DOT.ring - DOT.r)) / DOT.r : 0;
  const outer = d + ring * 2;
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: -outer / 2, top: -outer / 2, width: outer, height: outer, borderRadius: outer / 2, backgroundColor: tone.ring ?? tone.dot, alignItems: "center", justifyContent: "center" }, style]}>
      {tone.ring ? <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: tone.dot }} /> : null}
    </Animated.View>
  );
}

/** the full-screen wait (DS §18.2 п.4): the dot leaves its place and drives along the G in a loop of `durBrand`,
 *  fading in and out at the ends; the word always beside it is the caller's (`BrandWaitScreen` in `brandScreens.tsx`) */
export function BrandWait({ size, testID }: { size: number; testID?: string }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const tone = useTone(size, false);
  const w = markW(size);
  // the dot starts at its place (the end of its way, where the still mark has it): it fades there, then the loop runs
  const t = useSharedValue(1);
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    const easing = Easing.bezier(0.45, 0, 0.55, 1);
    const edge = motion.durBrandEdge;
    t.value = withDelay(edge, withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: motion.durBrand, easing })), -1));
    o.value = withSequence(
      withTiming(0, { duration: edge }),
      withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: edge }), withDelay(motion.durBrand - 2 * edge, withTiming(0, { duration: edge }))), -1),
    );
    return () => {
      cancelAnimation(t);
      cancelAnimation(o);
    };
  }, [reduce, t, o]);
  const style = useAnimatedStyle(() => {
    const p = gToMark(pointOnWay(WAIT_WAY, t.value));
    return { opacity: o.value, transform: [{ translateX: p.x * w }, { translateY: p.y * size }] };
  });
  const d = (2 * DOT.r * G_PLACE.k * size) / GR_VIEW.h;
  return (
    <View testID={testID} accessibilityRole="progressbar" accessibilityLabel={APP_NAME} style={{ width: w, height: size }}>
      <GrSvg h={size} ink={c.ink} tone={tone} dot={false} />
      <MovingDot box={{ w, h: size }} d={d} tone={tone} style={style} />
    </View>
  );
}

/** the logo's intro (DS §18.2 п.7 — the showcase only since #1394): the logo; the dot drives along the G (`durBrandQuick`), a pause
 *  (`durBrandPause`), then flies up to its place over the «i» (`durBrandFold`); all within `durBrand`. `onDone` — when it stands */
export function BrandIntro({ width, onDone, testID }: { width: number; onDone?: () => void; testID?: string }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const h = (width * LOGO_VIEW.h) / LOGO_VIEW.w;
  const tone = useTone(h, false);
  const way = useSharedValue(reduce ? 1 : 0);
  const fly = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      onDone?.();
      return;
    }
    way.value = withTiming(1, { duration: motion.durBrandQuick, easing: Easing.bezier(0.4, 0, 0.6, 1) });
    fly.value = withDelay(motion.durBrandQuick + motion.durBrandPause, withTiming(1, { duration: motion.durBrandFold, easing: Easing.bezier(0.45, 0, 0.35, 1) }));
    const done = setTimeout(() => onDone?.(), motion.durBrandQuick + motion.durBrandPause + motion.durBrandFold);
    return () => {
      clearTimeout(done);
      cancelAnimation(way);
      cancelAnimation(fly);
    };
    // onDone is the caller's: the intro runs once, a new callback does not restart it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, way, fly]);
  const style = useAnimatedStyle(() => {
    const g = pointOnWay(INTRO_WAY, way.value);
    // the G's units → the logo's box
    const gx = (g.x * G_PLACE.k + G_PLACE.dx + LOGO_SHIFT.dx - LOGO_VIEW.x) / LOGO_VIEW.w;
    const gy = (g.y * G_PLACE.k + G_PLACE.dy + LOGO_SHIFT.dy - LOGO_VIEW.y) / LOGO_VIEW.h;
    const ix = (LOGO_DOT.cx + LOGO_SHIFT.dx - LOGO_VIEW.x) / LOGO_VIEW.w;
    const iy = (LOGO_DOT.cy + LOGO_SHIFT.dy - LOGO_VIEW.y) / LOGO_VIEW.h;
    const f = fly.value;
    // an arc up: the dot rises over the letters on its way to the «i»
    const x = gx + (ix - gx) * f;
    const y = gy + (iy - gy) * f - Math.sin(Math.PI * f) * 0.35;
    const k = 1 - (1 - LOGO_DOT.r / (DOT.r * G_PLACE.k)) * f;
    return { transform: [{ translateX: x * width }, { translateY: y * h }, { scale: k }] };
  });
  const d = (2 * DOT.r * G_PLACE.k * h) / LOGO_VIEW.h;
  return (
    <View testID={testID} accessibilityRole="image" accessibilityLabel={APP_NAME} style={{ width, height: h }}>
      <BrandLogo width={width} dot={false} />
      <MovingDot box={{ w: width, h }} d={d} tone={tone} style={style} />
    </View>
  );
}
