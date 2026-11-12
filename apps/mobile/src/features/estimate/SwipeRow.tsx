import { useRef, type ReactNode } from "react";
import { Platform, View } from "react-native";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { component, gesture, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
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

let lastSwipeAt = 0;
let openOne: SwipeableMethods | null = null;
/** a swipe ended a moment ago: the tap that follows it is the finger leaving, not a request to open the row */
export const swipedJustNow = (slow: number) => Date.now() - lastSwipeAt < slow;

export function SwipeRow({
  children,
  left,
  right,
  onAct,
}: {
  children: ReactNode;
  /** the buttons revealed on the left (a swipe to the right) */
  left: SwipeBtn[];
  /** the buttons revealed on the right (a swipe to the left) */
  right: SwipeBtn[];
  onAct: (key: string) => void;
}) {
  const { c } = useTheme();
  const ref = useRef<SwipeableMethods>(null);
  if (Platform.OS === "web" || (!left.length && !right.length)) return <>{children}</>;
  const w = component.swipeAction.w;
  const buttons = (list: SwipeBtn[]) => () => (
    <View style={{ flexDirection: "row" }}>
      {list.map((b) => (
        <Press
          key={b.key}
          testID={b.testID}
          accessibilityRole="button"
          accessibilityLabel={b.label}
          onPress={() => {
            lastSwipeAt = Date.now();
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
      onSwipeableOpenStartDrag={() => {
        lastSwipeAt = Date.now();
      }}
      onSwipeableCloseStartDrag={() => {
        lastSwipeAt = Date.now();
      }}
      onSwipeableWillOpen={() => {
        lastSwipeAt = Date.now();
        if (openOne && openOne !== ref.current) openOne.close();
        openOne = ref.current;
      }}
      onSwipeableClose={() => {
        lastSwipeAt = Date.now();
        if (openOne === ref.current) openOne = null;
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
