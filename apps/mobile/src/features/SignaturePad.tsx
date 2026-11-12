import { useRef, useState } from "react";
import { PanResponder, Platform, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import { radius, space, component } from "@octo/design-tokens";
import { useI18n, type DictKey } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, IconButton } from "@/ui/controls";
import { useDevice } from "@/theme/ThemeProvider";
import { SignatureFullscreen } from "./SignatureFullscreen";
import { T } from "@/ui/primitives";
import { RowView, useScrollLock } from "@/ui/surfaces";
import { useHideTabBar } from "@/nav/tabBarHide";
import { SIG_BOX, fitSignature, normalizeSignature } from "./signaturePath";

/** Finger signature. Output is SVG path data (stored with the visit; PDF in wave 3). */
export function SignaturePad({ onConfirm, disabled, confirmLabel, label, consent = "visit.signConsent" }: { onConfirm: (path: string) => void; disabled?: boolean; confirmLabel?: string; /** who signs: «Клиент расписывается здесь» by default */ label?: string; /** the line under the pad — what the signature confirms: the visit's completed work by default; the estimate — its own; null — none (#1104 п.5) */ consent?: DictKey | null }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const [d, setD] = useState("");
  // rule А (docs/specs/28; the director's decision on #274): no bottom bar while a signature is being drawn here —
  // from the first stroke until it is confirmed, cleared or the screen is left; before that the bar stays
  useHideTabBar(!!d);
  const dRef = useRef("");
  const [h, setH] = useState(0);
  const [w, setW] = useState(0);
  // spec 29: on a phone the field can open on the whole screen, turned along the long side
  const { device } = useDevice();
  const [full, setFull] = useState(false);
  // the stroke owns the finger: the screen does not scroll under it (iOS), the browser does not take it (web)
  const lockScroll = useScrollLock();
  const lockRef = useRef(lockScroll);
  lockRef.current = lockScroll;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        lockRef.current(true);
        const { locationX: x, locationY: y } = e.nativeEvent;
        dRef.current += `M${x.toFixed(1)} ${y.toFixed(1)} `;
        setD(dRef.current);
      },
      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        dRef.current += `L${x.toFixed(1)} ${y.toFixed(1)} `;
        setD(dRef.current);
      },
      onPanResponderRelease: () => lockRef.current(false),
      onPanResponderTerminate: () => lockRef.current(false),
    }),
  ).current;
  const clear = () => {
    dRef.current = "";
    setD("");
  };
  return (
    <View style={{ gap: space[2] }}>
      <View
        onLayout={(e: LayoutChangeEvent) => {
          setH(e.nativeEvent.layout.height);
          setW(e.nativeEvent.layout.width);
        }}
        style={{
          height: component.mediaH,
          borderRadius: radius.inner,
          borderWidth: component.hairline,
          borderStyle: "dashed",
          borderColor: c.bd,
          backgroundColor: c.in,
          overflow: "hidden",
          // web: the browser does not scroll or zoom the page under a finger on the field
          ...(Platform.OS === "web" ? ({ touchAction: "none" } as object) : null),
        }}
        accessibilityLabel={(label ?? t("visit.signHere"))}
        {...pan.panHandlers}
      >
        {!d ? (
          <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: space[4] }} pointerEvents="none">
            <T v="caption" tone="mut" center>
              {(label ?? t("visit.signHere"))}
            </T>
          </View>
        ) : null}
        <Svg width="100%" height="100%" pointerEvents="none">
          <Path d={d} stroke={c.ink} strokeWidth={component.signStroke} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      {consent ? (
        <T v="caption" tone="mut">
          {t(consent)}
        </T>
      ) : null}
      <RowView>
        {device === "phone" ? <IconButton icon="expand" label={t("fix.sign.expand")} onPress={() => setFull(true)} /> : null}
        <Button label={t("visit.clear")} variant="secondary" onPress={clear} disabled={!d} />
        <Button label={confirmLabel ?? t("visit.confirmSign")} icon="check" onPress={() => onConfirm(normalizeSignature(d, w, h))} disabled={disabled || d.length < 20} />
      </RowView>
      <SignatureFullscreen
        visible={full}
        d={d}
        fieldW={w}
        fieldH={h}
        label={label ?? t("visit.signHere")}
        onCancel={() => setFull(false)}
        onDone={(path) => {
          dRef.current = path;
          setD(path);
          setFull(false);
        }}
      />
    </View>
  );
}

/** A saved signature in the 400 × 160 box (same as the PDF): a phone signature looks as drawn, a wide one is never cut. */
export function SignaturePreview({ svg, label }: { svg: string; label: string }) {
  const { c } = useTheme();
  return (
    <View
      style={{ height: component.mediaH, borderRadius: radius.inner, borderWidth: component.hairline, borderColor: c.bd, backgroundColor: c.in, overflow: "hidden" }}
      accessibilityLabel={label}
    >
      {/* the saved path lives in the 400 × 160 box (signaturePath.ts): drawn in that box, left-aligned, never cut */}
      <Svg width="100%" height="100%" viewBox={`0 0 ${SIG_BOX.w} ${SIG_BOX.h}`} preserveAspectRatio="xMinYMid meet" pointerEvents="none">
        <Path d={fitSignature(svg)} stroke={c.ink} strokeWidth={component.signStroke} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
