/**
 * The only place that imports expo-haptics (DS §15.6, Н-50; guard in designSystem.test.ts).
 * `haptics.success()` etc. do nothing when the person switched «Вибрация» off (Settings, default on; DS В-20) and on the web.
 */
import { useCallback, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Expo from "expo-haptics";
import { createHaptics, HAPTICS_KEY, parseHapticsPref, type HapticBackend } from "./hapticsCore";

let on = true;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const none = async () => {};
const backend: HapticBackend =
  Platform.OS === "web"
    ? { selection: none, impact: none, notify: none }
    : {
        selection: () => Expo.selectionAsync(),
        impact: (s) => Expo.impactAsync(s === "light" ? Expo.ImpactFeedbackStyle.Light : Expo.ImpactFeedbackStyle.Medium),
        notify: (t) =>
          Expo.notificationAsync(
            t === "success" ? Expo.NotificationFeedbackType.Success : t === "warning" ? Expo.NotificationFeedbackType.Warning : Expo.NotificationFeedbackType.Error,
          ),
      };

// the stored setting is read once at start; until then vibration is on (the default)
let changed = false;
AsyncStorage.getItem(HAPTICS_KEY)
  .then((raw) => {
    if (changed) return; // the person already switched it in this run
    on = parseHapticsPref(raw);
    emit();
  })
  .catch(() => {});

export const haptics = createHaptics(backend, () => on);

export function setHapticsEnabled(v: boolean) {
  changed = true;
  on = v;
  emit();
  AsyncStorage.setItem(HAPTICS_KEY, JSON.stringify(v)).catch(() => {});
}

/** [on, set] for the «Вибрация» row in Settings */
export function useHapticsEnabled(): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => on,
    () => true,
  );
  return [value, useCallback((v: boolean) => setHapticsEnabled(v), [])];
}
