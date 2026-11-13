/**
 * The summary chip in the lower corner of the canvas (#1274, founder 12.11: «строки выбора нет, вместо неё маленькая полупрозрачная плашка-сводка»).
 * Pure: the drawing, its parts (the engine's — rule 8, no arithmetic of our own for the pipes) and what is picked in, what the chip says out.
 *  - something is picked → the picked one: «Желоб · 29′»;
 *  - gutters drawn, no downspout yet → «86′ · Дальше: водостоки»;
 *  - otherwise → «[желоб] 86′ · [водосток] 3 · 30′» (the downspouts count and the pipes in 10-ft sticks; the consumables are not shown);
 *  - an empty drawing → nothing.
 */
import type { PartQty } from "@octo/estimating-engine";
import type { IconKey } from "@/ui/primitives";
import { runLengthIn, type Drawing } from "../geometry";

export type Summary =
  | { kind: "selected"; text: string; dsIcon: IconKey | null }
  | { kind: "nextDs"; gutterFt: number }
  | { kind: "total"; gutterFt: number; dsCount: number; pipeFt: number };

/** the gutters' total, whole feet (every run's length: typed wins over drawn) */
export const gutterFeet = (d: Pick<Drawing, "runs">): number => Math.round(d.runs.reduce((s, r) => s + runLengthIn(r), 0) / 12);

/** the downspout pipes to buy, feet: the engine's sticks (`dsstick.*`) × the stick's length (the attribute `stickIn`, 120″ = 10 ft by default) */
export function pipeFeet(parts: readonly Pick<PartQty, "key" | "qty" | "attrs">[]): number {
  return parts.filter((p) => p.key.startsWith("dsstick.")).reduce((s, p) => s + Number(p.qty) * (Number(p.attrs.stickIn) || 120) / 12, 0);
}

/** `hideNext`: the downspout tool is on (or a line is being drawn): the hint «Дальше: водостоки» is not said — the user is doing it */
export function summaryOf(d: Drawing, parts: readonly Pick<PartQty, "key" | "qty" | "attrs">[], picked: { text: string; dsIcon: IconKey | null } | null, hideNext = false): Summary | null {
  if (picked) return { kind: "selected", text: picked.text, dsIcon: picked.dsIcon };
  if (!d.runs.length) return null;
  if (!d.downspouts.length) return hideNext ? null : { kind: "nextDs", gutterFt: gutterFeet(d) };
  return { kind: "total", gutterFt: gutterFeet(d), dsCount: d.downspouts.length, pipeFt: Math.round(pipeFeet(parts)) };
}
