import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { component, motion, size, space } from "@octo/design-tokens";
import { useBootLeave } from "@/features/boot";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { BrandIntro, BrandLaunch, BrandLogo, BrandMark, BrandWait } from "@/ui/brand";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, RowView, SectionTitle } from "@/ui/surfaces";

type Move = "first" | "normal" | "wait" | "intro" | null;

/** the launch as the app does it (DS §18.2 «Запуск» v4.4, #1394): the mark on the theme's bg; the first launch — the dot
 *  along the G and its bounce, an ordinary one — the bounce; then the exit over «the first screen» (the boot layer's hook) */
function LaunchDemo({ kind, onDone }: { kind: "first" | "normal"; onDone: () => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const [play, setPlay] = useState<"first" | "bounce" | null>(kind === "first" ? "first" : null);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const onGone = useCallback(() => {
    setGone(true);
    onDone();
  }, [onDone]);
  const leave = useBootLeave(leaving, onGone);
  // an ordinary launch: the mark stands a moment (the app getting ready), then the bounce
  useEffect(() => {
    if (kind !== "normal") return;
    const id = setTimeout(() => setPlay("bounce"), motion.durBase);
    return () => clearTimeout(id);
  }, [kind]);
  const played = useCallback(() => setLeaving(true), []);
  const id = kind === "first" ? "showcase-brand-first" : "showcase-brand-launch";
  return (
    <View testID={id} style={{ width: component.brand.intro, height: component.brand.intro, alignItems: "center", justifyContent: "center" }}>
      <T v="body" tone="mut">
        {t("ds.brand.firstScreen")}
      </T>
      {gone ? null : (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }, leave.layer]}>
          <Animated.View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }, leave.mark]}>
            <BrandLaunch size={component.brand.wait} play={play} onDone={played} />
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

/** the launch sample at rest: the mark as the system splash shows it */
function LaunchStill({ testID }: { testID: string }) {
  return (
    <View testID={testID} style={{ width: component.brand.intro, height: component.brand.intro, alignItems: "center", justifyContent: "center" }}>
      <BrandLaunch size={component.brand.wait} play={null} />
    </View>
  );
}

/** «Бренд GoRix» (DS §18.2, #1156, #1394): the mark in its sizes and both dots, the logo, the launch and the dot's moves with «Проиграть» */
export function BrandSection() {
  const { t } = useI18n();
  // one move of the mark at a time (DS §18.2 п.6): «Проиграть» plays the first launch, the ordinary one, the wait, then
  // the logo; the others stand still meanwhile. A new run remounts the playing one from its start
  const [play, setPlay] = useState<Move>(null);
  const [run, setRun] = useState(0);
  useEffect(() => {
    const next = play === "wait" ? { to: "intro" as const, ms: 2 * motion.durBrand } : null;
    if (!next) return;
    const id = setTimeout(() => setPlay(next.to), next.ms);
    return () => clearTimeout(id);
  }, [play, run]);
  const introDone = useCallback(() => setPlay(null), []);
  const firstDone = useCallback(() => setPlay("normal"), []);
  const normalDone = useCallback(() => setPlay("wait"), []);
  return (
    <View testID="showcase-brand" style={{ gap: space[3] }}>
      <T v="caption" tone="mut">
        {t("ds.brand.hint")}
      </T>
      <SectionTitle title={t("ds.brand.marks")} />
      <Card>
        <RowView style={{ flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-around", gap: space[4] }}>
          <View testID="showcase-brand-mark-24" style={{ alignItems: "center", gap: space[1] }}>
            <BrandMark size={size.iconLg} />
            <T v="caption" tone="mut">{`${size.iconLg}`}</T>
          </View>
          <View testID="showcase-brand-mark-48" style={{ alignItems: "center", gap: space[1] }}>
            <BrandMark size={component.brand.mark} />
            <T v="caption" tone="mut">{`${component.brand.mark} · acc`}</T>
          </View>
          <View testID="showcase-brand-mark-ink" style={{ alignItems: "center", gap: space[1] }}>
            <BrandMark size={component.brand.mark} screenHasPrimary />
            <T v="caption" tone="mut">{`${component.brand.mark} · ink`}</T>
          </View>
          <View testID="showcase-brand-mark-56" style={{ alignItems: "center", gap: space[1] }}>
            <BrandMark size={component.brand.wait} />
            <T v="caption" tone="mut">{`${component.brand.wait}`}</T>
          </View>
        </RowView>
      </Card>
      <SectionTitle title={t("ds.brand.logo")} />
      <Card>
        <View testID="showcase-brand-logo" style={{ alignItems: "center" }}>
          <BrandLogo width={component.brand.about} />
        </View>
      </Card>
      <SectionTitle title={t("ds.brand.moves")} />
      <Card>
        <View style={{ gap: space[4], alignItems: "center" }}>
          {play === "first" ? <LaunchDemo key={run} kind="first" onDone={firstDone} /> : <LaunchStill testID="showcase-brand-first" />}
          <T v="caption" tone="mut">{t("ds.brand.launchFirst")}</T>
          {play === "normal" ? <LaunchDemo key={run} kind="normal" onDone={normalDone} /> : <LaunchStill testID="showcase-brand-launch" />}
          <T v="caption" tone="mut">{t("ds.brand.launch")}</T>
          {/* the wait as the app shows it: the mark and, always, its word under it */}
          <View testID="showcase-brand-wait" style={{ alignItems: "center", gap: space[4] }}>
            {play === "wait" ? <BrandWait key={run} size={component.brand.wait} /> : <BrandMark size={component.brand.wait} />}
            <T v="body" tone="mut">
              {t("brand.boot.loading")}
            </T>
          </View>
          <T v="caption" tone="mut">{t("ds.brand.wait")}</T>
          <View testID="showcase-brand-intro">
            {play === "intro" ? <BrandIntro key={run} width={component.brand.intro} onDone={introDone} /> : <BrandLogo width={component.brand.intro} />}
          </View>
          <T v="caption" tone="mut">{t("ds.brand.intro")}</T>
        </View>
        <View testID="showcase-brand-replay">
          <Button
            label={t("ds.brand.replay")}
            icon="refresh"
            variant="secondary"
            onPress={() => {
              setRun((n) => n + 1);
              setPlay("first");
            }}
          />
        </View>
      </Card>
    </View>
  );
}
