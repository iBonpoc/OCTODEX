/**
 * The screen when the app itself fails (#1555, DS §13 «Экран сбоя»): the router's ErrorBoundary of the root layout draws it instead of a
 * white screen. It stands OUTSIDE every provider (the theme, the language and the store may be what failed), so it takes the system's
 * theme and the device's language, as the launch layer does. No raw error text on the screen (it goes to the console); «Повторить» draws
 * the screen again, «Перезапустить» reloads the app. Nothing is deleted: the unsent changes stay on the phone.
 */
import { useEffect } from "react";
import { useColorScheme, View } from "react-native";
import { layout, size, space } from "@octo/design-tokens";
import type { DictKey } from "@/i18n";
import { tFor } from "@/i18n/translate";
import { StaticThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { Icon, T } from "@/ui/primitives";
import { Button } from "@/ui/controls";
import { deviceDocLang, releaseSplash, reload } from "./boot";

type Say = (key: DictKey) => string;

/** the words and the two buttons; the showcase draws it in a card with the app's own language */
export function CrashView({ t, onRetry, onRestart }: { t: Say; onRetry: () => void; onRestart: () => void }) {
  const { c } = useTheme();
  return (
    <View testID="crash-view" style={{ width: "100%", maxWidth: layout.contentMax, alignItems: "center", gap: space[3] }}>
      <Icon name="alert" s={size.iconLg} color={c.status.bad.text} />
      <T v="heading" center>
        {t("crash.title")}
      </T>
      <T v="body" tone="mut" center>
        {t("crash.body")}
      </T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space[2] }}>
        <View testID="crash-retry">
          <Button label={t("crash.retry")} onPress={onRetry} />
        </View>
        <View testID="crash-restart">
          <Button variant="secondary" label={t("crash.restart")} onPress={onRestart} />
        </View>
      </View>
    </View>
  );
}

/** for the router: `export function ErrorBoundary(props) { return <CrashScreen {...props} /> }` in the root layout */
export function CrashScreen({ error, retry }: { error: Error; retry: () => void | Promise<void> }) {
  const scheme = useColorScheme();
  const t = tFor(deviceDocLang());
  useEffect(() => {
    releaseSplash();
    console.error("[crash]", error?.message ?? error);
  }, [error]);
  return (
    <StaticThemeProvider name={scheme === "light" ? "light" : "dark"}>
      <CrashBody t={t} onRetry={() => void retry()} />
    </StaticThemeProvider>
  );
}

function CrashBody({ t, onRetry }: { t: Say; onRetry: () => void }) {
  const { c } = useTheme();
  return (
    <View testID="crash-screen" style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: space[6] }}>
      <CrashView t={t} onRetry={onRetry} onRestart={reload} />
    </View>
  );
}
