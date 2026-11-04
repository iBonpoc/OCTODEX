import { useRef, useState } from "react";
import { PanResponder, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import { radius, space, component } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";

/** Finger signature. Output is SVG path data (stored with the visit; PDF in wave 3). */
export function SignaturePad({ onConfirm, disabled, confirmLabel }: { onConfirm: (path: string) => void; disabled?: boolean; confirmLabel?: string }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const [d, setD] = useState("");
  const dRef = useRef("");
  const [h, setH] = useState(0);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        dRef.current += `M${x.toFixed(1)} ${y.toFixed(1)} `;
        setD(dRef.current);
      },
      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        dRef.current += `L${x.toFixed(1)} ${y.toFixed(1)} `;
        setD(dRef.current);
      },
    }),
  ).current;
  const clear = () => {
    dRef.current = "";
    setD("");
  };
  return (
    <View style={{ gap: space[2] }}>
      <View
        onLayout={(e: LayoutChangeEvent) => setH(e.nativeEvent.layout.height)}
        style={{
          height: component.mediaH,
          borderRadius: radius.inner,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: c.bd,
          backgroundColor: c.in,
          overflow: "hidden",
        }}
        accessibilityLabel={t("visit.signHere")}
        {...pan.panHandlers}
      >
        {!d ? (
          <View style={{ position: "absolute", left: 0, right: 0, top: h / 2 - 10, alignItems: "center" }} pointerEvents="none">
            <T v="caption" tone="mut">
              {t("visit.signHere")}
            </T>
          </View>
        ) : null}
        <Svg width="100%" height="100%" pointerEvents="none">
          <Path d={d} stroke={c.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      <T v="caption" tone="mut">
        {t("visit.signConsent")}
      </T>
      <RowView>
        <Button label={t("visit.clear")} variant="secondary" onPress={clear} disabled={!d} />
        <Button label={confirmLabel ?? t("visit.confirmSign")} icon="check" onPress={() => onConfirm(d)} disabled={disabled || d.length < 20} />
      </RowView>
    </View>
  );
}
