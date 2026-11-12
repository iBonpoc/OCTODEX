import { createContext, useCallback, useContext, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { TextInput, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { motion, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { haptics } from "./haptics";
import { Icon, T } from "./primitives";

/**
 * Required fields of a form (DS §11 п.3–4, спека редактора сметы Р10): the main button is always on; pressed with an empty
 * or wrong required field it shows the error under EVERY wrong field, scrolls smoothly to the FIRST (reduced motion — at
 * once), puts the focus into it (a text field), and vibrates `warning` once. Nothing is saved while an error stays.
 */

export type ViewNode = ComponentRef<typeof View>;
export type InputNode = ComponentRef<typeof TextInput>;

/** the screen's scroll, offered to the forms under it: `scrollToNode` brings a view `margin` below the top */
export interface ScreenScroll {
  scrollToNode: (node: ViewNode, margin: number, animated: boolean) => void;
}
export const ScreenScrollCtx = createContext<ScreenScroll | null>(null);
export const useScreenScroll = () => useContext(ScreenScrollCtx);

/** what a field takes from the form: its error, where it anchors for the scroll, and how it is focused and cleared */
export interface FieldBinding {
  id: string;
  testID: string;
  /** «что вписать» — under the field (alert + text), the frame `status.bad` */
  error?: string;
  anchorRef: (n: ViewNode | null) => void;
  inputRef: (n: InputNode | null) => void;
  /** the person edits the field: its error goes */
  clear: () => void;
}

export interface Problem {
  /** the field's id — as in `form.field(id)` and in the registry (`features/requiredFields.ts`) */
  id: string;
  /** what to enter: the text under the field */
  text: string;
}

export interface RequiredForm {
  field: (id: string) => FieldBinding;
  errors: Record<string, string>;
  /**
   * The main button: no problems — `ok()`; else the errors, the scroll to the first (in the order given), the focus, the
   * vibration. `reveal(id)` runs first for a field in a collapsed block (a row, a section, «Ещё»): the block opens.
   */
  submit: (problems: Problem[], ok: () => void, reveal?: (id: string) => void) => boolean;
  clearAll: () => void;
}

/** the scroll to the first wrong field: pure, so the order and the margin are tested */
export function firstProblem(problems: Problem[]): Problem | undefined {
  return problems[0];
}

export function useRequiredForm(): RequiredForm {
  const scroll = useScreenScroll();
  const reduce = useReducedMotion();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const nodes = useRef<Record<string, ViewNode | null>>({});
  const inputs = useRef<Record<string, InputNode | null>>({});
  const bindings = useRef<Record<string, FieldBinding>>({});
  const errorsRef = useRef(errors);
  errorsRef.current = errors;
  const clearOne = useCallback((id: string) => {
    setErrors((e) => {
      if (!(id in e)) return e;
      const { [id]: _gone, ...rest } = e;
      return rest;
    });
  }, []);
  const field = useCallback(
    (id: string): FieldBinding => {
      const have = bindings.current[id];
      // the binding is stable per id; its `error` is read at each render
      const b: FieldBinding = {
        id,
        testID: have?.testID ?? `field-${id}`,
        error: errorsRef.current[id],
        anchorRef: have?.anchorRef ?? ((n: ViewNode | null) => void (nodes.current[id] = n)),
        inputRef: have?.inputRef ?? ((n: InputNode | null) => void (inputs.current[id] = n)),
        clear: have?.clear ?? (() => clearOne(id)),
      };
      bindings.current[id] = b;
      return b;
    },
    [clearOne],
  );
  const submit = useCallback(
    (problems: Problem[], ok: () => void, reveal?: (id: string) => void) => {
      const first = firstProblem(problems);
      if (!first) {
        setErrors({});
        ok();
        return true;
      }
      setErrors(Object.fromEntries(problems.map((p) => [p.id, p.text])));
      haptics.warning();
      reveal?.(first.id);
      // after the block has opened and the errors are on the screen: scroll, then the focus (the keyboard comes last)
      setTimeout(() => {
        const node = nodes.current[first.id];
        if (node && scroll) scroll.scrollToNode(node, space[6], !reduce);
        setTimeout(() => inputs.current[first.id]?.focus?.(), reduce ? 0 : motion.durBase);
      }, 0);
      return false;
    },
    [scroll, reduce],
  );
  const clearAll = useCallback(() => setErrors({}), []);
  return useMemo(() => ({ field, errors, submit, clearAll }), [field, errors, submit, clearAll]);
}

/** «что вписать» under a field that is not a TextField / SelectField (a source picker, a chip group): alert + text */
export function FieldError({ text, testID }: { text?: string; testID?: string }) {
  const { c } = useTheme();
  if (!text) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }} accessibilityLiveRegion="polite" testID={testID}>
      <Icon name="alert" s={size.iconSm} color={c.status.bad.text} />
      <T v="caption" tone="bad">
        {text}
      </T>
    </View>
  );
}

/** a required field that brings its own control: the place for the scroll, the error under it */
export function Anchored({ field, children }: { field: FieldBinding; children: ReactNode }) {
  return (
    <View ref={field.anchorRef} collapsable={false} testID={field.testID} style={{ gap: space[1] }}>
      {children}
      <FieldError text={field.error} testID={`${field.testID}-error`} />
    </View>
  );
}
