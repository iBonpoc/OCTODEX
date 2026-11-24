/**
 * The rows of the one colour field of a gutter and a downspout (#2412 G1 PR2, DS §9б.6): «Как у gutter» (a downspout; the gutter's
 * sample) and «Без покраски» (a struck-through ring) first, then the palette — a sample and the name each; a colour the company no longer
 * installs keeps its word «· нет в списке». Pure: the window draws it with `ColorField`.
 */
import type { ColorChoice } from "@/ui/colorField";
import { MILL_ONLY, withCurrent } from "../canvas/attrs";
import { colorHex } from "../colorHex";

type Stock = { material: string; finish?: "mill" | "painted"; color?: string };
const isBare = (s: Stock) => (s.finish ?? (s.color ? "painted" : "mill")) === "mill";

export function colorChoices(a: Stock, palette: readonly string[], words: { asRun: (c: string) => string; mill: string; notOffered: string; color: (c: string) => string }, run?: Stock): { value: string; colors: ColorChoice<string>[] } {
  const list = withCurrent(palette as string[], a.color);
  const bare = isBare(a);
  const runOk = !!run && !MILL_ONLY.has(run.material);
  const runBare = run ? isBare(run) : false;
  const sameAsRun = runOk && (bare ? runBare : !runBare && run!.color === a.color);
  const value = sameAsRun ? "@run" : bare ? "@mill" : (a.color ?? list[0]!);
  const colors: ColorChoice<string>[] = [
    ...(runOk ? [{ key: "@run", label: words.asRun(runBare ? words.mill : words.color(run!.color ?? "")), top: true, ...(runBare ? { none: true } : { hex: colorHex(run!.color) }) }] : []),
    { key: "@mill", label: words.mill, top: true, none: true },
    ...list.map((c) => ({ key: c, label: palette.includes(c) ? words.color(c) : `${words.color(c)} · ${words.notOffered}`, hex: colorHex(c) })),
  ];
  return { value, colors };
}
