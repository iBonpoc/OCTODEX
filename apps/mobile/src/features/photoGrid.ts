import { component, space } from "@octo/design-tokens";

/** #3076: the photo grid's tile for a width — at least 4 in a row, more while a tile stays ≥ `photoThumb`; the gaps are `space[2]` (DS §8.6а) */
export function gridTile(width: number, gap: number = space[2], least: number = component.photoThumb): number {
  const cols = Math.max(4, Math.floor((width + gap) / (least + gap)));
  return Math.floor((width - gap * (cols - 1)) / cols);
}
