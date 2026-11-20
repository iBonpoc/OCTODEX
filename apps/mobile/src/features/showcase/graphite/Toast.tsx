/**
 * «Графит» — пилот витрины (#2254): the «Вернуть» toast (handoff §2.8, §3 п.11, 15; §5 п.5). One on the screen, a new one
 * replaces the old; ≤ 40 characters and one action; above the bottom nav. Comes up 12 pt with opacity in 250 ms, goes in
 * 200 ms; lives 5 s (2.5 s without an action); the clock stands while a finger is on it.
 */
import { useEffect, useRef } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { graphite } from "@octo/design-tokens";
import { GrPress, GrText, grTiming, useGr } from "./theme";

export interface GrToastMsg {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

/** how long a toast lives: 5 s with an action, half of it without */
export const toastLife = (withAction: boolean): number =>
  withAction ? graphite.motion.toastLife : graphite.motion.toastLife / 2;

export function GrToast({
  msg,
  onGone,
  bottom,
}: {
  msg: GrToastMsg | null;
  onGone: () => void;
  bottom: number;
}) {
  const { g, reduceMotion } = useGr();
  const p = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const arm = () => {
    stop();
    if (msg) timer.current = setTimeout(onGone, toastLife(!!msg.action));
  };
  useEffect(() => {
    p.value = 0;
    if (msg) {
      p.value = withTiming(1, grTiming(graphite.motion.toastIn, reduceMotion));
      arm();
    }
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg?.id]);
  const a = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [
      {
        translateY: reduceMotion
          ? 0
          : (1 - p.value) * graphite.motion.toastRise,
      },
    ],
  }));
  if (!msg) return null;
  return (
    <Animated.View
      testID="gr-toast"
      onTouchStart={stop}
      onTouchEnd={arm}
      style={[
        {
          position: "absolute",
          left: graphite.space[4],
          right: graphite.space[4],
          bottom,
          zIndex: graphite.z.toast,
        },
        a,
      ]}
    >
      <View
        style={{
          minHeight: graphite.size.control,
          borderRadius: graphite.radius.card,
          backgroundColor: g.toast,
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: graphite.space[4],
          gap: graphite.space[2],
        }}
      >
        <GrText v="sub" tone="onToast" style={{ flex: 1 }} lines={1}>
          {msg.text}
        </GrText>
        {msg.action ? (
          <GrPress
            testID="gr-toast-undo"
            accessibilityRole="button"
            accessibilityLabel={msg.action.label}
            onPress={() => {
              stop();
              msg.action?.run();
              onGone();
            }}
            style={{
              height: graphite.size.control,
              justifyContent: "center",
              paddingHorizontal: graphite.space[4],
            }}
          >
            <GrText v="sub" w="medium" tone="onToast">
              {msg.action.label}
            </GrText>
          </GrPress>
        ) : null}
      </View>
    </Animated.View>
  );
}
