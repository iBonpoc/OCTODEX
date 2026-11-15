import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/** Height of the on-screen keyboard (0 when hidden). iOS reports before the animation, Android after. */
export function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (Platform.OS === "web") {
      // a phone's browser: the keyboard shrinks the VISUAL viewport, not the window. Not while the page is pinch-zoomed (it shrinks then too).
      const vv = typeof window !== "undefined" ? window.visualViewport : null;
      if (!vv) return;
      const on = () => {
        const covered = Math.round(window.innerHeight - vv.height - vv.offsetTop);
        setH(vv.scale <= 1.01 && covered > 120 ? covered : 0);
      };
      vv.addEventListener("resize", on);
      vv.addEventListener("scroll", on);
      on();
      return () => {
        vv.removeEventListener("resize", on);
        vv.removeEventListener("scroll", on);
      };
    }
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
