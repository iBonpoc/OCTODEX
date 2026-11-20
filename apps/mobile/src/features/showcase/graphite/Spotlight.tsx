/**
 * «Графит» — пилот витрины (#2254): the bottom nav «Прожектор» (handoff §3 п.22, §4.5, §5 п.1). A liquid-glass pill,
 * five slots (Сегодня, План, ＋, Клиенты, Чаты); «＋» is the yellow 52 circle; a badge on «Чаты». The selected slot has
 * a 500 caption and the beam over it: a line on the pill's top edge with a cone of light down; it runs to the new slot
 * in 320 ms with the one curve, only at the change. «Уменьшить движение»: no run, the beam fades in 120 ms in place.
 * Where it stands — beamMath.ts (unit-tested).
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { graphite } from "@octo/design-tokens";
import { useI18n, type DictKey } from "@/i18n";
import { Icon, type IconKey } from "@/ui/primitives";
import { GrLiquid } from "./Glass";
import { beamWidth, beamX, nextBeamSlot } from "./beamMath";
import { GrPress, GrText, grTiming, useGr } from "./theme";

const SLOTS: { id: string; label: DictKey; icon: IconKey }[] = [
  { id: "today", label: "ds.gr.tab.today", icon: "home" },
  { id: "plan", label: "ds.gr.tab.plan", icon: "calendar" },
  { id: "new", label: "ds.gr.tab.new", icon: "plus" },
  { id: "clients", label: "ds.gr.tab.clients", icon: "users" },
  { id: "chats", label: "ds.gr.tab.chats", icon: "message" },
];
const PLUS = 2;
const S = graphite.size;

export function SpotlightNav({
  badge,
  onPlus,
}: {
  badge: number;
  onPlus: () => void;
}) {
  const { t } = useI18n();
  const { g, name, reduceMotion } = useGr();
  const [sel, setSel] = useState(0);
  const [w, setW] = useState(0);
  const bw = beamWidth(w, SLOTS.length);
  const x = useSharedValue(0);
  const glow = useSharedValue(1);
  const lineH = graphite.beam[name];

  useEffect(() => {
    const to = beamX(sel, w, SLOTS.length, bw);
    if (reduceMotion) {
      x.value = to;
      glow.value = withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1, grTiming(graphite.motion.beam, true)),
      );
    } else x.value = withTiming(to, grTiming(graphite.motion.beam, false));
    // the beam moves only when the slot or the width changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, w, bw, reduceMotion]);

  const beamStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    opacity: glow.value,
  }));

  return (
    <GrLiquid
      radius={graphite.radius.pill}
      testID="gr-nav"
      style={{ height: S.nav }}
    >
      <View
        style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
      >
        {SLOTS.map((s, i) => {
          const on = i === sel;
          if (i === PLUS) {
            return (
              <View key={s.id} style={{ flex: 1, alignItems: "center" }}>
                <GrPress
                  testID="gr-nav-plus"
                  accessibilityRole="button"
                  accessibilityLabel={t(s.label)}
                  onPress={onPlus}
                >
                  <View
                    style={{
                      width: S.plus,
                      height: S.plus,
                      borderRadius: graphite.radius.pill,
                      backgroundColor: g.acc,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="plus" s={S.glyph} color={g.onAcc} />
                  </View>
                </GrPress>
              </View>
            );
          }
          return (
            <View key={s.id} style={{ flex: 1 }}>
              <GrPress
                testID={`gr-nav-${s.id}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t(s.label)}
                onPress={() =>
                  setSel((cur) => nextBeamSlot(i, cur, PLUS, SLOTS.length))
                }
                style={{
                  height: S.nav,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: graphite.space[1],
                }}
              >
                <View>
                  <Icon
                    name={s.icon}
                    s={S.glyph}
                    color={on ? g.text : g.text2}
                  />
                  {s.id === "chats" && badge > 0 ? (
                    <View
                      testID="gr-nav-badge"
                      style={{
                        position: "absolute",
                        top: -graphite.space[2],
                        right: -graphite.space[3],
                        minWidth: S.badge,
                        height: S.badge,
                        borderRadius: graphite.radius.pill,
                        backgroundColor: g.badge,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: graphite.space[1],
                      }}
                    >
                      <GrText v="micro" tone="onBadge">
                        {String(badge)}
                      </GrText>
                    </View>
                  ) : null}
                </View>
                <GrText
                  v="micro"
                  w={on ? "medium" : "regular"}
                  tone={on ? "text" : "text2"}
                  lines={1}
                >
                  {t(s.label)}
                </GrText>
              </GrPress>
            </View>
          );
        })}
      </View>
      {w > 0 ? (
        <Animated.View
          testID="gr-nav-beam"
          pointerEvents="none"
          style={[
            { position: "absolute", top: 0, left: 0, width: bw },
            beamStyle,
          ]}
        >
          <View
            style={{
              height: lineH,
              borderRadius: graphite.radius.pill,
              backgroundColor: g.beam,
              borderTopWidth: graphite.size.edge,
              borderTopColor: g.beamTop,
              shadowColor: g.beamGlow,
              shadowOpacity: 1,
              shadowRadius: graphite.beam.glow,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
          <Svg width={bw} height={graphite.beam.cone}>
            <Defs>
              <LinearGradient id="grCone" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={g.coneTop} />
                <Stop offset="1" stopColor={g.coneBottom} />
              </LinearGradient>
            </Defs>
            <Path
              d={`M0 0 H${bw} L${bw * 1.1} ${graphite.beam.cone} H${-bw * 0.1} Z`}
              fill="url(#grCone)"
            />
          </Svg>
        </Animated.View>
      ) : null}
    </GrLiquid>
  );
}
