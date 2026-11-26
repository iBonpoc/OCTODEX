/**
 * A choice that fits one line as a segment (DS А1в, #1095): up to 4 options, none longer than 14 characters, and all of
 * them together within a phone card — about 8 px a character and 26 px of padding for an option, 320 px in all (390 minus
 * the page and the card margins). Longer, or more — a field with a menu.
 * 8, not 7 (#2829): measured in the app's caption 13/600 (Manrope), Russian is 7.8–8.3 px a letter («Диспетчер» 70,
 * «Продажи» 58); at 7 the four roles «Мастер · Диспетчер · Директор · Продажи» counted 314 ≤ 320 and were cut at 335.
 */
export const SEGMENT_CHAR_PX = 8;
export const SEGMENT_MAX_OPTIONS = 4;
export const SEGMENT_MAX_LABEL = 14;
export const fitsSegment = (labels: string[]): boolean =>
  labels.length > 0 &&
  labels.length <= SEGMENT_MAX_OPTIONS &&
  labels.every((l) => l.length <= SEGMENT_MAX_LABEL) &&
  labels.reduce((n, l) => n + l.length * SEGMENT_CHAR_PX, 0) + labels.length * 26 <= 320;

