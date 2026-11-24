/** DS Б3 (#2381): what a confirmation dialog asks and how its buttons stand — pure, unit-tested (test/confirmDialog.test.ts) */
import { buttonPairLayout } from "./pairLayout";

export type ConfirmTone = "danger" | "primary" | "cancel";
export interface ConfirmAction {
  key: string;
  label: string;
  /** `danger` — the irreversible step (red); `primary` — a step chosen on purpose; `cancel` — the way back (`ghost`) */
  tone?: ConfirmTone;
  testID?: string;
}
export interface ConfirmAsk {
  title: string;
  text?: string;
  actions: ConfirmAction[];
  testID?: string;
}

/** the buttons' order and layout (pure, unit-tested): a row for two short ones (back left, step right), else a column (steps first) */
export function confirmLayout(actions: readonly ConfirmAction[]): { how: "row" | "column"; order: ConfirmAction[] } {
  const back = actions.filter((a) => a.tone === "cancel");
  const steps = actions.filter((a) => a.tone !== "cancel");
  if (actions.length === 2 && back.length === 1 && buttonPairLayout(actions.map((a) => ({ label: a.label }))) === "row") return { how: "row", order: [...back, ...steps] };
  return { how: "column", order: [...steps, ...back] };
}

