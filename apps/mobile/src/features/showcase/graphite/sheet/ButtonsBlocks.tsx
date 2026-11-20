/**
 * «Кнопки» on the sheet (#2292, spec 63 §2.2): «Как сейчас» is `Button` / `IconButton` / `ActionBar` / `Fab` of «Наряд» as they
 * are; «Вариант 1» is the package «Графит» (`variant` 1), «Вариант 2» the quieter one (`variant` 2). Every sample is pressable and says
 * so; «Загрузка» and «Выключено» are small switches of the block (states a finger cannot hold).
 */
import { useState } from "react";
import { View } from "react-native";
import { graphite } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { Fab } from "@/nav/Fab";
import { ActionBar } from "@/ui/actionBar";
import { Button, IconButton } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { GrButton, GrIconButton, GrPlus } from "../Controls";
import { GrText } from "../theme";
import { Block, StateSwitch, useDemoRun } from "./Block";

const SP = graphite.space;

/** how many times the block was pressed; on the scene of «Графита» (`gr`) it is «Графит» text, else «Наряд» */
function Count({ id, n, gr }: { id: string; n: number; gr?: boolean }) {
  const { t } = useI18n();
  const text = t("ds.gr.sheet.pressed", { n });
  return (
    <View testID={id}>
      {gr ? (
        <GrText v="caption" tone="text2">
          {text}
        </GrText>
      ) : (
        <T v="caption" tone="mut">
          {text}
        </T>
      )}
    </View>
  );
}

/** a block of one button kind: «Как сейчас», two variants, the counter and the two state switches */
function KindBlock({
  id,
  kind,
  title,
  note,
  label,
  icon,
  nowVariant,
  oneVariant,
}: {
  id: string;
  kind: "primary" | "secondary" | "ghost" | "danger";
  title: string;
  note: string;
  label: string;
  icon?: "phone";
  nowVariant: "primary" | "secondary" | "ghost" | "danger";
  oneVariant?: boolean;
}) {
  const { t } = useI18n();
  const runNow = useDemoRun();
  const run1 = useDemoRun();
  const run2 = useDemoRun();
  const [loading, setLoading] = useState(false);
  const [off, setOff] = useState(false);
  // each sample counts its own presses; a press of a variant also makes it wait a moment (a fake wait)
  const gr = (variant: 1 | 2, run: ReturnType<typeof useDemoRun>) => (
    <>
      <GrButton testID={`gr-${id}-v${variant}-btn`} kind={kind} variant={variant} icon={icon} label={label} loading={loading || run.busy} disabled={off} onPress={run.press} />
      <Count gr id={`gr-${id}-v${variant}-count`} n={run.n} />
    </>
  );
  return (
    <Block
      id={id}
      title={title}
      note={note}
      controls={
        <View>
          <StateSwitch id={`gr-${id}-loading`} label={t("ds.gr.sheet.loading")} value={loading} onChange={setLoading} />
          <StateSwitch id={`gr-${id}-disabled`} label={t("ds.gr.sheet.disabled")} value={off} onChange={setOff} />
        </View>
      }
      now={
        <View style={{ gap: SP[1] }}>
          <Button testID={`gr-${id}-now-btn`} label={label} icon={icon} variant={nowVariant} disabled={off} onPress={runNow.tap} />
          <Count id={`gr-${id}-now-count`} n={runNow.n} />
          {loading ? (
            <T v="caption" tone="mut">
              {t("ds.gr.sheet.noWait")}
            </T>
          ) : null}
        </View>
      }
      variants={oneVariant ? [gr(1, run1)] : [gr(1, run1), gr(2, run2)]}
    />
  );
}

function RoundBlock() {
  const { t } = useI18n();
  const runs = [useDemoRun(), useDemoRun(), useDemoRun()];
  const [off, setOff] = useState(false);
  // each sample is switched on and off on its own
  const [on, setOn] = useState([false, false, false]);
  const flip = (i: number) => () => {
    setOn((v) => v.map((x, j) => (j === i ? !x : x)));
    runs[i]!.tap();
  };
  return (
    <Block
      id="round"
      title={t("ds.gr.btn.round")}
      note={t("ds.gr.btn.roundNote")}
      controls={
        <View>
          <StateSwitch id="gr-round-disabled" label={t("ds.gr.sheet.disabled")} value={off} onChange={setOff} />
        </View>
      }
      now={
        <View style={{ gap: SP[1] }}>
          <IconButton testID="gr-round-now-btn" icon="phone" label={t("ds.gr.btn.call")} active={on[0]} onPress={flip(0)} />
          <Count id="gr-round-now-count" n={runs[0]!.n} />
          {off ? (
            <T v="caption" tone="mut">
              {t("ds.gr.sheet.noOff")}
            </T>
          ) : null}
        </View>
      }
      variants={[1, 2].map((variant) => (
        <View key={variant} style={{ gap: SP[1] }}>
          <View style={{ flexDirection: "row" }}>
            <GrIconButton testID={`gr-round-v${variant}-btn`} icon="phone" label={t("ds.gr.btn.call")} variant={variant as 1 | 2} active={on[variant]} disabled={off} onPress={flip(variant)} />
          </View>
          <Count gr id={`gr-round-v${variant}-count`} n={runs[variant]!.n} />
        </View>
      ))}
    />
  );
}

function PlusBlock() {
  const { t } = useI18n();
  const run = useDemoRun();
  return (
    <Block
      id="plus"
      title={t("ds.gr.btn.plus")}
      note={t("ds.gr.btn.plusNote")}
      now={
        <View style={{ gap: SP[1] }}>
          {/* the live «＋» of the app; it opens its own menu of what to create */}
          <View style={{ flexDirection: "row" }}>
            <Fab placement="header" set="home" />
          </View>
          <T v="caption" tone="mut">
            {t("ds.gr.btn.plusNowNote")}
          </T>
        </View>
      }
      variants={[
        <View key="1" style={{ gap: SP[1] }}>
          <View style={{ flexDirection: "row" }}>
            <GrPlus testID="gr-plus-v1-btn" label={t("ds.gr.btn.create")} onPress={run.tap} />
          </View>
          <Count gr id="gr-plus-v1-count" n={run.n} />
        </View>,
      ]}
    />
  );
}

function BarBlock() {
  const { t } = useI18n();
  const runs = [useDemoRun(), useDemoRun(), useDemoRun()];
  const [off, setOff] = useState(false);
  return (
    <Block
      id="bar"
      title={t("ds.gr.btn.bar")}
      note={t("ds.gr.btn.barNote")}
      controls={
        <View>
          <StateSwitch id="gr-bar-disabled" label={t("ds.gr.sheet.disabled")} value={off} onChange={setOff} />
        </View>
      }
      now={
        <View style={{ gap: SP[1] }}>
          <ActionBar
            second={<Button testID="gr-bar-now-second" label={t("ds.gr.secondary")} size="bar" variant="secondary" full disabled={off} onPress={runs[0]!.tap} />}
            main={<Button testID="gr-bar-now-main" label={t("ds.gr.primary")} size="bar" full disabled={off} onPress={runs[0]!.tap} />}
          />
          <Count id="gr-bar-now-count" n={runs[0]!.n} />
        </View>
      }
      variants={[1, 2].map((variant) => (
        <View key={variant} style={{ gap: SP[1] }}>
          {/* side by side; a big system text wraps them one under the other instead of cutting the label */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SP[2] }}>
            <View style={{ flexGrow: 1, minWidth: graphite.size.row * 2 }}>
              <GrButton testID={`gr-bar-v${variant}-second`} kind="secondary" variant={variant as 1 | 2} label={t("ds.gr.secondary")} disabled={off} onPress={runs[variant]!.tap} />
            </View>
            <View style={{ flexGrow: 1, minWidth: graphite.size.row * 2 }}>
              <GrButton testID={`gr-bar-v${variant}-main`} kind="primary" variant={variant as 1 | 2} label={t("ds.gr.primary")} disabled={off} onPress={runs[variant]!.tap} />
            </View>
          </View>
          <Count gr id={`gr-bar-v${variant}-count`} n={runs[variant]!.n} />
        </View>
      ))}
    />
  );
}

export function ButtonsBlocks() {
  const { t } = useI18n();
  return (
    <>
      <KindBlock id="main" kind="primary" nowVariant="primary" title={t("ds.gr.btn.main")} note={t("ds.gr.btn.mainNote")} label={t("ds.gr.primary")} />
      <KindBlock id="second" kind="secondary" nowVariant="secondary" title={t("ds.gr.btn.second")} note={t("ds.gr.btn.secondNote")} label={t("ds.gr.secondary")} />
      <KindBlock id="ghost" kind="ghost" nowVariant="ghost" title={t("ds.gr.btn.ghost")} note={t("ds.gr.btn.ghostNote")} label={t("ds.gr.btn.later")} oneVariant />
      <KindBlock id="danger" kind="danger" nowVariant="danger" title={t("ds.gr.btn.danger")} note={t("ds.gr.btn.dangerNote")} label={t("ds.gr.btn.delClient")} />
      <KindBlock id="icon" kind="secondary" nowVariant="secondary" icon="phone" title={t("ds.gr.btn.withIcon")} note={t("ds.gr.btn.withIconNote")} label={t("ds.gr.btn.call")} />
      <RoundBlock />
      <BarBlock />
      <PlusBlock />
    </>
  );
}
