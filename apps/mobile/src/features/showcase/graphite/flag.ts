/**
 * «Графит» (пилот #2254): the switch that shows the pilot section of the showcase. Off by default; the person turns it on
 * in the showcase itself; the device remembers it (not the company, not the account). Roll-back = delete the folder.
 */
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const GRAPHITE_FLAG_KEY = "octo.ds.graphitePilot.v1";

/** only the exact "1" turns it on: anything else (nothing stored, junk) is off */
export const parseGraphiteFlag = (raw: string | null): boolean => raw === "1";

/** [on, set, read]; `on` is false until the device has answered (`read`) */
export function useGraphiteFlag(): [boolean, (v: boolean) => void, boolean] {
  const [on, setOn] = useState(false);
  const [read, setRead] = useState(false);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(GRAPHITE_FLAG_KEY)
      .then((r) => live && setOn(parseGraphiteFlag(r)))
      .catch(() => undefined)
      .finally(() => live && setRead(true));
    return () => {
      live = false;
    };
  }, []);
  const set = useCallback((v: boolean) => {
    setOn(v);
    AsyncStorage.setItem(GRAPHITE_FLAG_KEY, v ? "1" : "0").catch(
      () => undefined,
    );
  }, []);
  return [on, set, read];
}
