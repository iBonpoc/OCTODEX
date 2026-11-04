import { usePersistentState } from "@/data/persist";

/**
 * Trade modules switched on for this company (on this device for now; company settings in the database later).
 * The core works without any module; Gutters adds the quick gutter form and the photo drawing.
 */
export interface Modules {
  gutters: boolean;
}
const DEFAULT: Modules = { gutters: true };

export function useModules(): Modules & { set: (m: Partial<Modules>) => void } {
  const [m, setM] = usePersistentState<Modules>("octo.modules.v1", DEFAULT);
  return { ...DEFAULT, ...m, set: (p) => setM((x) => ({ ...x, ...p })) };
}
