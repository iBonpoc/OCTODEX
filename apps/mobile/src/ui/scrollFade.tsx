import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Platform, ScrollView, View, type ScrollViewInstance, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { fadedEdges } from "./viewTabsLogic";
import { fadeMask, SCROLL_FADE, SCROLL_FADE_X } from "./scrollFadeLogic";

/**
 * A vertical scroll fades at an edge that has more content past it (DS Б1: the body of a sheet; the same rule as the row
 * of view tabs, А1п — `fadedEdges`). The web: the content itself fades (a mask on the scroll node; the scroll bar's strip
 * `keepRight` stays whole) — right over glass; a phone draws a gradient of `color` over the edge (⬜ to check on a device).
 * Only the two flags are state: a scroll frame that does not change them renders nothing. Wire `onLayout`,
 * `onContentSizeChange` and `onScroll` of the ScrollView in `ref`, and put `overlay` in a box around it (position: relative).
 * `horizontal` (DS «ScrollFade», #3080): a row that scrolls sideways (a row of chips) fades at its left / right, `tab.fadeW`
 * wide — as the view tabs (А1п); `edges.top` / `edges.bottom` are then its left / right.
 */
export function useScrollFade(ref: RefObject<unknown>, color: string, keepRight = 0, horizontal = false) {
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
    const mask = fadeMask(top, bottom, keepRight, horizontal);
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
  }, [ref, top, bottom, keepRight, horizontal]);
  const onLayout = useCallback((ev: LayoutChangeEvent) => {
    m.current.view = horizontal ? ev.nativeEvent.layout.width : ev.nativeEvent.layout.height;
    update();
  }, [update, horizontal]);
  const onContentSizeChange = useCallback((w: number, h: number) => {
    m.current.content = horizontal ? w : h;
    update();
  }, [update, horizontal]);
  const onScroll = useCallback((ev: NativeSyntheticEvent<NativeScrollEvent>) => {
    m.current.offset = horizontal ? ev.nativeEvent.contentOffset.x : ev.nativeEvent.contentOffset.y;
    update();
  }, [update, horizontal]);
  const edgeX = (side: "left" | "right") => (
    <View key={side} pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, [side]: 0, width: SCROLL_FADE_X }}>
      <Svg width={SCROLL_FADE_X} height="100%">
        <Defs>
          <LinearGradient id={`sfx-${side}`} x1={side === "left" ? "0" : "1"} y1="0" x2={side === "left" ? "1" : "0"} y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={SCROLL_FADE_X} height="100%" fill={`url(#sfx-${side})`} />
      </Svg>
    </View>
  );
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
  const overlay = Platform.OS === "web" ? null
    : horizontal ? [top ? edgeX("left") : null, bottom ? edgeX("right") : null]
    : [top ? edge("top") : null, bottom ? edge("bottom") : null];
  return { onLayout, onContentSizeChange, onScroll, overlay, edges };
}

/**
 * A row that scrolls sideways (a row of chips that does not fit, DS «ScrollFade»): fades at an edge with more past it,
 * `tab.fadeW` wide. `ground` — the colour under the row (a phone draws the fade in it; the web fades the row itself).
 */
export function ScrollFadeRow({ ground, testID, children }: { ground: string; testID?: string; children: ReactNode }) {
  const ref = useRef<ScrollViewInstance>(null);
  const fade = useScrollFade(ref, ground, 0, true);
  return (
    <View style={{ position: "relative" }}>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        testID={testID}
        onLayout={fade.onLayout}
        onContentSizeChange={fade.onContentSizeChange}
        onScroll={fade.onScroll}
        scrollEventThrottle={16}
      >
        {children}
      </ScrollView>
      {fade.overlay}
    </View>
  );
}
