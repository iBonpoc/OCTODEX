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
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import type * as SplashModule from "expo-splash-screen";
import * as Updates from "expo-updates";
import { getLocales } from "expo-localization";
import { component, motion, space, themes } from "@octo/design-tokens";
import { tFor, type DocLang } from "@/i18n/translate";
import { StaticThemeProvider } from "@/theme/ThemeProvider";
import { BrandLaunch, BrandWait } from "@/ui/brand";
import { BRAND_SEEN_KEY, bootStage, launchKind, type Launch } from "@/ui/brandRules";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";

/**
 * The launch (DS §18.2 «Запуск» v4.4, #1394; before: #654, #1046). The system splash shows the GR mark 56 high in the
 * system's theme; this layer's first frame is the same mark in the same place, so the splash goes (a fade of `durBase`
 * on iOS and Android alike) and the mark never moves or changes size — only the yellow dot does:
 * - the first launch after install (no `BRAND_SEEN_KEY` on the device) — the dot drives along the G and bounces once;
 * - an ordinary launch — when the app is ready, the dot bounces once;
 * - a load longer than `durBrandHold` — the wait: the dot drives round the G, «Загрузка…» under the mark in a place kept
 *   for it; once shown, the wait stays `durBrandWaitMin`; when all is ready the dot comes home in `durFast`, no bounce;
 *   after `actionTimeoutMs` — «Не получилось загрузить · Повторить».
 * When the app is up (`useBootDone`) the layer comes over it (before its first paint) and, after the dot's move, leaves:
 * the mark grows to `brandExitScale` in `durBase`, the layer fades in `durFast` after `brandExitFadeDelay` — over the
 * drawn first screen. Reduced motion: nothing moves, the exit is a fade of `durFast`.
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

type Mark = { kind: "launch"; play: "first" | "bounce" | null } | { kind: "wait"; home: boolean };

/** the mark in the centre of the screen, the words under it in their own place: the mark never moves */
function BootBrand({ words, mark, stage, onPlayed, markStyle }: { words: boolean; mark: Mark; stage: "still" | "wait" | "failed"; onPlayed: () => void; markStyle: ReturnType<typeof useAnimatedStyle> }) {
  const t = useMemo(() => tFor(deviceDocLang()), []);
  const size = component.brand.wait;
  const testID = mark.kind === "wait" ? "boot-wait" : mark.play === "first" ? "boot-first" : mark.play === "bounce" ? "boot-bounce" : "boot-still";
  return (
    <View testID="boot-brand" style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={{ flex: 1 }} pointerEvents="none" />
      <Animated.View style={[{ height: size, alignItems: "center" }, markStyle]} pointerEvents="none">
        {mark.kind === "wait" ? <BrandWait size={size} home={mark.home} testID={testID} /> : <BrandLaunch size={size} play={mark.play} onDone={onPlayed} testID={testID} />}
      </Animated.View>
      {/* the padding is inside: on the flexible half itself it would take its share and lift the mark off the middle */}
      <View style={{ flex: 1 }} pointerEvents="box-none">
        <View style={{ alignItems: "center", paddingTop: space[4] }} pointerEvents="box-none">
          {/* the words wait for the fonts — but «Повторить» never does: fonts that never load must not leave a silent screen.
              On the way out the words fade together with the layer — nothing snaps */}
          {stage === "failed" ? (
            <View testID="boot-failed" style={{ alignItems: "center", gap: space[3] }}>
              <T v="body" tone="mut">
                {t("brand.boot.failed")}
              </T>
              <Button label={t("brand.boot.retry")} icon="refresh" variant="secondary" onPress={reload} testID="boot-retry" />
            </View>
          ) : mark.kind === "wait" && words ? (
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

/** the layer goes over the drawn first screen (DS §18.2 п.3): the mark grows to `brandExitScale` in `durBase`
 *  (`easeOut`); the layer holds `brandExitFadeDelay`, then fades in `durFast` (`easeIn`) — the growth is seen while the
 *  mark is whole. Reduced motion: a fade of `durFast`, no growth. It takes no taps: the first screen works at once */
export function useBootLeave(leaving: boolean, onGone: () => void) {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  const k = useSharedValue(1);
  useEffect(() => {
    if (!leaving) return;
    if (reduce) o.value = withTiming(0, { duration: motion.durFast });
    else {
      k.value = withTiming(motion.brandExitScale, { duration: motion.durBase, easing: Easing.bezier(...motion.easeOut) });
      o.value = withDelay(motion.brandExitFadeDelay, withTiming(0, { duration: motion.durFast, easing: Easing.bezier(...motion.easeIn) }));
    }
    const id = setTimeout(onGone, reduce ? motion.durFast : motion.durBase);
    return () => clearTimeout(id);
  }, [leaving, reduce, o, k, onGone]);
  const layer = useAnimatedStyle(() => ({ opacity: o.value }));
  const mark = useAnimatedStyle(() => ({ transform: [{ scale: k.value }] }));
  return { layer, mark };
}

/** the app's root: the layer under it while it loads, over it from the moment the app is up (zIndex, the same element —
 *  nothing remounts) until it is gone; the native splash let go once the layer is drawn. `fontsReady` — words only after
 *  the fonts (a missing font family is an error on the phone) */
export function BootRoot({ fontsReady, children }: { fontsReady: boolean; children?: ReactNode }) {
  const scheme = useColorScheme();
  const name = scheme === "light" ? "light" : "dark";
  const reduce = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [kind, setKind] = useState<Launch | null>(null);
  const [played, setPlayed] = useState(false);
  const [bounce, setBounce] = useState(false);
  const [home, setHome] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(Date.now());
  const waitShown = useRef<number | null>(null);
  // the first launch after install: the dot's drive along the G (the mark counts as shown once it starts)
  useEffect(() => {
    AsyncStorage.getItem(BRAND_SEEN_KEY)
      .then((v) => {
        const k = launchKind(v);
        // read too late (the app was up first): the ordinary launch is already chosen and stays
        setKind((prev) => prev ?? k);
        if (k === "first") AsyncStorage.setItem(BRAND_SEEN_KEY, "1").catch(() => {});
      })
      .catch(() => setKind((prev) => prev ?? "normal")); // storage refuses: the ordinary launch, never block the start
  }, []);
  useEffect(() => {
    if (ready) return;
    const tick = setInterval(() => setElapsed(Date.now() - started.current), motion.spinnerDelayMs);
    return () => clearInterval(tick);
  }, [ready]);
  const firstPlaying = kind === "first" && !reduce && !played && waitShown.current === null;
  const stage = firstPlaying ? "still" : bootStage(elapsed);
  if (stage !== "still" && waitShown.current === null) waitShown.current = Date.now();
  const waiting = waitShown.current !== null;
  // what comes after «ready»: from the wait — the dot home, then the exit; the first launch — the end of its drive and
  // bounce; an ordinary launch — one bounce; reduced motion — the exit at once
  useEffect(() => {
    if (!ready || leaving) return;
    if (reduce) return setLeaving(true);
    if (kind === null) return setKind("normal");
    if (waiting) {
      const shown = waitShown.current ?? Date.now();
      const homeAt = Math.max(0, shown + motion.durBrandWaitMin - Date.now());
      const a = setTimeout(() => setHome(true), homeAt);
      const b = setTimeout(() => setLeaving(true), homeAt + motion.durFast);
      return () => {
        clearTimeout(a);
        clearTimeout(b);
      };
    }
    if (kind === "first") {
      if (played) setLeaving(true);
      return;
    }
    if (!bounce) setBounce(true);
    else if (played) setLeaving(true);
  }, [ready, leaving, reduce, waiting, kind, played, bounce]);
  const done = useCallback(() => setReady(true), []);
  const onPlayed = useCallback(() => setPlayed(true), []);
  const onGone = useCallback(() => setGone(true), []);
  const leave = useBootLeave(leaving, onGone);
  const mark: Mark = waiting ? { kind: "wait", home } : { kind: "launch", play: kind === "first" && !reduce ? "first" : bounce ? "bounce" : null };
  return (
    <View style={{ flex: 1, backgroundColor: themes[name].bg }} onLayout={() => void splash()?.hideAsync().catch(() => {})}>
      {gone ? null : (
        <Animated.View
          testID={leaving ? "boot-leaving" : "boot-layer"}
          style={[StyleSheet.absoluteFill, { zIndex: ready ? 1 : 0, backgroundColor: ready ? themes[name].bg : undefined }, leave.layer]}
          // over the app before it leaves: no blind taps on a screen not seen yet; leaving — the first screen takes them
          pointerEvents={leaving ? "none" : ready ? "auto" : "box-none"}
        >
          <StaticThemeProvider name={name}>
            <BootBrand words={fontsReady} mark={mark} stage={stage} onPlayed={onPlayed} markStyle={leave.mark} />
          </StaticThemeProvider>
        </Animated.View>
      )}
      <BootCtx.Provider value={done}>{children}</BootCtx.Provider>
    </View>
  );
}
