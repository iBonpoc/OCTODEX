import type { ViewStyle } from "react-native";

/** the four corners of a sortable row taken from its group look (ui/groupedList `useGroupEdge`): a corner the look has not — square */
export type RowCorners = Required<Pick<ViewStyle, "borderTopLeftRadius" | "borderTopRightRadius" | "borderBottomLeftRadius" | "borderBottomRightRadius">>;

export function rowCorners(look: ViewStyle | undefined): RowCorners | undefined {
  if (!look) return undefined;
  return {
    borderTopLeftRadius: look.borderTopLeftRadius ?? 0,
    borderTopRightRadius: look.borderTopRightRadius ?? 0,
    borderBottomLeftRadius: look.borderBottomLeftRadius ?? 0,
    borderBottomRightRadius: look.borderBottomRightRadius ?? 0,
  };
}

/**
 * #2427: the clip of a FOLDED row of a group — on a phone the row lies in its swipe (estimate/SwipeRow), whose opaque square ground
 * and buttons would cover the card's corners (the left ones: the «≡» column stands outside the swipe). The open row has no swipe and
 * is not clipped (its own content stays free).
 */
export function rowClip(look: ViewStyle | undefined, open: boolean): ViewStyle | undefined {
  const c = rowCorners(look);
  if (!c || open) return undefined;
  return { ...c, overflow: "hidden" };
}
