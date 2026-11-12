import { createContext, useContext, type ReactNode } from "react";

const ReadOnlyCtx = createContext(false);
export function ReadOnly({ value, children }: { value: boolean; children: ReactNode }) {
  return <ReadOnlyCtx.Provider value={value}>{children}</ReadOnlyCtx.Provider>;
}
export const useReadOnly = () => useContext(ReadOnlyCtx);
