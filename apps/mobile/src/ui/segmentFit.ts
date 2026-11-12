/**
 * A choice that fits one line as a segment (DS А1в, #1095): up to 4 options, none longer than 14 characters, and all of
 * them together within a phone card — about 7 px a character and 26 px of padding for an option, 320 px in all (390 minus
 * the page and the card margins). Longer, or more — a field with a menu.
 */
export const SEGMENT_MAX_OPTIONS = 4;
export const SEGMENT_MAX_LABEL = 14;
export const fitsSegment = (labels: string[]): boolean =>
  labels.length > 0 &&
  labels.length <= SEGMENT_MAX_OPTIONS &&
  labels.every((l) => l.length <= SEGMENT_MAX_LABEL) &&
  labels.reduce((n, l) => n + l.length * 7, 0) + labels.length * 26 <= 320;
