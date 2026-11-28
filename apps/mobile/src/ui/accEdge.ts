import { component, type ThemeColors } from "@octo/design-tokens";

/**
 * GoRix слой «Основа», решение основателя #2935 п.2 (27.11.2026: «вернуть при включенном повышении контраста»):
 * у жёлтой заливки кнопки обводки нет (#2363 F36), но при системном «Повышении контраста» возвращается кромка `accEdge` —
 * на солнце жёлтая кнопка в светлой теме иначе сливается с фоном (1,2:1). В тёмной теме `accEdge` прозрачна — кромки нет.
 */
export function accEdgeFrame(c: Pick<ThemeColors, "accEdge">, highContrast: boolean): { borderWidth: number; borderColor: string } {
  const on = highContrast && c.accEdge !== "transparent";
  return { borderWidth: on ? component.selectedBorder : 0, borderColor: on ? c.accEdge : "transparent" };
}
