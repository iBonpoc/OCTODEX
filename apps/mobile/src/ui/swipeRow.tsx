/**
 * The shared row swipe of a list (#2350, DS Б13 п.2): a swipe RIGHT shows the `left` actions, a swipe LEFT the `right` ones.
 * The first action of a side stands at the outer edge. Full swipe — only to the right and only for a left action marked
 * `full` (reversible, with «Отменить»): past `component.swipeAction.full` of the row (and past its buttons) it is armed —
 * `light` vibration once (`haptics`) — and letting go there runs it. To the left — only a press on a button.
 * One row open at a time. Not closer than `gesture.edgeGuard` to the left edge (the system «back» of iOS owns it).
 * The web has no swipe: the children are drawn as they are, and the same actions stay in the card's own buttons / «⋯».
 * An irreversible action here keeps its own «Отменить» toast (rule 5): the row only calls it.
 * The math is `./swipeRowLogic` (unit-tested). The estimate lines keep their own swipe (features/estimate/SwipeRow, no full swipe).
 */
import { useRef, useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { component, gesture, radius as radii, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T, type IconKey } from "./primitives";
import { haptics } from "./haptics";
import { armBuzz, armedAt, createSwipeGroup, openThreshold, screenOrder, type SwipeGeom, type SwipeSide } from "./swipeRowLogic";

export interface SwipeAction {
  key: string;
  label: string;
  icon: IconKey;
  /** «bad» — the dangerous one (status `bad` fill); «ok» — «Готово» (status `ok` fill, DS Б13 п.2); the others «surf2» */
  tone?: "bad" | "ok";
  /** the first LEFT action only: a full swipe right runs it (reversible, with «Отменить»); ignored elsewhere */
  full?: boolean;
  onPress: () => void;
  testID?: string;
}

/** the rows of a screen: opening one closes the other */
const rows = createSwipeGroup();

export function SwipeRow({
  children,
  left = [],
  right = [],
  round = radii.inner,
  testID,
}: {
  children: ReactNode;
  /** revealed on the left by a swipe to the right; the first runs on a full swipe */
  left?: SwipeAction[];
  /** revealed on the right by a swipe to the left; the first runs on a full swipe */
  right?: SwipeAction[];
  /** the corner of the card inside (the buttons are clipped to it) */
  round?: number;
  testID?: string;
}) {
  const { c } = useTheme();
  const ref = useRef<SwipeableMethods>(null);
  const [rowW, setRowW] = useState(0);
  const armed = useRef<SwipeSide | null>(null);
  const busy = useRef(false);
  const w = component.swipeAction.w;
  const g: SwipeGeom = {
    rowW,
    btnW: w,
    full: component.swipeAction.full,
    nLeft: left.length,
    nRight: right.length,
    fullLeft: !!left[0]?.full,
    hysteresis: gesture.swipeFullHysteresis,
  };
  if (Platform.OS === "web" || (!left.length && !right.length)) return <>{children}</>;

  const run = (a: SwipeAction) => {
    // once: until the row has closed a second press does nothing
    if (busy.current) return;
    busy.current = true;
    ref.current?.close();
    a.onPress();
  };
  const onArm = (side: SwipeSide, on: boolean) => {
    const was = armed.current;
    const now = on ? side : was === side ? null : was;
    armed.current = now;
    if (armBuzz(was, now)) haptics.light();
  };
  const tint = (a: SwipeAction) => (a.tone ? { bg: c.status[a.tone].fill, fg: c.status[a.tone].on } : { bg: c.surf2, fg: c.ink });
  const face = (a: SwipeAction) => (
    <>
      <Icon name={a.icon} s={size.iconMd} color={tint(a).fg} />
      <T v="caption" w="semibold" style={{ color: tint(a).fg }} numberOfLines={1}>
        {a.label}
      </T>
    </>
  );
  const side = (list: SwipeAction[], s: SwipeSide) => (_p: SharedValue<number>, tx: SharedValue<number>) => (
    <Side list={list} side={s} tx={tx} geom={g} onArm={onArm} face={face} tint={tint} run={run} testID={testID} />
  );
  return (
    <View onLayout={(e) => setRowW(e.nativeEvent.layout.width)} testID={testID}>
      <ReanimatedSwipeable
        ref={ref}
        friction={1}
        // past the buttons the row goes on only toward a full swipe
        overshootLeft={g.fullLeft}
        overshootRight={false}
        dragOffsetFromLeft={gesture.slop}
        dragOffsetFromRight={-gesture.slop}
        leftThreshold={openThreshold(w)}
        rightThreshold={openThreshold(w)}
        renderLeftActions={left.length ? side(left, "left") : undefined}
        renderRightActions={right.length ? side(right, "right") : undefined}
        hitSlop={{ left: -gesture.edgeGuard }}
        // the row is opaque (the buttons lie under it) and clipped to the card's corner: no background between them
        containerStyle={{ borderRadius: round, overflow: "hidden" }}
        childrenContainerStyle={{ backgroundColor: c.surfSolid }}
        onSwipeableWillOpen={() => {
          if (ref.current) rows.opened(ref.current);
          const a = armed.current === "left" ? left[0] : armed.current === "right" ? right[0] : undefined;
          armed.current = null;
          if (a) run(a);
        }}
        onSwipeableClose={() => {
          busy.current = false;
          armed.current = null;
          if (ref.current) rows.closed(ref.current);
        }}
      >
        {children}
      </ReanimatedSwipeable>
    </View>
  );
}

/** the buttons of one side; past the full-swipe line the first one's colour covers the side (the action that will run) */
function Side({
  list,
  side,
  tx,
  geom,
  onArm,
  face,
  tint,
  run,
  testID,
}: {
  list: SwipeAction[];
  side: SwipeSide;
  tx: SharedValue<number>;
  geom: SwipeGeom;
  onArm: (side: SwipeSide, on: boolean) => void;
  face: (a: SwipeAction) => ReactNode;
  tint: (a: SwipeAction) => { bg: string; fg: string };
  run: (a: SwipeAction) => void;
  testID?: string;
}) {
  const w = geom.btnW;
  // the armed state lives on the UI thread (the hysteresis needs the last one); the JS side hears only a change
  const on = useSharedValue(false);
  useAnimatedReaction(
    () => armedAt(tx.value, geom, on.value) === side,
    (now, was) => {
      on.value = now;
      if (was !== null && now !== was) runOnJS(onArm)(side, now);
    },
    [geom.rowW, geom.nLeft, geom.nRight, geom.fullLeft],
  );
  const first = list[0]!;
  const band = useAnimatedStyle(() => ({ width: Math.max(w, Math.abs(tx.value)), opacity: on.value ? 1 : 0 }));
  return (
    <View style={{ flexDirection: "row", width: list.length * w }}>
      {screenOrder(list, side).map((a) => (
        <Press
          key={a.key}
          testID={testID ? `${testID}-${a.key}` : a.testID}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          onPress={() => run(a)}
          containerStyle={{ width: w }}
          style={{ flex: 1, width: w, alignItems: "center", justifyContent: "center", gap: space[1], backgroundColor: tint(a).bg }}
        >
          {face(a)}
        </Press>
      ))}
      <Animated.View
        pointerEvents="none"
        style={[
          { position: "absolute", top: 0, bottom: 0, backgroundColor: tint(first).bg, justifyContent: "center", gap: space[1], paddingHorizontal: space[4] },
          // the band grows from the outer edge to the row; the words stand by the row (as iOS Mail)
          side === "left" ? { left: 0, alignItems: "flex-end" } : { right: 0, alignItems: "flex-start" },
          band,
        ]}
      >
        <View style={{ alignItems: "center", gap: space[1] }}>{face(first)}</View>
      </Animated.View>
    </View>
  );
}
