/**
 * The Overview's head (DS §12.13 «Шапка», #2841, #2844 б): the 30 title is the tab's word («Главная»); the 13 line over it —
 * the date and the greeting. No greeting (no name) — only the date, the tab's word stands once (Д-шапка-4).
 * The live screen and its showcase preview both take it from here — the showcase shows the screen as it is.
 */
export function overviewHead(title: string, g: { date: string; text?: string } | undefined): { title: string; kicker: string | undefined } {
  return { title, kicker: g ? [g.date, g.text].filter(Boolean).join(" · ") || undefined : undefined };
}
