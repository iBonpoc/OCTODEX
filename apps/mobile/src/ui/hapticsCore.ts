/**
 * Vibration core (DS §15.6, Н-50): what each kind of feedback does and the on/off switch — no react-native here, so a
 * unit test can run it. The wiring (expo-haptics, the stored setting, the hook) is in haptics.ts.
 */
export type HapticKind = "selection" | "light" | "medium" | "success" | "warning" | "error";

export interface HapticBackend {
  selection: () => Promise<unknown>;
  impact: (style: "light" | "medium") => Promise<unknown>;
  notify: (type: "success" | "warning" | "error") => Promise<unknown>;
}

/** the device setting «Вибрация» (DS §15.6, В-20); a device key like the theme and the language — not wiped with the account */
export const HAPTICS_KEY = "octo.haptics.v1";
/** nothing stored yet = on; only a stored `false` switches it off */
export const parseHapticsPref = (raw: string | null | undefined): boolean => raw !== "false";

export function createHaptics(backend: HapticBackend, isOn: () => boolean) {
  const run = (f: () => Promise<unknown>) => {
    if (!isOn()) return;
    try {
      f().catch(() => {});
    } catch {
      /* no haptic engine: nothing to do */
    }
  };
  return {
    /** a value changes step by step: switch, stepper step, a fraction on the tape, a checklist item */
    selection: () => run(() => backend.selection()),
    /** a thing «settles»: picked up and dropped while dragging */
    light: () => run(() => backend.impact("light")),
    medium: () => run(() => backend.impact("medium")),
    /** the main action succeeded: estimate saved, visit scheduled, signature, payment taken */
    success: () => run(() => backend.notify("success")),
    /** it did not pass the check */
    warning: () => run(() => backend.notify("warning")),
    /** it failed */
    error: () => run(() => backend.notify("error")),
  };
}
