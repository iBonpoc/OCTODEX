import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * #3124 В1 (spec 71 §16, the founder 27.11 ~18:40 LA: «переключатель какой-то сделаем… потестирую… и скажу, отключить или
 * не отключить»): how the client card and the job screen look on this device — «Обычный» (the card as it is) or «Линия
 * работы». One value for every client and job on the device, «Обычный» until changed; the «⋯» of the client and of the
 * job switch it. The device remembers it (AsyncStorage, as features/estimate/swipeHint.ts): not company data, never in
 * the sync queue (rule 6 untouched); a failed read is «Обычный».
 */
export type ClientLook = "plain" | "line";
export const CLIENT_LOOK_KEY = "octo.client.look.v1";
export const DEFAULT_LOOK: ClientLook = "plain";

export const parseClientLook = (raw: string | null): ClientLook => (raw === "line" ? "line" : DEFAULT_LOOK);

// one value for the app: the client card and the job screen show the same look, switched in either without a reload
let current: ClientLook | null = null;
const listeners = new Set<(l: ClientLook) => void>();
let reading: Promise<ClientLook> | null = null;

function readOnce(): Promise<ClientLook> {
  if (current) return Promise.resolve(current);
  reading ??= AsyncStorage.getItem(CLIENT_LOOK_KEY)
    .then(parseClientLook)
    .catch(() => DEFAULT_LOOK)
    .then((l) => (current ??= l));
  return reading;
}

export function setClientLook(l: ClientLook): void {
  current = l;
  listeners.forEach((f) => f(l));
  AsyncStorage.setItem(CLIENT_LOOK_KEY, l).catch(() => undefined);
}

/** the look on this device; «Обычный» until the device answers (the plain card never waits for storage) */
export function useClientLook(): [ClientLook, (l: ClientLook) => void] {
  const [look, setLook] = useState<ClientLook>(current ?? DEFAULT_LOOK);
  useEffect(() => {
    let live = true;
    listeners.add(setLook);
    void readOnce().then((l) => live && setLook(l));
    return () => {
      live = false;
      listeners.delete(setLook);
    };
  }, []);
  return [look, useCallback((l: ClientLook) => setClientLook(l), [])];
}

/** for tests: forget the value read from the device */
export const __resetClientLook = () => {
  current = null;
  reading = null;
};
