import { component, space } from "@octo/design-tokens";

/** how tall the fade at a scroll edge is (DS Б1): `space[6]` */
export const SCROLL_FADE = space[6];
/** how wide the fade at the side of a row that scrolls sideways is (DS «ScrollFade», the same as the view tabs А1п): `tab.fadeW` */
export const SCROLL_FADE_X = component.tab.fadeW;

/**
 * The web mask of a scroll that fades at `top` / `bottom` (a row, `horizontal`: at its left / right); the right strip
 * `keepRight` wide (the scroll bar's side inset, #1339) never fades — a vertical scroll only.
 */
export function fadeMask(top: boolean, bottom: boolean, keepRight: number, horizontal = false): { image: string; size: string; position: string } | null {
  if (!top && !bottom) return null;
  const f = horizontal ? SCROLL_FADE_X : SCROLL_FADE;
  const t = top ? f : 0;
  const b = bottom ? f : 0;
  const grad = `linear-gradient(to ${horizontal ? "right" : "bottom"}, transparent 0, #000 ${t}px, #000 calc(100% - ${b}px), transparent 100%)`;
  if (horizontal) return { image: grad, size: "100% 100%", position: "0 0" };
  if (keepRight <= 0) return { image: grad, size: "100% 100%", position: "0 0" };
  return { image: `${grad}, linear-gradient(#000, #000)`, size: `100% 100%, ${keepRight}px 100%`, position: "0 0, 100% 0" };
}
