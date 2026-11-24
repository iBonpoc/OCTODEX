import { space } from "@octo/design-tokens";

/** how tall the fade at a scroll edge is (DS Б1): `space[6]` */
export const SCROLL_FADE = space[6];

/** the web mask of a scroll that fades at `top` / `bottom`; the right strip `keepRight` wide (the scroll bar's side inset, #1339) never fades */
export function fadeMask(top: boolean, bottom: boolean, keepRight: number): { image: string; size: string; position: string } | null {
  if (!top && !bottom) return null;
  const t = top ? SCROLL_FADE : 0;
  const b = bottom ? SCROLL_FADE : 0;
  const grad = `linear-gradient(to bottom, transparent 0, #000 ${t}px, #000 calc(100% - ${b}px), transparent 100%)`;
  if (keepRight <= 0) return { image: grad, size: "100% 100%", position: "0 0" };
  return { image: `${grad}, linear-gradient(#000, #000)`, size: `100% 100%, ${keepRight}px 100%`, position: "0 0, 100% 0" };
}
