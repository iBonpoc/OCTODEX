/**
 * The corner's sheet (#1276, founder 12.11: «чертёж угла — каша, ничего не понятно»; spec 33 §1): from the top — the kind (outside / inside) as two
 * pictures with their words and one line what it changes; the drawing of the corner (two gutters from above as strips, the wall solid, the face
 * dashed, the cut line, the arc with its degrees); under it a table for each piece — along the wall, along the face, the cut; one line that the
 * measure is rough; the splash guard of an inside corner; «Разъединить угол»; the triangle for an angle taken on site.
 * The sheet only shows and asks: the drawing's edits are the owner's (`DrawScreen`).
 */
import { useState } from "react";
import { View } from "react-native";
import { component, radius, size as sizes, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, StatusChip, Toggle } from "@/ui/controls";
import { fillStyle } from "@/ui/fill";
import { Icon, Press, T } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";
import { SelectedCheck } from "@/ui/selectedCheck";
import { fmtLen, type LenFormat } from "../canvas/format";
import { fmtDeg } from "../canvas/cornerPlan";
import { cutAngleDeg, type CornerCutRun, type Drawing, type FoundCorner } from "../geometry";
import { CornerSketch, CornerTriangle } from "./CornerSketch";

export function CornerSheet({ d, f, cut, fmt, tape, splashOn, onKind, onSplash, onSplit, onAngle }: {
  d: Drawing;
  f: FoundCorner;
  cut: { angleDeg: number; runs: CornerCutRun[] } | null;
  fmt: LenFormat;
  /** the lengths were taped (not rough) */
  tape: boolean;
  splashOn: boolean;
  onKind: (kind: "in" | "out") => void;
  onSplash: (on: boolean) => void;
  onSplit: () => void;
  onAngle: (deg: number) => void;
}) {
  const { t } = useI18n();
  const { c } = useTheme();
  const [sketchW, setSketchW] = useState(0);
  const kind = f.kind === "in" ? "in" : "out";
  return (
    <View testID="corner-sheet" style={{ gap: space[3] }}>
      <T v="heading" w="semibold">{t("mod.gutters.draw.cornerTitle")}</T>
      {f.kind === "bay" ? <T tone="mut">{t("mod.gutters.draw.cornerBay")}</T> : null}
      {/* the kind: two pictures with their words (the diamond is hollow outside and has a dot inside, as on the canvas); the choice is the «Заливка» */}
      <View testID="corner-kind"><RowView style={{ gap: space[2] }}>
        {(["out", "in"] as const).map((k) => {
          const on = kind === k;
          const label = t(k === "in" ? "mod.gutters.attr.ck.in" : "mod.gutters.attr.ck.out");
          return (
            <View key={k} style={{ flex: 1 }}>
              <Press
                onPress={() => onKind(k)}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{ selected: on, checked: on }}
                {...({ "aria-checked": on } as object)}
                visibleHeight={component.button.phone}
                style={{ height: component.button.phone, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[2], borderRadius: radius.pill, ...(on ? fillStyle(c) : { backgroundColor: "transparent" }), borderWidth: component.hairline, borderColor: on ? "transparent" : c.bd }}
              >
                <Icon name={k === "in" ? "cornerIn" : "cornerOut"} s={sizes.iconSm} color={on ? c.ink : c.mut} />
                <T v="body" w="semibold" style={{ color: on ? c.ink : c.mut }}>{label}</T>
                {on ? <SelectedCheck small /> : null}
              </Press>
            </View>
          );
        })}
      </RowView></View>
      <T v="caption" tone="mut">{t("mod.gutters.draw.cornerNote")}</T>
      {cut ? (
        <View testID="corner-cut" style={{ gap: space[2] }}>
          <View onLayout={(e) => setSketchW(e.nativeEvent.layout.width)}>
            {sketchW > 0 ? <CornerSketch d={d} f={f} cut={cut.runs} w={sketchW} angleDeg={cut.angleDeg} fmt={fmt} /> : null}
          </View>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="body" w="semibold">{t("mod.gutters.draw.cutTitle")}</T>
            <View testID="corner-cut-angle"><T v="caption" tone="mut">{t("mod.gutters.draw.cutAngle", { deg: cut.angleDeg })}</T></View>
          </RowView>
          {/* a card for each piece: along the wall · along the face · the cut */}
          {cut.runs.map((r) => (
            <View key={r.id} testID={`corner-cut-${r.id}`} style={{ gap: space[2], padding: space[3], borderRadius: radius.card, borderWidth: component.hairline, borderColor: c.bd }}>
              <T v="caption" w="semibold">{t("mod.gutters.draw.cutRun", { n: d.runs.findIndex((x) => x.id === r.id) + 1 })}</T>
              <RowView style={{ gap: space[3], alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <T v="caption" tone="mut">{t("mod.gutters.draw.cutWallCol")}</T>
                  <View testID="cut-back"><T v="body" tabular>{fmtLen(r.backIn, fmt)}</T></View>
                </View>
                <View style={{ flex: 1 }}>
                  <T v="caption" tone="mut">{t("mod.gutters.draw.cutFaceCol")}</T>
                  <View testID="cut-front"><T v="body" w="semibold" tabular>{fmtLen(r.frontIn, fmt)}</T></View>
                </View>
                <View style={{ flex: 1 }}>
                  <T v="caption" tone="mut">{t("mod.gutters.draw.cutMiter")}</T>
                  <View testID="cut-miter"><T v="body" tabular>{`${fmtDeg(cutAngleDeg(180 - cut.angleDeg))}°`}</T></View>
                </View>
              </RowView>
            </View>
          ))}
          {/* the measure is rough: ONE line, at the bottom of the cut */}
          {!tape ? <View testID="corner-cut-rough"><StatusChip status="warn" label={t("mod.gutters.draw.accRoughCut")} soft /></View> : null}
        </View>
      ) : null}
      {f.kind === "in" ? (
        <RowView style={{ gap: space[3], justifyContent: "space-between" }}>
          <T v="body" style={{ flex: 1 }}>{t("mod.gutters.draw.splash")}</T>
          <View testID="corner-splash"><Toggle on={splashOn} onChange={onSplash} label={t("mod.gutters.draw.splash")} /></View>
        </RowView>
      ) : null}
      {/* «Разъединить угол» (#933): two gutters with their own end caps; «Назад» and the toast bring it back */}
      <View testID="corner-split"><Button label={t("mod.gutters.draw.cornerSplit")} variant="secondary" size="sm" onPress={onSplit} /></View>
      <CornerTriangle key={f.id} d={d} f={f} onAngle={onAngle} />
    </View>
  );
}
