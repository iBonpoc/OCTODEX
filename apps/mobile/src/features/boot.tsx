import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, StyleSheet, useColorScheme, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import type * as SplashModule from "expo-splash-screen";
import * as Updates from "expo-updates";
import { getLocales } from "expo-localization";
import { component, motion, space, themes } from "@octo/design-tokens";
import { tFor, type DocLang } from "@/i18n/translate";
import { StaticThemeProvider } from "@/theme/ThemeProvider";
import { BrandIntro, BrandQuick, BrandWait } from "@/ui/brand";
import { BRAND_SEEN_KEY, launchKind, waitStage } from "@/ui/brandRules";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";

/**
 * The launch without a white frame (DS §18.2 «Запуск», #654, #1046). The system splash stays until this layer has
 * drawn; the layer lies under the whole app in the theme of the system's scheme (the stored theme is not read yet) and
 * shows the brand while the providers still say «not ready» (fonts, theme, language, the company's cache). When the
 * shell is up it says so (`useBootDone`) and the layer goes — no loop runs behind the app.
 *
 * What it shows: the first launch of a version — the intro on the logo; otherwise the short GR entry; still not ready
 * after it — the wait with its word; after `actionTimeoutMs` — «Не получилось загрузить · Повторить».
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
splash()?.preventAutoHideAsync().catch(() => {});

const BootCtx = createContext<() => void>(() => {});

/** the shell calls it once it is on screen */
export function useBootDone(): void {
  const done = useContext(BootCtx);
  useEffect(() => done(), [done]);
}

const VERSION = Constants.expoConfig?.version ?? "1.0.0";

function deviceDocLang(): DocLang {
  const code = getLocales()[0]?.languageCode ?? "en";
  return code === "ru" || code === "es" ? code : "en";
}

function reload(): void {
  if (Platform.OS === "web") globalThis.location?.reload();
  else Updates.reloadAsync().catch(() => {});
}

function BootBrand({ words }: { words: boolean }) {
  const t = useMemo(() => tFor(deviceDocLang()), []);
  const [seen, setSeen] = useState<string | null | undefined>(undefined);
  const [phase, setPhase] = useState<"entry" | "wait">("entry");
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(Date.now());
  useEffect(() => {
    AsyncStorage.getItem(BRAND_SEEN_KEY)
      .then((v) => setSeen(v))
      .catch(() => setSeen(VERSION)); // storage refuses: no intro, never block the start
  }, []);
  useEffect(() => {
    const tick = setInterval(() => setElapsed(Date.now() - started.current), motion.spinnerDelayMs);
    return () => clearInterval(tick);
  }, []);
  const kind = seen === undefined ? null : launchKind({ seenVersion: seen, version: VERSION, dataOnPhone: false });
  useEffect(() => {
    if (kind !== "quick") return;
    const id = setTimeout(() => setPhase("wait"), motion.durBrandQuick);
    return () => clearTimeout(id);
  }, [kind]);
  const introDone = useCallback(() => {
    AsyncStorage.setItem(BRAND_SEEN_KEY, VERSION).catch(() => {});
    setPhase("wait");
  }, []);
  if (kind === null) return null;
  const stage = waitStage(elapsed);
  return (
    <View testID="boot-brand" style={{ alignItems: "center", gap: space[4] }}>
      {phase === "entry" && kind === "intro" ? (
        <BrandIntro width={component.brand.intro} onDone={introDone} testID="boot-intro" />
      ) : phase === "entry" ? (
        <BrandQuick size={component.brand.wait} testID="boot-quick" />
      ) : (
        <BrandWait size={component.brand.wait} testID="boot-wait" />
      )}
      {words && phase === "wait" && stage !== "silent" ? (
        stage === "failed" ? (
          <View testID="boot-failed" style={{ alignItems: "center", gap: space[3] }}>
            <T v="body" tone="mut">
              {t("brand.boot.failed")}
            </T>
            <Button label={t("brand.boot.retry")} icon="refresh" variant="secondary" onPress={reload} testID="boot-retry" />
          </View>
        ) : (
          <T v="body" tone="mut">
            {t("brand.boot.loading")}
          </T>
        )
      ) : null}
    </View>
  );
}

/** the app's root: the layer under it, the native splash let go once the layer is drawn. `fontsReady` — words only
 *  after the fonts (a missing font family is an error on the phone) */
export function BootRoot({ fontsReady, children }: { fontsReady: boolean; children?: ReactNode }) {
  const scheme = useColorScheme();
  const name = scheme === "light" ? "light" : "dark";
  const [booted, setBooted] = useState(false);
  const done = useCallback(() => setBooted(true), []);
  return (
    <View style={{ flex: 1, backgroundColor: themes[name].bg }} onLayout={() => void splash()?.hideAsync().catch(() => {})}>
      {booted ? null : (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]} pointerEvents="box-none">
          <StaticThemeProvider name={name}>
            <BootBrand words={fontsReady} />
          </StaticThemeProvider>
        </View>
      )}
      <BootCtx.Provider value={done}>{children}</BootCtx.Provider>
    </View>
  );
}
