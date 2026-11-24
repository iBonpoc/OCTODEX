/**
 * The samples of the module's colours (#2412 G1 PR2, DS §9б.6; CLAUDE.md rule 2, 3rd exception): data of the module, never app tokens —
 * the colours of a supplier's card are its data (founder 16.11 «цвет палитрой с названиями»). Shown only in the colour field and its
 * list, always beside the name. Approximate samples (no supplier's colour book is in the repository): a company's own name without a
 * sample shows the name alone. Keys are lower case (a name is matched ignoring case).
 */
export const COLOR_HEX: Readonly<Record<string, string>> = {
  // the module's words (COLORS)
  white: "#F5F5F1",
  almond: "#E9DCC3",
  linen: "#E6DFCF",
  clay: "#B9A98E",
  brown: "#5A3E2E",
  musket: "#6B5A45",
  bronze: "#4B3B2C",
  black: "#1C1C1C",
  gray: "#8A8C8C",
  // the founder's list (PALETTE_ALL)
  "high gloss white": "#F7F7F4",
  satin: "#EFEDE6",
  "low gloss white": "#F1F1EC",
  crème: "#EEE3CB",
  sandcastle: "#D8C7A8",
  ivory: "#EDE6D2",
  wicker: "#CDB58E",
  "wood beige": "#C2AE8F",
  "buckskin brown": "#8E6E4F",
  "colonial grey": "#9D9C92",
  "dark grey": "#55585A",
  terratone: "#7C6A55",
  "tuxedo grey": "#3E4244",
  "royal brown": "#4A3226",
  "musket brown": "#6B5A45",
  "musket brown a": "#6B5A45",
  "harvest brown": "#7A5134",
  blue: "#2F4A6B",
  green: "#3F5B44",
  red: "#7D2E28",
  "natural clay": "#B5A488",
  "amp dark bronze": "#3E3328",
  "grecian green": "#4F6B52",
  "dark bronze": "#3E3328",
  "80 white": "#F3F3EE",
};

/** a colour's sample, or none (a company's own name) */
export function colorHex(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const k = name.toLowerCase();
  return Object.prototype.hasOwnProperty.call(COLOR_HEX, k) ? COLOR_HEX[k] : undefined;
}
