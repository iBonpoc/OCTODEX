import { useEffect, useRef, useState } from "react";
import { PanResponder, Platform, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import { SignatureInk } from "./SignatureInkView";
import { undoStroke } from "./signatureInk";
import { radius, space, component } from "@octo/design-tokens";
import { useI18n, type DictKey } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, IconButton, useReadOnly } from "@/ui/controls";
import { useDevice } from "@/theme/ThemeProvider";
import { SignatureFullscreen } from "./SignatureFullscreen";
import { T } from "@/ui/primitives";
import { RowView, useScrollLock } from "@/ui/surfaces";
import { useHideTabBar } from "@/nav/tabBarHide";
import { SIG_BOX, fitSignature, normalizeSignature } from "./signaturePath";
import { padScrollLock } from "./signatureLock";

/** Finger signature. Output is SVG path data (stored with the visit; PDF in wave 3). */
export function SignaturePad({ onConfirm, disabled, confirmLabel, label, consent = "visit.signConsent" }: { onConfirm: (path: string) => void; disabled?: boolean; confirmLabel?: string; /** who signs: «Клиент расписывается здесь» by default */ label?: string; /** the line under the pad — what the signature confirms: the visit's completed work by default; the estimate — its own; null — none (#1104 п.5) */ consent?: DictKey | null }) {
  const { c } = useTheme();
  const { t } = useI18n();
  // inside <ReadOnly value> (the office's «open as client» preview): the pad is shown as the client will see it, but
  // takes no stroke, no full screen and no confirm — the gestures themselves are not changed
  const ro = useReadOnly();
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
  // #3156: on with the stroke, off with its end — and off when the pad leaves the screen mid-stroke (else the screen stays locked)
  // made once (a lazy state init: `useRef(padScrollLock(...))` would build a new one on every render and throw it away)
  const [padLock] = useState(() => padScrollLock(() => lockRef.current));
  useEffect(() => () => padLock.unmount(), [padLock]);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        padLock.grant();
        const { locationX: x, locationY: y } = e.nativeEvent;
        dRef.current += `M${x.toFixed(1)} ${y.toFixed(1)} `;
        setD(dRef.current);
      },
      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        dRef.current += `L${x.toFixed(1)} ${y.toFixed(1)} `;
        setD(dRef.current);
      },
      onPanResponderRelease: () => padLock.release(),
      onPanResponderTerminate: () => padLock.terminate(),
    }),
  ).current;
  const clear = () => {
    dRef.current = "";
    setD("");
  };
  // #2215: «Отменить штрих» — the last stroke goes, the rest stays as drawn
  const undo = () => {
    dRef.current = undoStroke(dRef.current);
    setD(dRef.current);
  };
  const confirm = <Button label={confirmLabel ?? t("visit.confirmSign")} icon="check" full={device === "phone"} onPress={() => onConfirm(normalizeSignature(d, w, h))} disabled={ro || disabled || d.length < 20} />;
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
        accessibilityState={ro ? { disabled: true } : undefined}
        testID="signature-pad"
        {...(ro ? null : pan.panHandlers)}
      >
        {!d ? (
          <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: space[4] }} pointerEvents="none">
            <T v="caption" tone="mut" center>
              {(label ?? t("visit.signHere"))}
            </T>
          </View>
        ) : null}
        <Svg width="100%" height="100%" pointerEvents="none">
          <SignatureInk d={d} color={c.ink} />
        </Svg>
      </View>
      {consent ? (
        <T v="caption" tone="mut">
          {t(consent)}
        </T>
      ) : null}
      <RowView>
        {device === "phone" && !ro ? <IconButton icon="expand" label={t("fix.sign.expand")} onPress={() => setFull(true)} /> : null}
        {/* shown once there is a stroke to take back */}
        {ro || !d ? null : <IconButton icon="undo" label={t("sig.undoStroke")} onPress={undo} testID="signature-undo" />}
        <View testID="signature-clear">
          <Button label={t("visit.clear")} variant="secondary" onPress={clear} disabled={!d} />
        </View>
        {/* a wide window: the confirm in the same row; a phone: its own full row — «Подтвердить подпись» never runs past the card */}
        {device === "phone" ? null : confirm}
      </RowView>
      {device === "phone" ? confirm : null}
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
        {/* drawn exactly as saved, like the PDF (a client's signature is legally meaningful): the smooth pen is only the pad's picture (#2215) */}
        <Path d={fitSignature(svg)} stroke={c.ink} strokeWidth={component.signStroke} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
