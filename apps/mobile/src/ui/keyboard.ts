import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/** Height of the on-screen keyboard (0 when hidden). iOS reports before the animation, Android after. */
export function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const show = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hide = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const a = Keyboard.addListener(show, (e) => setH(e.endCoordinates.height));
    const b = Keyboard.addListener(hide, () => setH(0));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return h;
}

/** KeyboardAvoidingView behaviour per platform (iOS pads, Android shrinks). */
export const avoidBehavior = Platform.OS === "ios" ? "padding" : "height";
