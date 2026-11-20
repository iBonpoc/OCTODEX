/**
 * «Основа» on the sheet (#2292, founder 20.11: «не таблицы цвета и не цифры — я хочу видеть, как будет выглядеть на примере»):
 * colour as it is used (a status = icon + word, the accent = the main button, a surface = a card on the background), the
 * themes by one switch, spacing and corners on one card «плотно / средне / свободно», «угол 1 / 2 / 3». Numbers are small
 * captions under the sample. «Как сейчас» is «Наряд» as it is; «Вариант 1» is «Графит».
 */
import { useState } from "react";
import { View } from "react-native";
import { graphite } from "@octo/design-tokens";
import { radius, space } from "@octo/design-tokens";
import { useI18n, type DictKey } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Segmented, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card } from "@/ui/surfaces";
import { GrButton, GrStatus } from "../Controls";
import { GrMatte } from "../Glass";
import { GrText } from "../theme";
import { Block, StateSwitch } from "./Block";

const SP = graphite.space;
const R = graphite.radius;

/** the theme of the whole app, flipped from the sheet: both themes side by side is the same switch twice */
function ThemeBlock() {
  const { t } = useI18n();
  const { name, setPref } = useTheme();
  return (
    <Block
      id="theme"
      title={t("ds.gr.base.theme")}
      note={t("ds.gr.base.themeNote")}
      now={
        <StateSwitch id="gr-theme-switch" label={t("ds.gr.base.themeLight")} value={name === "light"} onChange={(v) => setPref(v ? "light" : "dark")} />
      }
      variants={[
        <GrMatte key="1" style={{ padding: SP[4], gap: SP[1] }}>
          <GrText v="title">{t(name === "light" ? "ds.gr.themeLight" : "ds.gr.themeDark")}</GrText>
          <GrText v="caption" tone="text2">
            {t("ds.gr.base.themeGr")}
          </GrText>
        </GrMatte>,
      ]}
    />
  );
}

function StatusBlock() {
  const { t } = useI18n();
  const labels = { bad: "ds.gr.st.bad", warn: "ds.gr.st.warn", info: "ds.gr.st.info", ok: "ds.gr.st.ok" } as const;
  const tones = ["bad", "warn", "info", "ok"] as const;
  return (
    <Block
      id="status"
      title={t("ds.gr.base.status")}
      note={t("ds.gr.base.statusNote")}
      now={
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          {tones.map((s) => (
            <StatusChip key={s} status={s} label={t(labels[s])} />
          ))}
          <StatusChip status="neutral" label={t("ds.gr.base.draft")} />
        </View>
      }
      variants={[
        <View key="1" style={{ gap: SP[2] }}>
          {tones.map((s) => (
            <GrStatus key={s} tone={s} label={t(labels[s])} />
          ))}
          <GrText v="caption" tone="text2">
            {t("ds.gr.base.noNeutral")}
          </GrText>
        </View>,
      ]}
    />
  );
}

function AccentBlock() {
  const { t } = useI18n();
  return (
    <Block
      id="accent"
      title={t("ds.gr.base.accent")}
      note={t("ds.gr.base.accentNote")}
      now={<Button label={t("ds.gr.primary")} onPress={() => undefined} />}
      variants={[<GrButton key="1" kind="primary" label={t("ds.gr.primary")} onPress={() => undefined} />]}
    />
  );
}

function SurfaceBlock() {
  const { t } = useI18n();
  return (
    <Block
      id="surface"
      title={t("ds.gr.base.surface")}
      note={t("ds.gr.base.surfaceNote")}
      now={
        <Card>
          <T v="heading">{t("ds.gr.row1")}</T>
          <T v="caption" tone="mut">
            {t("ds.gr.row1Sub")}
          </T>
        </Card>
      }
      variants={[
        <GrMatte key="1" style={{ padding: SP[4], gap: SP[1] }}>
          <GrText v="title">{t("ds.gr.row1")}</GrText>
          <GrText v="caption" tone="text2">
            {t("ds.gr.row1Sub")}
          </GrText>
        </GrMatte>,
      ]}
    />
  );
}

const DENSITY: { id: "dense" | "mid" | "loose"; name: DictKey; between: 1 | 2 | 3; inside: 2 | 3 | 4 }[] = [
  { id: "dense", name: "ds.gr.base.dense", between: 1, inside: 2 },
  { id: "mid", name: "ds.gr.base.mid", between: 2, inside: 3 },
  { id: "loose", name: "ds.gr.base.loose", between: 3, inside: 4 },
];

/** a choice of the sheet's own (a mode of the sample): press a name — it is marked, the example below is rebuilt */
function Pick<K extends string>({ id, items, value, onChange }: { id: string; items: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return <Segmented testID={id} radio full items={items} value={value} onChange={onChange} />;
}

/** the same card in the chosen density: only the space inside changes */
function SpaceBlock() {
  const { t } = useI18n();
  const [pick, setPick] = useState<"dense" | "mid" | "loose">("mid");
  const d = DENSITY.find((x) => x.id === pick)!;
  return (
    <Block
      id="space"
      title={t("ds.gr.base.space")}
      note={t("ds.gr.base.spaceNote")}
      controls={<Pick id="gr-space-pick" items={DENSITY.map((x) => ({ key: x.id, label: t(x.name) }))} value={pick} onChange={setPick} />}
      now={
        <Card style={{ padding: space[d.inside], gap: space[d.between] }}>
          <View testID="gr-space-now-card" style={{ gap: space[d.between] }}>
            <T v="heading">{t("ds.gr.row1")}</T>
            <T v="caption" tone="mut">{t("ds.gr.row1Sub")}</T>
            <Button label={t("ds.gr.save")} size="sm" variant="secondary" onPress={() => undefined} />
          </View>
        </Card>
      }
      variants={[
        <GrMatte key="1" style={{ padding: SP[d.inside] }}>
          <View testID="gr-space-v1-card" style={{ gap: SP[d.between] }}>
            <GrText v="title">{t("ds.gr.row1")}</GrText>
            <GrText v="caption" tone="text2">{t("ds.gr.row1Sub")}</GrText>
            <GrButton kind="secondary" label={t("ds.gr.save")} onPress={() => undefined} />
          </View>
        </GrMatte>,
      ]}
    />
  );
}

const CORNERS: { id: "c1" | "c2" | "c3"; name: DictKey; now: number; gr: number }[] = [
  { id: "c1", name: "ds.gr.base.corner1", now: radius.field, gr: R.xs },
  { id: "c2", name: "ds.gr.base.corner2", now: radius.inner, gr: R.control },
  { id: "c3", name: "ds.gr.base.corner3", now: radius.card, gr: R.main },
];

/** the same card in the chosen corner */
function RadiusBlock() {
  const { t } = useI18n();
  const [pick, setPick] = useState<"c1" | "c2" | "c3">("c2");
  const c = CORNERS.find((x) => x.id === pick)!;
  return (
    <Block
      id="radius"
      title={t("ds.gr.base.radius")}
      note={t("ds.gr.base.radiusNote")}
      controls={<Pick id="gr-radius-pick" items={CORNERS.map((x) => ({ key: x.id, label: t(x.name) }))} value={pick} onChange={setPick} />}
      now={
        <Card style={{ borderRadius: c.now }}>
          <View testID="gr-radius-now-card">
            <T v="heading">{t("ds.gr.row1")}</T>
          </View>
        </Card>
      }
      variants={[
        <GrMatte key="1" radius={c.gr} style={{ padding: SP[4] }}>
          <View testID="gr-radius-v1-card">
            <GrText v="title">{t("ds.gr.row1")}</GrText>
          </View>
        </GrMatte>,
      ]}
    />
  );
}

export function BasicsBlocks() {
  return (
    <>
      <ThemeBlock />
      <StatusBlock />
      <AccentBlock />
      <SurfaceBlock />
      <SpaceBlock />
      <RadiusBlock />
    </>
  );
}
