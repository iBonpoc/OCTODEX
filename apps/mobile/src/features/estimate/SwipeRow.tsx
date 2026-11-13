import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Dimensions, Platform, View } from "react-native";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { component, gesture, motion, size, space } from "@octo/design-tokens";
import { HINT_LEFT, HINT_RIGHT, swipedByHand } from "./swipeHint";
import { useTheme } from "@/theme/ThemeProvider";
import { createLock, swipes } from "./swipeState";
import { Icon, Press, T, type IconKey } from "@/ui/primitives";

/**
 * The swipe of an estimate row (DS Б13 п.2, spec Р2): LEFT shows buttons on the right («Заменить», «Удалить»), RIGHT shows one on
 * the left («Скрыть» / «Показать»). No full swipe: only a press on a button acts. One row is open: opening another closes the
 * first. No vibration (DS §15.6). The web has no swipe — the same actions are in «⋯» (the row draws that). A press on the row in
 * `durSlow` after a swipe does not open it (`swipedJustNow`).
 */
export interface SwipeBtn {
  key: string;
  label: string;
  icon: IconKey;
  /** `bad` — the red one («Удалить»); the others are the plain «surf2» */
  tone?: "bad";
  /** pale, the press explains (a priced line cannot be hidden) */
  dim?: boolean;
  testID?: string;
}


export function SwipeRow({
  children,
  left,
  right,
  onAct,
  hint,
  onHintPlayed,
}: {
  children: ReactNode;
  /**
   * the swipe hint of the first estimates (DS §8.11, `./swipeHint`): once the row is wholly on the screen it slides left by
   * `HINT_LEFT` buttons, back, right by `HINT_RIGHT`, back (each `durSlow`); not under «уменьшить движение», no vibration
   */
  hint?: boolean;
  /** the hint has played (the device counts the estimates it played in) */
  onHintPlayed?: () => void;
  /** the buttons revealed on the left (a swipe to the right) */
  left: SwipeBtn[];
  /** the buttons revealed on the right (a swipe to the left) */
  right: SwipeBtn[];
  onAct: (key: string) => void;
}) {
  const { c } = useTheme();
  const ref = useRef<SwipeableMethods>(null);
  const lock = useRef(createLock()).current;
  const reduce = useReducedMotion();
  const w = component.swipeAction.w;
  const tx = useSharedValue(0);
  const [hinting, setHinting] = useState(false);
  const box = useRef<ComponentRef<typeof View>>(null);
  const native = Platform.OS !== "web" && (left.length > 0 || right.length > 0);
  const playedRef = useRef(onHintPlayed);
  playedRef.current = onHintPlayed;
  useEffect(() => {
    if (!hint || reduce || !native) return;
    let gone = false;
    // a moment after the screen settles: only a row that is WHOLLY on the screen plays it
    const t = setTimeout(() => {
      box.current?.measureInWindow((_x: number, y: number, _w: number, h: number) => {
        if (gone || h <= 0 || y < 0 || y + h > Dimensions.get("window").height) return;
        setHinting(true);
        playedRef.current?.();
        const d = { duration: motion.durSlow };
        const done = (fin?: boolean) => {
          "worklet";
          if (fin) runOnJS(setHinting)(false);
        };
        tx.value = withSequence(
          withTiming(right.length ? -HINT_LEFT * w : 0, d),
          withTiming(0, d),
          withTiming(left.length ? HINT_RIGHT * w : 0, d),
          withTiming(0, d, done),
        );
      });
    }, motion.durSlow);
    return () => {
      gone = true;
      clearTimeout(t);
    };
    // the hint is decided once, when the row is first shown with it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint, reduce, native]);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  if (!native) return <>{children}</>;
  const buttons = (list: SwipeBtn[]) => () => (
    <View style={{ flexDirection: "row" }}>
      {list.map((b) => (
        <Press
          key={b.key}
          testID={b.testID}
          accessibilityRole="button"
          accessibilityLabel={b.label}
          onPress={() => {
            // once: until the row has closed, a second press does nothing
            if (!lock.take()) return;
            swipes.touched();
            ref.current?.close();
            onAct(b.key);
          }}
          containerStyle={{ width: w }}
          style={{
            flex: 1,
            width: w,
            alignItems: "center",
            justifyContent: "center",
            gap: space[1],
            backgroundColor: b.tone === "bad" ? c.status.bad.fill : c.surf2,
            opacity: b.dim ? component.dimOpacity : 1,
          }}
        >
          <Icon name={b.icon} s={size.iconMd} color={b.tone === "bad" ? c.status.bad.on : c.ink} />
          <T v="caption" w="semibold" style={{ color: b.tone === "bad" ? c.status.bad.on : c.ink }} numberOfLines={1}>
            {b.label}
          </T>
        </Press>
      ))}
    </View>
  );
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1}
      overshootLeft={false}
      overshootRight={false}
      dragOffsetFromLeft={gesture.slop}
      dragOffsetFromRight={-gesture.slop}
      leftThreshold={w / 2}
      rightThreshold={w / 2}
      renderLeftActions={left.length ? buttons(left) : undefined}
      renderRightActions={right.length ? buttons(right) : undefined}
      // not closer than space[4] to the left edge: the system «back» of iOS owns it (DS Б13)
      hitSlop={{ left: -space[4] }}
      // the buttons lie under the whole row: only an opaque row hides them at rest
      childrenContainerStyle={{ backgroundColor: c.surfSolid }}
      onSwipeableOpenStartDrag={() => {
        swipes.touched();
        // the person swipes by hand: they know — no more hints on this device
        swipedByHand();
      }}
      onSwipeableCloseStartDrag={swipes.touched}
      onSwipeableWillOpen={() => {
        swipes.touched();
        if (ref.current) swipes.opened(ref.current);
      }}
      onSwipeableClose={() => {
        swipes.touched();
        lock.release();
        if (ref.current) swipes.closed(ref.current);
      }}
    >
      <View ref={box} collapsable={false}>
        {/* while the hint plays, the buttons lie under the row as a swipe would show them (not pressable: it is a picture) */}
        {hinting ? (
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, flexDirection: "row", justifyContent: "space-between" }}>
            {buttons(left)()}
            {buttons(right)()}
          </View>
        ) : null}
        <Animated.View style={[{ backgroundColor: c.surfSolid }, slide]}>{children}</Animated.View>
      </View>
    </ReanimatedSwipeable>
  );
}
