import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, View, type LayoutChangeEvent, type ScrollViewInstance } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useReducedMotion } from "react-native-reanimated";
import { component, motion, radius, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { fillStyle } from "./fill";
import { Press, T } from "./primitives";
import { centerOffset, fadedEdges, nudgeDistance } from "./viewTabsLogic";

/** the rows that have nudged already (one nudge per row and app run — «при первом открытии», DS §9 А1п) */
const nudged = new Set<string>();

/**
 * Вкладки вида, листаются (DS §9 А1п, #1343): a screen of an object with 5+ sections. Pills `tab.h` 30 in a zone of 44 (a real
 * box, not a hit slop), no track;
 * the selected one is «Заливка» (§9). All tabs are always there; a number in a pill is what waits for an action (none when
 * nothing waits). The row scrolls sideways: the selected pill comes to the middle, an edge with more tabs past it fades
 * (`tab.fadeW`), and on the first open the row nudges once to show it scrolls (none with reduced motion).
 * `bleed` — the screen's side padding: the row runs to the screen's edges, its pills start at the padding.
 */
export function ViewTabs<K extends string>({
  items,
  value,
  onChange,
  label,
  testID,
  bleed = space[4],
  fade,
}: {
  items: { key: K; label: string; count?: number }[];
  value: K;
  onChange: (k: K) => void;
  /** what the tabs are of — read with the group («Разделы клиента») */
  label: string;
  /** each tab gets `<testID>-<key>` (tests find a tab by it — CHECKS §9 п.2) */
  testID?: string;
  bleed?: number;
  /** the colour the edges fade into — what is behind the row (the page, or the bar once it sticks) */
  fade?: string;
}) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const strip = useRef<ScrollViewInstance>(null);
  const [boxes, setBoxes] = useState<Record<string, { x: number; w: number }>>({});
  const [view, setView] = useState(0);
  const [content, setContent] = useState(0);
  const [offset, setOffset] = useState(0);
  const ready = Object.keys(boxes).length === items.length && view > 0;

  // the selected pill to the middle (a remembered tab past the edge comes into view too)
  useEffect(() => {
    const b = boxes[value];
    if (!ready || !b) return;
    strip.current?.scrollTo({ x: centerOffset(b, view, content), animated: !reduce });
  }, [value, ready, boxes, view, content, reduce]);

  // the one nudge: out and back, only when the row is longer than the screen
  useEffect(() => {
    const key = testID ?? label;
    if (!ready || reduce || nudged.has(key)) return;
    const d = nudgeDistance(view, content);
    if (!d || value !== items[0]?.key) return;
    nudged.add(key);
    const out = setTimeout(() => strip.current?.scrollTo({ x: d, animated: true }), motion.durSlow * 2);
    const back = setTimeout(() => strip.current?.scrollTo({ x: 0, animated: true }), motion.durSlow * 2 + motion.durBase * 2);
    return () => {
      clearTimeout(out);
      clearTimeout(back);
    };
  }, [ready, reduce, view, content, value, items, testID, label]);

  const edges = fadedEdges(offset, view, content);
  // the web: the pills themselves fade (a mask) — right on any background, glass or not; a phone draws the fade over them
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = (strip.current as unknown as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.();
    if (!node) return;
    const l = edges.left ? component.tab.fadeW : 0;
    const r = edges.right ? component.tab.fadeW : 0;
    const mask = l || r ? `linear-gradient(to right, transparent 0, #000 ${l}px, #000 calc(100% - ${r}px), transparent 100%)` : "none";
    node.style.maskImage = mask;
    node.style.setProperty("-webkit-mask-image", mask);
  }, [edges.left, edges.right]);
  const fadeTo = fade ?? c.bg;
  const fadeW = component.tab.fadeW;
  const edge = (side: "left" | "right") => (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, [side]: 0, width: fadeW }}>
      <Svg width={fadeW} height="100%">
        <Defs>
          <LinearGradient id={`vt-${side}`} x1={side === "left" ? "0" : "1"} y1="0" x2={side === "left" ? "1" : "0"} y2="0">
            <Stop offset="0" stopColor={fadeTo} stopOpacity={1} />
            <Stop offset="1" stopColor={fadeTo} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={fadeW} height="100%" fill={`url(#vt-${side})`} />
      </Svg>
    </View>
  );

  return (
    <View testID={testID} style={{ marginHorizontal: -bleed }}>
      <ScrollView
        ref={strip}
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        accessibilityLabel={label}
        // stops at a pill's start (the padding before it), not between two pills
        snapToOffsets={ready ? items.map((it) => Math.max(0, (boxes[it.key]?.x ?? 0) - bleed)) : undefined}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={(e) => setOffset(e.nativeEvent.contentOffset.x)}
        onLayout={(e) => setView(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContent(w)}
        contentContainerStyle={{ paddingHorizontal: bleed, gap: space[2], alignItems: "center" }}
      >
        {items.map((it) => {
          const sel = it.key === value;
          return (
            <Press
              key={it.key}
              testID={testID ? `${testID}-${it.key}` : undefined}
              onPress={() => onChange(it.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: sel }}
              // the web does not turn `selected` into aria-selected by itself (a screen reader and the tests read it)
              {...({ "aria-selected": sel } as object)}
              accessibilityLabel={it.count ? `${it.label}, ${it.count}` : it.label}
              onLayout={(e: LayoutChangeEvent) => {
                const { x, width: w } = e.nativeEvent.layout;
                setBoxes((p) => (p[it.key]?.x === x && p[it.key]?.w === w ? p : { ...p, [it.key]: { x, w } }));
              }}
              // the zone is the whole 44 (a real box, not a hit slop: a slop is cut at the strip's edge and the web has none;
              // nor do two neighbours' zones overlap) — the visible pill of 30 sits in its middle (#1343 review)
              style={{ minHeight: size.hitMin, justifyContent: "center" }}
            >
              <View
                style={{
                  minHeight: component.tab.h,
                  paddingHorizontal: space[3],
                  borderRadius: radius.pill,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space[1],
                  // not selected — no plate, `mut` words (DS §9 А1п, «Выделение выбранного»; on `track` the dark theme hid the choice, #1416)
                  ...(sel ? fillStyle(c) : null),
                }}
              >
                <T v="button" w={sel ? "semibold" : undefined} style={{ color: sel ? c.ink : c.mut }} numberOfLines={1}>
                  {it.label}
                </T>
                {it.count ? (
                  <View testID={testID ? `${testID}-${it.key}-count` : undefined}>
                    <T v="caption" tone="mut" tabular>
                      {String(it.count)}
                    </T>
                  </View>
                ) : null}
              </View>
            </Press>
          );
        })}
      </ScrollView>
      {Platform.OS !== "web" && edges.left ? edge("left") : null}
      {Platform.OS !== "web" && edges.right ? edge("right") : null}
    </View>
  );
}
