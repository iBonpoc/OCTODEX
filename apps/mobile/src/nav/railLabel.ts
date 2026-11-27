/**
 * The rail's caption (820/1280, #3011; layout review 27.11: «Сообщен…», «Поставщ…», «Заказы п…» were cut to one line): up to two
 * lines, broken only between words; when the longest WORD is wider than the cell the caption is drawn smaller, down to
 * `font.fitMinScale` — never broken inside a word (DS П6), never «…» while the floor holds. Pure: no react-native.
 */
import { component, font, space } from "@octo/design-tokens";

export const RAIL_LABEL_LINES = 2;
/** the room of a caption in the rail */
export const railLabelRoom = component.navRail - space[2];

/** the scale of the caption: 1 when its longest word fits the room, else room / word, never under `font.fitMinScale` */
export function railLabelScale(longestWordWidth: number, room = railLabelRoom): number {
  if (!(longestWordWidth > 0) || longestWordWidth <= room) return 1;
  return Math.max(font.fitMinScale, room / longestWordWidth);
}

/** the longest word of a caption (by characters — the one whose width is measured) */
export const longestWord = (label: string): string => label.split(/\s+/).reduce((a, w) => (w.length > a.length ? w : a), "");
