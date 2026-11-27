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
import { OptionTiles } from "@/ui/optionTile";
import { ToggleRow } from "@/ui/toggleRow";
import { T } from "@/ui/primitives";
import { Card, RowView } from "@/ui/surfaces";
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
      {f.kind === "bay" ? <T tone="mut">{t("mod.gutters.attr.ck.bay")}</T> : null}
      {/* the kind and «Разъединить» (DS §9 А2б — the corner is the tiles' first place; founder 16.11 «Наружный, внутренний и разъединить…
          3 кнопки»; #3066 — it was an own pair of pills on Press, rule 29): two tiles to choose, the action apart; the names are the supplier's
          (Berger «Miter - Outside or Inside», #2979) in every language */}
      <OptionTiles
        testID="corner-kind"
        label={t("mod.gutters.draw.cornerTitle")}
        items={[
          { key: "out" as const, label: t("mod.gutters.attr.ck.out"), icon: "cornerOut" as const },
          { key: "in" as const, label: t("mod.gutters.attr.ck.in"), icon: "cornerIn" as const },
        ]}
        value={f.kind === "bay" ? null : kind}
        onChange={onKind}
        action={{ label: t("mod.gutters.draw.cornerSplitShort"), icon: "unlink", onPress: onSplit, testID: "corner-split" }}
      />
      <T v="caption" tone="mut">{t("mod.gutters.draw.cornerNote")}</T>
      {/* the splash guard of an inside corner, right under its kind (reviews #3066: it goes into the estimate — not below the fold): a ToggleRow (DS А5) */}
      {f.kind === "in" ? <ToggleRow testID="corner-splash" label={t("mod.gutters.draw.splash")} value={splashOn} onChange={onSplash} /> : null}
      {cut ? (
        <View testID="corner-cut" style={{ gap: space[2] }}>
          <View onLayout={(e) => setSketchW(e.nativeEvent.layout.width)}>
            {sketchW > 0 ? <CornerSketch d={d} f={f} cut={cut.runs} w={sketchW} angleDeg={cut.angleDeg} fmt={fmt} /> : null}
          </View>
          {/* the key of the drawing (#3078): its numbers are the gutters of «Раскрой» below, where the lengths are */}
          <View testID="corner-sketch-key"><T v="caption" tone="mut">{t("mod.gutters.draw.sketchKey")}</T></View>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="body" w="semibold">{t("mod.gutters.draw.cutTitle")}</T>
            <View testID="corner-cut-angle"><T v="caption" tone="mut">{t("mod.gutters.draw.cutAngle", { deg: cut.angleDeg })}</T></View>
          </RowView>
          {/* a card for each piece: along the wall · along the face · the cut */}
          {cut.runs.map((r) => (
            <View key={r.id} testID={`corner-cut-${r.id}`}><Card inner style={{ gap: space[2] }}>
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
            </Card></View>
          ))}
          {/* the measure is rough: ONE line, at the bottom of the cut */}
        </View>
      ) : null}
      <CornerTriangle key={f.id} d={d} f={f} onAngle={onAngle} />
    </View>
  );
}
