import { Platform } from "react-native";
import { gesture } from "@octo/design-tokens";

/**
 * The kind of pointer, not the width of the screen (#1245): a mouse or a pen on a laptop starts a drag by moving
 * `gesture.dragStart`; a finger — only by a hold of `gesture.dragHoldMs` (or by the handle), else the body of a row would
 * take the page's scroll away on an iPad. On the web the media query says whether the main pointer is fine; a phone and a
 * tablet app are fingers.
 */
export function finePointer(): boolean {
  if (Platform.OS !== "web") return false;
  const mm = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  return !!mm?.("(hover: hover) and (pointer: fine)").matches;
}

/** how a held row's body starts a drag for this pointer */
export function holdConfig(fine: boolean): { minDistance?: number; activateAfterLongPress?: number } {
  return fine ? { minDistance: gesture.dragStart } : { activateAfterLongPress: gesture.dragHoldMs };
}
