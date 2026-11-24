import { component, space } from "@octo/design-tokens";

/**
 * #2421 / #2426 (founder 23.11: «я раздвигал позицию… слова и шрифты оставались на тех же местах… ничего мне не дёргается»): the
 * open line keeps its folded face on top (the name, «кол-во × цена», the sum stay where they were) and its fields come out under
 * it by HEIGHT, not by fade. `grow` 0…1 is the animation's place, `measured` the fields' own height: while it runs the part is
 * clipped to `grow × measured`; at the end its height is `auto`, so «Ещё» or
 * «Своя единица» opening later grow the row as usual. A worklet: the animated style calls it on the UI thread.
 */
export function openClip(grow: number, measured: number): { height: number | "auto"; overflow: "hidden" | "visible" } {
  "worklet";
  // both keys every time: an animated style that drops a key leaves its last value on a native view
  if (grow >= 1) return { height: "auto", overflow: "visible" };
  const g = grow <= 0 ? 0 : grow;
  return { height: g * (measured > 0 ? measured : 0), overflow: "hidden" };
}

/**
 * One grid for the two rows of the open line (#2426: «сдвинуто там, где себестоимость за единицу, потом единица»): row 1 is
 * «Кол-во» `estRow.qty` · «Ед.» `estRow.unit` · «Цена» (the rest); row 2 «Вид» takes the width of «Кол-во» and «Ед.» with the gap
 * between them, so «Себестоимость» starts and ends exactly under «Цена».
 */
export const kindWidth = (gap: number = space[2]) => component.estRow.qty + gap + component.estRow.unit;
