/**
 * «Settings → Notifications» (docs/specs/27-push.md §5; the place — docs/specs/26, the app settings screen).
 * One working switch for this phone: turn on (the system question on the tap), turn off; refused in the phone's
 * settings → the way there. On the web and in Expo Go — one line where pushes work (no switch that does nothing).
 * Below it (step 18 P4c, §4.11): «Что присылать» — a switch per group, a setting of the person (the web too), only the
 * groups the person can get; offline it waits in the queue (store.setPushKind, rule 6).
 */
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, View } from "react-native";
import { space } from "@octo/design-tokens";
import { useAuth } from "@/cloud/auth";
import { useI18n } from "@/i18n";
import { Button, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Divider, RowView, SectionTitle } from "@/ui/surfaces";
import { useStore } from "@/data/store";
import { disable, enable, stateOf, type PushState } from "./push";
import { pushGroupOn, pushGroupsFor } from "./pushPrefs";
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
    try {
      setState(stateOf({ support: "device", signedIn: !!session, permission: await d.permission(), token: await d.load() }));
    } catch {
      // the native module is missing or broken in this build: say where pushes work instead of a dead switch
      setState("expo_go");
    }
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
    const r = await enable(d, lang, appVersion).catch(() => "failed" as const);
    setBusy(false);
    toast.show(t(r === "on" ? "push.turnedOn" : r === "denied" ? "push.denied" : "push.failed"));
    await read();
  };
  const turnOff = async () => {
    const d = nativePushDeps();
    if (!d || busy) return;
    setBusy(true);
    await disable(d).catch(() => {});
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
      <PushKinds />
    </>
  );
}

/** «Что присылать»: what the server can send me. In the cloud — my real roles; in the demo — the role being tried. */
function PushKinds() {
  const { t } = useI18n();
  const { db, mode, role, availableRoles, setPushKind } = useStore();
  const me = db.members.find((m) => m.id === db.me);
  const groups = pushGroupsFor(mode === "cloud" ? availableRoles : [role], me?.kind === "sub");
  if (!groups.length) return null;
  return (
    <Card>
      <View testID="push-kinds" style={{ gap: space[2] }}>
        <T v="heading">{t("push.kinds.title")}</T>
        <T v="caption" tone="mut">
          {t("push.kinds.note")}
        </T>
        {groups.map((g, i) => (
          <View key={g} style={{ gap: space[2] }}>
            {i ? <Divider /> : null}
            <View testID={`push-kind-${g}`}>
              <RowView>
                <View style={{ flex: 1 }}>
                  <T v="body">{t(`push.kind.${g}`)}</T>
                  <T v="caption" tone="mut">
                    {t(`push.kind.${g}.hint`)}
                  </T>
                </View>
                <Toggle label={t(`push.kind.${g}`)} on={pushGroupOn(db.pushPrefs, g)} onChange={(v) => setPushKind(g, v)} />
              </RowView>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}
