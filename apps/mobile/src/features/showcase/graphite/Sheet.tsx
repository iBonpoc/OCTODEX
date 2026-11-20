/**
 * «Графит» — пилот витрины (#2254): the ½ sheet (handoff §2.7–§2.8, §3 п.14, §5 п.3). Floats 8 over the bottom with 8 side
 * margins, radius 16; closes by a swipe down, a tap on the dim, the close button. Up 320 ms, down 240 ms, one curve; the
 * finger 1:1, release rules and the 1:4 pull past the top — sheetMath.ts (unit-tested). While it moves, its blur is off.
 * «Уменьшить движение»: it appears and goes by opacity only, 120 ms.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { graphite } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { Icon } from "@/ui/primitives";
import { GrMatte } from "./Glass";
import { detents, dragHeight, release } from "./sheetMath";
import { GrPress, GrText, grTiming, useGr } from "./theme";

const SH = graphite.sheet;

export function GrSheet({
  open,
  onClose,
  title,
  children,
  onHeight,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onHeight?: (h: number) => void;
}) {
  const { t } = useI18n();
  const { g, reduceMotion } = useGr();
  const { height: screenH, width: screenW } = useWindowDimensions();
  const side = Math.max(SH.side, (screenW - SH.maxWidth) / 2);
  const d = detents(screenH);
  const target = d.half;
  const h = useSharedValue(0);
  const fade = useSharedValue(0);
  const start = useRef(0);
  const [shown, setShown] = useState(open);
  const [moving, setMoving] = useState(false);

  const settle = (to: number) => {
    setMoving(true);
    const done = (fin?: boolean) => {
      "worklet";
      if (!fin) return;
      runOnJS(setMoving)(false);
      if (to === 0) runOnJS(setShown)(false);
    };
    if (reduceMotion) {
      h.value = to === 0 ? h.value : to;
      fade.value = withTiming(to === 0 ? 0 : 1, grTiming(0, true), done);
    } else {
      fade.value = 1;
      h.value = withTiming(
        to,
        grTiming(
          to === 0 ? graphite.motion.sheetDown : graphite.motion.sheetUp,
          false,
        ),
        done,
      );
    }
    onHeight?.(to);
  };

  useEffect(() => {
    if (open) {
      setShown(true);
      settle(target);
    } else if (shown) settle(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pan = usePanGesture({
    runOnJS: true,
    enabled: shown,
    onActivate: () => {
      start.current = h.value;
      setMoving(true);
    },
    onUpdate: (e) => {
      h.value = dragHeight(start.current, e.translationY, target);
    },
    onDeactivate: (e) => {
      const to = release(h.value, e.velocityY / 1000, [target], target);
      if (to === 0) onClose();
      else settle(to);
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({
    height: h.value,
    opacity: fade.value,
  }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: target > 0 ? Math.min(1, h.value / target) * fade.value : 0,
  }));

  if (!shown) return null;
  return (
    <View
      style={[StyleSheet.absoluteFill, { zIndex: graphite.z.scrim }]}
      pointerEvents="box-none"
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: g.scrim },
          scrimStyle,
        ]}
      >
        <GrPress
          testID="gr-sheet-scrim"
          accessibilityRole="button"
          accessibilityLabel={t("ds.gr.close")}
          outer={StyleSheet.absoluteFill}
          style={{ flex: 1 }}
          onPress={onClose}
        >
          <View />
        </GrPress>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          testID="gr-sheet"
          style={[
            {
              position: "absolute",
              // a phone sheet: on a wide screen it keeps its width, centred
              left: side,
              right: side,
              bottom: SH.float,
              zIndex: graphite.z.sheet,
            },
            sheetStyle,
          ]}
        >
          <GrMatte
            sheet
            radius={graphite.radius.sheet}
            still={moving}
            style={{
              flex: 1,
              paddingHorizontal: graphite.space[4],
              paddingTop: graphite.space[2],
              gap: graphite.space[3],
            }}
          >
            <View style={{ alignItems: "center" }}>
              <View
                style={{
                  width: graphite.space[8],
                  height: graphite.space[1],
                  borderRadius: graphite.radius.pill,
                  backgroundColor: g.text3,
                }}
              />
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <GrText v="title">{title}</GrText>
              <GrPress
                testID="gr-sheet-close"
                accessibilityRole="button"
                accessibilityLabel={t("ds.gr.close")}
                onPress={onClose}
              >
                <GrMatte
                  flat
                  radius={graphite.radius.pill}
                  style={{
                    width: graphite.size.control,
                    height: graphite.size.control,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View>
                    <Icon name="close" s={graphite.size.glyph} color={g.text} />
                  </View>
                </GrMatte>
              </GrPress>
            </View>
            {children}
          </GrMatte>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
