/**
 * «Графит» — лист витрины (#2292): one BLOCK = one plain-Russian name + «Как сейчас» (the live component of the app, as it is)
 * and «Вариант 1», «Вариант 2» (live `Gr*` components on the «Рельеф» scene) one under another, all seen at once. Nothing here
 * applies anything to the app: a variant is only a number a person can say aloud (spec 63 §5.1).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ImageBackground, StyleSheet, View } from "react-native";
import { graphite } from "@octo/design-tokens";
import { space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { T } from "@/ui/primitives";
import { StatusChip } from "@/ui/controls";
import { Card } from "@/ui/surfaces";
import { ToggleRow } from "@/ui/toggleRow";
import { useGr } from "../theme";

const RELIEF = {
  dark: require("../assets/relief-dark.jpg"),
  light: require("../assets/relief-light.jpg"),
} as const;

/** a demo run: a press counts and keeps `busy` for `ms` (a fake wait, nothing is sent) */
export function useDemoRun(ms: number = graphite.motion.demoWait) {
  const [n, setN] = useState(0);
  const [busy, setBusy] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return {
    n,
    busy,
    press: () => {
      setN((x) => x + 1);
      setBusy(true);
      clearTimeout(t.current);
      t.current = setTimeout(() => setBusy(false), ms);
    },
    /** a plain press: counts, no wait */
    tap: () => setN((x) => x + 1),
  };
}

/** the scene of «Графита» under a variant: the «Рельеф» picture of the theme, rounded like a panel */
export function GrStage({ children, testID }: { children: ReactNode; testID?: string }) {
  const { name } = useGr();
  return (
    <View testID={testID} style={{ borderRadius: graphite.radius.card, overflow: "hidden", padding: graphite.space[3], gap: graphite.space[3] }}>
      <ImageBackground source={RELIEF[name]} resizeMode="cover" style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

/** one line of a block: its label («Как сейчас» / «Вариант N») and the live sample */
export function VariantRow({ id, label, children, stage, inApp }: { id: string; label: string; children: ReactNode; stage?: boolean; inApp?: boolean }) {
  const { t } = useI18n();
  return (
    <View testID={id} style={{ gap: space[1] }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] }}>
        <T v="caption" tone="mut" w="semibold">
          {label}
        </T>
        {/* «Как сейчас» is what the app has now: a plate with an icon and a word, not only a caption */}
        {inApp ? <StatusChip status="info" soft label={t("ds.gr.sheet.inApp")} /> : null}
      </View>
      {stage ? <GrStage>{children}</GrStage> : children}
    </View>
  );
}

/** a small switch of a state a finger cannot hold (switched off, loading, no network) */
export function StateSwitch({ id, label, value, onChange }: { id: string; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <ToggleRow testID={id} label={label} value={value} onChange={onChange} />;
}

/** the block: the name, a line of what it is, the states, then the samples */
export function Block({
  id,
  title,
  note,
  controls,
  now,
  variants,
}: {
  id: string;
  title: string;
  note?: string;
  controls?: ReactNode;
  /** «Как сейчас»; `null` — there is no such element in the app yet (the block says so) */
  now: ReactNode | null;
  /** «Вариант 1», «Вариант 2» — each is one live sample (the number is its place); one variant — one */
  variants: ReactNode[];
}) {
  const { t } = useI18n();
  return (
    <Card>
      <View testID={`gr-block-${id}`} style={{ gap: space[3] }}>
        <View style={{ gap: space[1] }}>
          <T v="heading">{title}</T>
          {note ? (
            <T v="caption" tone="mut">
              {note}
            </T>
          ) : null}
        </View>
        {controls ? <View testID={`gr-block-${id}-states`}>{controls}</View> : null}
        <VariantRow id={`gr-${id}-now`} label={t("ds.gr.sheet.now")} inApp>
          {now ?? (
            <T v="body" tone="mut">
              {t("ds.gr.sheet.noneNow")}
            </T>
          )}
        </VariantRow>
        {variants.map((v, i) => (
          <VariantRow key={i} id={`gr-${id}-v${i + 1}`} label={t("ds.gr.sheet.var", { n: i + 1 })} stage>
            {v}
          </VariantRow>
        ))}
      </View>
    </Card>
  );
}
