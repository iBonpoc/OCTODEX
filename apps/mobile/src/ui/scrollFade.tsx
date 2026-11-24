import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Platform, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { fadedEdges } from "./viewTabsLogic";
import { fadeMask, SCROLL_FADE } from "./scrollFadeLogic";

/**
 * A vertical scroll fades at an edge that has more content past it (DS Б1: the body of a sheet; the same rule as the row
 * of view tabs, А1п — `fadedEdges`). The web: the content itself fades (a mask on the scroll node; the scroll bar's strip
 * `keepRight` stays whole) — right over glass; a phone draws a gradient of `color` over the edge (⬜ to check on a device).
 * Only the two flags are state: a scroll frame that does not change them renders nothing. Wire `onLayout`,
 * `onContentSizeChange` and `onScroll` of the ScrollView in `ref`, and put `overlay` in a box around it (position: relative).
 */
export function useScrollFade(ref: RefObject<unknown>, color: string, keepRight = 0) {
  const m = useRef({ view: 0, content: 0, offset: 0 });
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const update = useCallback(() => {
    const e = fadedEdges(m.current.offset, m.current.view, m.current.content);
    setEdges((s) => (s.top === e.left && s.bottom === e.right ? s : { top: e.left, bottom: e.right }));
  }, []);
  const { top, bottom } = edges;
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = (ref.current as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.();
    if (!node) return;
    const mask = fadeMask(top, bottom, keepRight);
    for (const [k, v] of [
      ["mask-image", mask?.image ?? "none"],
      ["mask-size", mask?.size ?? ""],
      ["mask-position", mask?.position ?? ""],
      ["mask-repeat", mask ? "no-repeat" : ""],
    ] as const) {
      node.style.setProperty(k, v);
      node.style.setProperty(`-webkit-${k}`, v);
    }
    node.dataset.fade = `${top ? "top" : ""}${top && bottom ? " " : ""}${bottom ? "bottom" : ""}` || "none";
  }, [ref, top, bottom, keepRight]);
  const onLayout = useCallback((ev: LayoutChangeEvent) => {
    m.current.view = ev.nativeEvent.layout.height;
    update();
  }, [update]);
  const onContentSizeChange = useCallback((_w: number, h: number) => {
    m.current.content = h;
    update();
  }, [update]);
  const onScroll = useCallback((ev: NativeSyntheticEvent<NativeScrollEvent>) => {
    m.current.offset = ev.nativeEvent.contentOffset.y;
    update();
  }, [update]);
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
  return { onLayout, onContentSizeChange, onScroll, overlay, edges };
}
