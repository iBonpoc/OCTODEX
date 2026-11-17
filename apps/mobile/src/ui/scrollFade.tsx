import { useCallback, useEffect, useState, type RefObject } from "react";
import { Platform, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { space } from "@octo/design-tokens";
import { fadedEdges } from "./viewTabsLogic";

/** how tall the fade at a scroll edge is (DS Б1): `space[6]` */
export const SCROLL_FADE = space[6];

/**
 * A vertical scroll fades at an edge that has more content past it (DS Б1: the body of a sheet; the same rule as the row
 * of view tabs, А1п — `fadedEdges`). The web: the content itself fades (a mask on the scroll node) — right over glass;
 * a phone draws a gradient of `color` (what is behind the scroll) over the edge. Wire `onLayout`, `onContentSizeChange`
 * and `onScroll` of the ScrollView in `ref`, and put `overlay` in a box around it (position: relative).
 */
export function useScrollFade(ref: RefObject<unknown>, color: string) {
  const [view, setView] = useState(0);
  const [content, setContent] = useState(0);
  const [offset, setOffset] = useState(0);
  const e = fadedEdges(offset, view, content);
  const top = e.left;
  const bottom = e.right;
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = (ref.current as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.();
    if (!node) return;
    const t = top ? SCROLL_FADE : 0;
    const b = bottom ? SCROLL_FADE : 0;
    const mask = t || b ? `linear-gradient(to bottom, transparent 0, #000 ${t}px, #000 calc(100% - ${b}px), transparent 100%)` : "none";
    node.style.maskImage = mask;
    node.style.setProperty("-webkit-mask-image", mask);
    node.dataset.fade = `${top ? "top" : ""}${top && bottom ? " " : ""}${bottom ? "bottom" : ""}` || "none";
  }, [ref, top, bottom]);
  const onLayout = useCallback((ev: LayoutChangeEvent) => setView(ev.nativeEvent.layout.height), []);
  const onContentSizeChange = useCallback((_w: number, h: number) => setContent(h), []);
  const onScroll = useCallback((ev: NativeSyntheticEvent<NativeScrollEvent>) => setOffset(ev.nativeEvent.contentOffset.y), []);
  const edge = (side: "top" | "bottom") => (
    <View key={side} pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, [side]: 0, height: SCROLL_FADE }}>
      <Svg width="100%" height={SCROLL_FADE}>
        <Defs>
          <LinearGradient id={`sf-${side}`} x1="0" y1={side === "top" ? "0" : "1"} x2="0" y2={side === "top" ? "1" : "0"}>
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={SCROLL_FADE} fill={`url(#sf-${side})`} />
      </Svg>
    </View>
  );
  const overlay = Platform.OS === "web" ? null : [top ? edge("top") : null, bottom ? edge("bottom") : null];
  return { onLayout, onContentSizeChange, onScroll, overlay, edges: { top, bottom } };
}
