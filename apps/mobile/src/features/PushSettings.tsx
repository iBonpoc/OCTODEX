/**
 * «Settings → Notifications» (docs/specs/27-push.md §5; the place — docs/specs/26, the app settings screen).
 * One working switch for this phone: turn on (the system question on the tap), turn off; refused in the phone's
 * settings → the way there. On the web and in Expo Go — one line where pushes work (no switch that does nothing).
 */
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import { useAuth } from "@/cloud/auth";
import { useI18n } from "@/i18n";
import { Button, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, SectionTitle } from "@/ui/surfaces";
import { disable, enable, stateOf, type PushState } from "./push";
import { appVersion, nativePushDeps, pushSupport } from "./pushNative";

export function usePushState(): { state: PushState; busy: boolean; turnOn: () => Promise<void>; turnOff: () => Promise<void> } {
  const { session } = useAuth();
  const { lang, t } = useI18n();
  const toast = useToast();
  const [state, setState] = useState<PushState>(() => stateOf({ support: pushSupport, signedIn: !!session, permission: "undetermined", token: null }));
  const [busy, setBusy] = useState(false);
  const read = useCallback(async () => {
    const d = nativePushDeps();
    if (!d) return setState(stateOf({ support: pushSupport === "device" ? "expo_go" : pushSupport, signedIn: !!session, permission: "undetermined", token: null }));
    setState(stateOf({ support: "device", signedIn: !!session, permission: await d.permission(), token: await d.load() }));
  }, [session]);
  useEffect(() => {
    void read();
    const sub = AppState.addEventListener("change", (s) => s === "active" && void read());
    return () => sub.remove();
  }, [read]);
  const turnOn = async () => {
    const d = nativePushDeps();
    if (!d || busy) return;
    setBusy(true);
    const r = await enable(d, lang, appVersion);
    setBusy(false);
    toast.show(t(r === "on" ? "push.turnedOn" : r === "denied" ? "push.denied" : "push.failed"));
    await read();
  };
  const turnOff = async () => {
    const d = nativePushDeps();
    if (!d || busy) return;
    setBusy(true);
    await disable(d);
    setBusy(false);
    await read();
  };
  return { state, busy, turnOn, turnOff };
}

const STATE_TEXT = {
  on: "push.state.on",
  off: "push.state.off",
  denied: "push.state.denied",
  signed_out: "push.state.signed_out",
  web: "push.state.web",
  expo_go: "push.state.expo_go",
} as const satisfies Record<PushState, string>;

export function PushSettingsSection() {
  const { t } = useI18n();
  const { state, busy, turnOn, turnOff } = usePushState();
  return (
    <>
      <SectionTitle title={t("push.title")} />
      <Card>
        {state === "on" || state === "off" ? (
          <Toggle label={t("push.thisPhone")} on={state === "on"} onChange={(v) => void (busy ? undefined : v ? turnOn() : turnOff())} />
        ) : null}
        <T v="caption" tone={state === "denied" ? "warn" : "mut"}>
          {t(STATE_TEXT[state])}
        </T>
        {state === "denied" ? (
          <Button label={t("push.openSettings")} icon="bell" variant="secondary" onPress={() => void Linking.openSettings().catch(() => undefined)} />
        ) : null}
      </Card>
    </>
  );
}
