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
