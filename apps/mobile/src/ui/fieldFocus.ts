import { motion } from "@octo/design-tokens";

/**
 * How a field that opens in a sheet takes the focus (founder 09.11, #691: «чтобы сразу было выделено это число»).
 * The web: the input's own autoFocus + select on focus work. A phone: the focus asked while the sheet still slides in
 * is lost, and iOS does not select a number on focus — the field focuses itself once the sheet is up and selects all.
 */
export interface FocusPlan {
  /** the TextInput's own autoFocus */
  autoFocus: boolean;
  /** focus by hand after this many ms (null — not) */
  focusAfterMs: number | null;
  /** select the whole text by hand when focused (setSelection) */
  selectByHand: boolean;
}
export function focusPlan(os: string, o: { autoFocus?: boolean; selectOnFocus?: boolean; readOnly?: boolean }): FocusPlan {
  const native = os !== "web";
  const want = !!o.autoFocus && !o.readOnly;
  return { autoFocus: want && !native, focusAfterMs: want && native ? motion.durSlow : null, selectByHand: native && !!o.selectOnFocus };
}

/**
 * #2469 (CI twice: «150» over a price gave «50.00»): the select that follows the focus a moment later — the web's own (Safari puts the
 * caret back after a click), the phone's by hand — comes LATE on a slow device: after the first digit, it selects that digit and the
 * second one replaces it. The field selects all AT the focus; a late select is only allowed while nothing has been typed since.
 */
export function lateSelectOk(atFocus: string | null, now: string, focused: boolean): boolean {
  return focused && atFocus !== null && atFocus === now;
}
