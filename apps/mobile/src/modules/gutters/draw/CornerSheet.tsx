/**
 * The corner's sheet (#1276, founder 12.11; spec 33 §1; spec 56 §3а.2, wave G, founder 16.11 — variant A): its head «Угол» and the «?»
 * (what the kinds mean, and that the side of the whole line changes) are the `Sheet`'s own (`title` + `help`, DS Б1/Б7); three tiles «Наружный · Внутренний | Разъединить» (`OptionTiles`);
 * the splash guard of an inside corner right under them (`ToggleRow`); the drawing of the corner and a `Card` for each piece — along
 * the wall, along the face, the cut; the triangle for an angle taken on site. Only components of src/ui (rule 29).
 * The sheet only shows and asks: the drawing's edits are the owner's (`DrawScreen`).
 */
import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { OptionTiles } from "@/ui/optionTile";
import { T } from "@/ui/primitives";
import { Card, RowView } from "@/ui/surfaces";
import { ToggleRow } from "@/ui/toggleRow";
import { fmtLen, type LenFormat } from "../canvas/format";
import { fmtDeg } from "../canvas/cornerPlan";
import { cutAngleDeg, type CornerCutRun, type Drawing, type FoundCorner } from "../geometry";
import { CornerSketch, CornerTriangle } from "./CornerSketch";

export function CornerSheet({ d, f, cut, fmt, splashOn, onKind, onSplash, onSplit, onAngle }: {
  d: Drawing;
  f: FoundCorner;
  cut: { angleDeg: number; runs: CornerCutRun[] } | null;
  fmt: LenFormat;
  splashOn: boolean;
  onKind: (kind: "in" | "out") => void;
  onSplash: (on: boolean) => void;
  onSplit: () => void;
  onAngle: (deg: number) => void;
}) {
  const { t } = useI18n();
  const [sketchW, setSketchW] = useState(0);
  // a bay corner is neither: no tile is marked, and a tap changes nothing (the owner keeps it)
  const kind = f.kind === "bay" ? null : f.kind === "in" ? "in" : "out";
  return (
    <View testID="corner-sheet" style={{ gap: space[3] }}>
      {f.kind === "bay" ? <T tone="mut">{t("mod.gutters.draw.cornerBay")}</T> : null}
      {/* the kind and «Разъединить угол» (#933: two gutters with their own end caps; «Назад» and the toast bring it back) — one row of tiles */}
      <OptionTiles
        label={t("mod.gutters.draw.cornerTitle")}
        items={[
          { key: "out", label: t("mod.gutters.draw.kindOut"), icon: "cornerOut" },
          { key: "in", label: t("mod.gutters.draw.kindIn"), icon: "cornerIn" },
        ]}
        value={kind}
        onChange={onKind}
        action={{ label: t("mod.gutters.draw.unlink"), icon: "unlink", onPress: onSplit, testID: "corner-split" }}
        testID="corner-kind"
      />
      {/* the splash guard of an inside corner — right under the tiles that bring it (DS §11 п.19) */}
      {f.kind === "in" ? <ToggleRow label={t("mod.gutters.draw.splash")} value={splashOn} onChange={onSplash} testID="corner-splash" /> : null}
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
            <Card key={r.id} inner style={{ gap: space[2] }}>
              <View testID={`corner-cut-${r.id}`} style={{ gap: space[2] }}>
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
            </Card>
          ))}
        </View>
      ) : null}
      <CornerTriangle key={f.id} d={d} f={f} onAngle={onAngle} />
    </View>
  );
}
