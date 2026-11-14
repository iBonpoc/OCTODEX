import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform, StyleSheet, useColorScheme, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type * as SplashModule from "expo-splash-screen";
import * as Updates from "expo-updates";
import { getLocales } from "expo-localization";
import { component, motion, space, themes } from "@octo/design-tokens";
import { tFor, type DocLang } from "@/i18n/translate";
import { StaticThemeProvider } from "@/theme/ThemeProvider";
import { BrandMark, BrandWait } from "@/ui/brand";
import { bootStage } from "@/ui/brandRules";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";

/**
 * The launch without a jump (DS §18.2 «Запуск» v4.3, #1394; before: #654, #1046). The system splash shows the GR mark
 * 56 high in the system's theme; this layer's first frame is the same mark in the same place, so the splash goes
 * (a fade of `durBase` on iOS and Android alike) and nothing moves. The mark stands still while the providers say «not
 * ready» (fonts, theme, language, the company's cache); only a load longer than `durBrandHold` starts the wait — the dot
 * leaves its place, the word «Загрузка…» comes under the mark in a place kept for it (the mark never shifts); after
 * `actionTimeoutMs` — «Не получилось загрузить · Повторить». When the shell is up (`useBootDone`) the layer comes over it
 * and leaves: the mark grows to `brandExitScale` while the layer fades in `durBase` over the drawn first screen, which
 * takes taps at once. Reduced motion: no growth, a fade of `durFast`.
 */

/**
 * The native splash module, lazily (spec 30 п.9): a JS update reaches TestFlight builds made before it was added —
 * there `require` throws and the launch simply goes on without holding the splash (as it did before). Expo Go and new
 * builds have it. On the web there is no native splash (index.html draws the mark instead).
 */
let splashMod: typeof SplashModule | null | undefined;
function splash(): typeof SplashModule | null {
  if (splashMod !== undefined) return splashMod;
  if (Platform.OS === "web") return (splashMod = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    splashMod = require("expo-splash-screen") as typeof SplashModule;
  } catch {
    splashMod = null;
  }
  return splashMod;
}
splash()
  ?.preventAutoHideAsync()
  .catch(() => {});
// the splash goes the same way on iOS and Android: a fade of durBase (iOS by default cuts at once). Builds made before
// setOptions existed simply skip it
try {
  splash()?.setOptions?.({ fade: true, duration: motion.durBase });
} catch {
  // an old native module: the splash goes as it did
}

const BootCtx = createContext<() => void>(() => {});

/** the shell calls it once it is on screen — before the paint, so the layer is over the shell in its very first frame */
export function useBootDone(): void {
  const done = useContext(BootCtx);
  useLayoutEffect(() => done(), [done]);
}

function deviceDocLang(): DocLang {
  const code = getLocales()[0]?.languageCode ?? "en";
  return code === "ru" || code === "es" ? code : "en";
}

function reload(): void {
  if (Platform.OS === "web") globalThis.location?.reload();
  else Updates.reloadAsync().catch(() => {});
}

/** the mark in the centre of the screen, the words under it in their own place: the mark never moves */
function BootBrand({ words, leaving }: { words: boolean; leaving: boolean }) {
  const t = useMemo(() => tFor(deviceDocLang()), []);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(Date.now());
  useEffect(() => {
    if (leaving) return;
    const tick = setInterval(
      () => setElapsed(Date.now() - started.current),
      motion.spinnerDelayMs,
    );
    return () => clearInterval(tick);
  }, [leaving]);
  const stage = bootStage(elapsed);
  const size = component.brand.wait;
  return (
    <View
      testID="boot-brand"
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
    >
      <View style={{ flex: 1 }} pointerEvents="none" />
      <View style={{ height: size, alignItems: "center" }} pointerEvents="none">
        {stage === "still" ? (
          <BrandMark size={size} testID="boot-still" />
        ) : (
          <BrandWait size={size} testID="boot-wait" />
        )}
      </View>
      {/* the padding is inside: on the flexible half itself it would take its share and lift the mark off the middle */}
      <View style={{ flex: 1 }} pointerEvents="box-none">
        <View
          style={{ alignItems: "center", paddingTop: space[4] }}
          pointerEvents="box-none"
        >
          {/* the words wait for the fonts — but «Повторить» never does: fonts that never load must not leave a silent screen.
              On the way out the mark, its dot and its words fade together with the layer — nothing snaps */}
          {stage === "failed" ? (
            <View
              testID="boot-failed"
              style={{ alignItems: "center", gap: space[3] }}
            >
              <T v="body" tone="mut">
                {t("brand.boot.failed")}
              </T>
              <Button
                label={t("brand.boot.retry")}
                icon="refresh"
                variant="secondary"
                onPress={reload}
                testID="boot-retry"
              />
            </View>
          ) : stage === "wait" && words ? (
            <View testID="boot-loading">
              <T v="body" tone="mut">
                {t("brand.boot.loading")}
              </T>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** the layer goes: over the drawn first screen, it fades in `durBase` while the mark grows to `brandExitScale`
 *  (reduced motion: a fade of `durFast`, no growth); it takes no taps, the first screen works at once */
export function useBootLeave(leaving: boolean, onGone: () => void) {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  const k = useSharedValue(1);
  useEffect(() => {
    if (!leaving) return;
    const duration = reduce ? motion.durFast : motion.durBase;
    const easing = Easing.bezier(...motion.easeOut);
    o.value = withTiming(0, { duration, easing });
    if (!reduce)
      k.value = withTiming(motion.brandExitScale, { duration, easing });
    const id = setTimeout(onGone, duration);
    return () => clearTimeout(id);
  }, [leaving, reduce, o, k, onGone]);
  const layer = useAnimatedStyle(() => ({ opacity: o.value }));
  const mark = useAnimatedStyle(() => ({ transform: [{ scale: k.value }] }));
  return { layer, mark };
}

/** the app's root: the layer under it while it loads, over it while it leaves (zIndex, the same element — nothing
 *  remounts), the native splash let go once the layer is drawn. `fontsReady` — words only after the fonts (a missing
 *  font family is an error on the phone) */
export function BootRoot({
  fontsReady,
  children,
}: {
  fontsReady: boolean;
  children?: ReactNode;
}) {
  const scheme = useColorScheme();
  const name = scheme === "light" ? "light" : "dark";
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const done = useCallback(() => setLeaving(true), []);
  const onGone = useCallback(() => setGone(true), []);
  const leave = useBootLeave(leaving, onGone);
  return (
    <View
      style={{ flex: 1, backgroundColor: themes[name].bg }}
      onLayout={() =>
        void splash()
          ?.hideAsync()
          .catch(() => {})
      }
    >
      {gone ? null : (
        <Animated.View
          testID={leaving ? "boot-leaving" : "boot-layer"}
          style={[
            StyleSheet.absoluteFill,
            {
              zIndex: leaving ? 1 : 0,
              backgroundColor: leaving ? themes[name].bg : undefined,
            },
            leave.layer,
          ]}
          pointerEvents={leaving ? "none" : "box-none"}
        >
          <StaticThemeProvider name={name}>
            <Animated.View
              style={[StyleSheet.absoluteFill, leave.mark]}
              pointerEvents="box-none"
            >
              <BootBrand words={fontsReady} leaving={leaving} />
            </Animated.View>
          </StaticThemeProvider>
        </Animated.View>
      )}
      <BootCtx.Provider value={done}>{children}</BootCtx.Provider>
    </View>
  );
}
