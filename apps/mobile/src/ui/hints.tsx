import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePersistentState } from "@/data/persist";

/** DS rule 9: each section shows a hint card on the first visit; dismissed hints are remembered on the device. */
const Ctx = createContext<{ seen: (k: string) => boolean; dismiss: (k: string) => void; reset: () => void } | null>(null);

export function HintsProvider({ children }: { children: ReactNode }) {
  const [dismissed, setDismissed, ready] = usePersistentState<string[]>("octo.hints.v1", []);
  const value = useMemo(
    () => ({
      seen: (k: string) => !ready || dismissed.includes(k),
      dismiss: (k: string) => setDismissed((d) => (d.includes(k) ? d : [...d, k])),
      reset: () => setDismissed([]),
    }),
    [dismissed, ready, setDismissed],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHints() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useHints outside HintsProvider");
  return v;
}
