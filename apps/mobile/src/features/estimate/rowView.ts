import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * «Кратко / Подробно» — how the folded lines of an estimate look (DS §8.3; the founder: «сокращённый вид и развёрнутый
 * вид»). «Кратко» by default; the choice is the device's (not the estimate's, not the company's).
 */
export type RowView = "brief" | "full";
export const ROW_VIEW_KEY = "octo.est.rowView.v1";
export const DEFAULT_ROW_VIEW: RowView = "brief";

export const parseRowView = (raw: string | null): RowView => (raw === '"full"' || raw === "full" ? "full" : DEFAULT_ROW_VIEW);

export function useRowView(): [RowView, (v: RowView) => void] {
  const [view, setView] = useState<RowView>(DEFAULT_ROW_VIEW);
  // a choice made before the device answered wins over what it read
  const touched = useRef(false);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(ROW_VIEW_KEY)
      .then((raw) => live && !touched.current && setView(parseRowView(raw)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const set = (v: RowView) => {
    touched.current = true;
    setView(v);
    AsyncStorage.setItem(ROW_VIEW_KEY, JSON.stringify(v)).catch(() => {});
  };
  return [view, set];
}
