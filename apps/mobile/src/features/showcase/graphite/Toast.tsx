/**
 * «Графит» — пилот витрины (#2254): «Вернуть» toasts (handoff v2 §2.8, §3 п.11, 15; §5 п.5). A stack of up to 3, the new
 * one on top, each with its own «Вернуть» and its own clock; each lives ≥ 5 s (with an action or without); the clock stands
 * while a finger is on it; with VoiceOver on there is no clock — each toast is read out and stays until acted on or a fourth
 * pushes it out. Above the bottom nav. Comes up 12 pt with opacity in 250 ms (only opacity under «уменьшить движение»).
 * The stack's arithmetic — toastPush (unit-tested).
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { graphite } from "@octo/design-tokens";
import { GrPress, GrText, grTiming, useGr } from "./theme";
import { toastPush } from "./toastMath";

export { toastPush };

export interface GrToastMsg {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

/** each toast lives at least 5 s, with an action or without (v2 §2.8) */
export const toastLife = (): number => graphite.motion.toastLife;

function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled?.()
      .then((v) => live && setOn(!!v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      (v: boolean) => setOn(!!v),
    );
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  return on;
}

function OneToast({
  msg,
  onGone,
  reader,
}: {
  msg: GrToastMsg;
  onGone: (id: number) => void;
  reader: boolean;
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
    if (!reader) timer.current = setTimeout(() => onGone(msg.id), toastLife());
  };
  useEffect(() => {
    p.value = withTiming(1, grTiming(graphite.motion.toastIn, reduceMotion));
    AccessibilityInfo.announceForAccessibility?.(
      msg.action ? `${msg.text}. ${msg.action.label}` : msg.text,
    );
    arm();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader]);
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
  return (
    <Animated.View
      testID="gr-toast"
      onTouchStart={stop}
      onTouchEnd={arm}
      style={a}
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
              onGone(msg.id);
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

export function GrToasts({
  stack,
  onGone,
  bottom,
}: {
  stack: GrToastMsg[];
  onGone: (id: number) => void;
  bottom: number;
}) {
  const reader = useScreenReader();
  if (!stack.length) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: graphite.space[4],
        right: graphite.space[4],
        bottom,
        zIndex: graphite.z.toast,
        gap: graphite.space[2],
      }}
    >
      {stack.map((m) => (
        <OneToast key={m.id} msg={m} onGone={onGone} reader={reader} />
      ))}
    </View>
  );
}
