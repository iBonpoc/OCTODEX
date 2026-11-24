/**
 * ConfirmDialog (DS Б3, #2381; the lead's call 22.11: «необратимое → окно по центру, не шторка»): a question over the screen for the
 * irreversible and the rare — the window in the middle on every width, `Glass strong`, `min(screen − 2 × space[6], alertMaxW)`,
 * the title `heading` (a question), an optional text `body mut`, up to 3 buttons. Two short ones stand in a row — the way back on the
 * left (`ghost`), the step on the right; else a column, the step(s) first, the way back last. A dangerous step is `danger`, a chosen
 * one `primary`. The scrim does NOT close it; Esc and Android «Назад» are the way back. It scales from `alertScale` with the fade in
 * `durBase` (reduced motion: the fade only). No vibration. Read out as an alert (web: `alertdialog`, labelled by its title).
 * `useConfirm` asks with a promise: `await ask({...})` → the key pressed, or null for the way back.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { confirmQueue } from "./confirmQueue";
import { Modal, Platform, View, useWindowDimensions } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, Keyframe, useReducedMotion } from "react-native-reanimated";
import { component, motion, radius, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Button } from "./controls";
import { ALL_ORIENTATIONS, Glass } from "./overlays";
import { T } from "./primitives";

import { confirmLayout, type ConfirmAction, type ConfirmAsk } from "./confirmLayout";
export type { ConfirmAction, ConfirmAsk, ConfirmTone } from "./confirmLayout";

const pop = new Keyframe({
  0: { opacity: 0, transform: [{ scale: motion.alertScale }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.out(Easing.cubic) },
}).duration(motion.durBase);

export function ConfirmDialog({ ask, onPick }: { ask: ConfirmAsk | null; onPick: (key: string | null) => void }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const w = Math.min(width - 2 * space[6], component.alertMaxW);
  const back = ask?.actions.find((a) => a.tone === "cancel");
  const layout = ask ? confirmLayout(ask.actions) : null;
  const titleId = "confirm-dialog-title";
  const textId = "confirm-dialog-text";
  return (
    <Modal transparent visible={!!ask} animationType="none" onRequestClose={() => onPick(back ? back.key : null)} statusBarTranslucent supportedOrientations={ALL_ORIENTATIONS}>
      {/* the scrim: it does not close the question (DS Б3) */}
      <Animated.View entering={reduce ? undefined : FadeIn.duration(motion.durFast)} exiting={reduce ? undefined : FadeOut.duration(motion.durFast)} style={{ flex: 1, backgroundColor: c.scrim, alignItems: "center", justifyContent: "center" }}>
        {ask && layout ? (
          <Animated.View
            entering={reduce ? FadeIn.duration(motion.durBase) : pop}
            testID={ask.testID ?? "confirm-dialog"}
            accessibilityRole="alert"
            accessibilityViewIsModal
            {...(Platform.OS === "web" ? ({ role: "alertdialog", "aria-modal": true, "aria-labelledby": titleId, ...(ask.text ? { "aria-describedby": textId } : {}) } as object) : {})}
            style={{ width: w }}
          >
            <Glass strong style={{ borderRadius: radius.card, padding: space[5], gap: space[4] }}>
              <View style={{ gap: space[2] }}>
                <T v="heading" {...({ nativeID: titleId } as object)}>
                  {ask.title}
                </T>
                {ask.text ? (
                  <T v="body" tone="mut" {...({ nativeID: textId } as object)}>
                    {ask.text}
                  </T>
                ) : null}
              </View>
              <View style={{ flexDirection: layout.how === "row" ? "row" : "column", gap: space[2] }}>
                {layout.order.map((a) => (
                  <View key={a.key} testID={a.testID} style={layout.how === "row" ? { flex: 1, minWidth: 0 } : undefined}>
                    <Button label={a.label} full variant={a.tone === "danger" ? "danger" : a.tone === "primary" ? "primary" : a.tone === "cancel" ? "ghost" : "secondary"} onPress={() => onPick(a.key)} />
                  </View>
                ))}
              </View>
            </Glass>
          </Animated.View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

/** ask a question and wait for the answer: `const [dialog, ask] = useConfirm(); … if ((await ask({...})) === "yes") …`
 *  (the queue — ui/confirmQueue.ts: one at a time, an unmount answers an open one null) */
export function useConfirm(): [ReactNode, (a: ConfirmAsk) => Promise<string | null>] {
  const [ask, setAsk] = useState<ConfirmAsk | null>(null);
  const q = useRef(confirmQueue<ConfirmAsk>(setAsk)).current;
  useEffect(() => () => q.dispose(), [q]);
  const request = useCallback((a: ConfirmAsk) => q.ask(a), [q]);
  return [<ConfirmDialog key="confirm" ask={ask} onPick={(k) => q.answer(k)} />, request];
}
