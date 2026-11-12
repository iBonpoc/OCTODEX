import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Modal, PanResponder, Platform, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { component, radius, size, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Button } from "@/ui/controls";
import { ALL_ORIENTATIONS } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";
import { fullCanvas, turnedToCanvas, uprightToCanvas } from "./signatureCanvas";
import { scale } from "./signaturePath";

/**
 * «Развернуть» (spec 29, founder 07.11): the signature on the whole screen. A portrait window turns the canvas 90°, so
 * the phone's long side is the signing line without turning the phone; turned to landscape, the window is wide and
 * nothing is rotated (the modal allows both orientations). One stroke for both modes: the field's path comes in scaled
 * up and goes back scaled down — only the scale changes (a client's signature is legally meaningful). «Отмена» keeps
 * the field as it was; «Готово» (the one accent) brings the path back; the signature is confirmed on the screen below.
 */
export function SignatureFullscreen({
  visible,
  d,
  fieldW,
  fieldH,
  label,
  onDone,
  onCancel,
}: {
  visible: boolean;
  /** the field's path, in the field's pixels */
  d: string;
  fieldW: number;
  fieldH: number;
  label: string;
  onDone: (d: string) => void;
  onCancel: () => void;
}) {
  const { c } = useTheme();
  const { t } = useI18n();
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bar = size.hitMin + space[2];
  // the canvas and «Отмена / Готово» keep clear of the notch, the Dynamic Island and the home indicator (docs/specs/32)
  // the bar and its gap sit under the canvas: both count
  const cv = fullCanvas(win.width, win.height, fieldW, fieldH, space[4], bar + space[2], insets);
  const k = fieldW > 0 ? cv.w / fieldW : 1;
  const [path, setPath] = useState("");
  const pathRef = useRef("");
  const box = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<ComponentRef<typeof View>>(null);
  const geo = useRef({ rotate: cv.rotate, h: cv.h });
  geo.current = { rotate: cv.rotate, h: cv.h };

  // opening: the field's stroke, scaled to this canvas; a turn of the phone rescales what is drawn
  const kRef = useRef(k);
  useEffect(() => {
    if (!visible) return;
    pathRef.current = d ? scale(d, k) : "";
    setPath(pathRef.current);
    kRef.current = k;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  useEffect(() => {
    if (!visible || kRef.current === k || !pathRef.current) return;
    pathRef.current = scale(pathRef.current, k / kRef.current);
    kRef.current = k;
    setPath(pathRef.current);
  }, [k, visible]);

  const measure = () => canvasRef.current?.measureInWindow((x: number, y: number) => (box.current = { x, y }));
  const point = (pageX: number, pageY: number) => {
    const p = geo.current.rotate ? turnedToCanvas(pageX, pageY, box.current, geo.current.h) : uprightToCanvas(pageX, pageY, box.current);
    return `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        measure();
        pathRef.current += `M${point(e.nativeEvent.pageX, e.nativeEvent.pageY)} `;
        setPath(pathRef.current);
      },
      onPanResponderMove: (e) => {
        pathRef.current += `L${point(e.nativeEvent.pageX, e.nativeEvent.pageY)} `;
        setPath(pathRef.current);
      },
    }),
  ).current;

  const clear = () => {
    pathRef.current = "";
    setPath("");
  };
  // the turned block is canvas + buttons: laid out upright (w wide), then turned as one
  const blockW = cv.w;
  const blockH = cv.h + space[2] + bar;
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onCancel} supportedOrientations={ALL_ORIENTATIONS} statusBarTranslucent>
      <View
        testID="sig-full"
        style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", paddingTop: cv.pad.top, paddingBottom: cv.pad.bottom, paddingLeft: cv.pad.left, paddingRight: cv.pad.right }}
      >
        <View
          testID={cv.rotate ? "sig-full-turned" : "sig-full-upright"}
          style={{ width: blockW, height: blockH, gap: space[2], transform: cv.rotate ? [{ rotate: "90deg" }] : [] }}
        >
          <View
            ref={canvasRef}
            onLayout={measure}
            accessibilityLabel={label}
            style={{
              width: cv.w,
              height: cv.h,
              borderRadius: radius.inner,
              borderWidth: component.hairline,
              borderStyle: "dashed",
              borderColor: c.bd,
              backgroundColor: c.in,
              overflow: "hidden",
              ...(Platform.OS === "web" ? ({ touchAction: "none" } as object) : null),
            }}
            {...pan.panHandlers}
          >
            {!path ? (
              <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: space[4] }} pointerEvents="none">
                <T v="caption" tone="mut" center>
                  {label}
                </T>
              </View>
            ) : null}
            <Svg width="100%" height="100%" pointerEvents="none">
              <Path d={path} stroke={c.ink} strokeWidth={component.signStroke} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <RowView style={{ minHeight: bar, justifyContent: "space-between" }}>
            <Button label={t("common.cancel")} variant="ghost" onPress={onCancel} />
            <RowView>
              <Button label={t("visit.clear")} variant="secondary" onPress={clear} disabled={!path} />
              <Button label={t("fix.sign.done")} icon="check" onPress={() => onDone(pathRef.current && k > 0 ? scale(pathRef.current, 1 / k) : "")} />
            </RowView>
          </RowView>
        </View>
      </View>
    </Modal>
  );
}
