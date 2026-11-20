/**
 * «Графит» — пилот витрины (#2254), НЕ ПРАВИЛО: the one screen in the new look (handoff §5). It opens full-screen from the
 * showcase section «Графит (пилот)» (behind the switch, flag.ts) and has everything the founder tries on the iPhone: the
 * «Прожектор» nav, the main and the secondary button, the ½ sheet, the phone field, the «Вернуть» toast, list rows and a
 * task row, the glass panel with statuses; its own theme switch; «уменьшить движение / прозрачность» respected.
 * The scene is the «Рельеф» picture of the theme (assets/, made by the design package's generator, Appendix A).
 */
import { useRef, useState } from "react";
import { ImageBackground, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { graphite } from "@octo/design-tokens";
import { fmtUsd } from "@octo/estimating-engine";
import { useI18n, type DictKey } from "@/i18n";
import { Icon, type IconKey } from "@/ui/primitives";
import {
  GrButton,
  GrPanel,
  GrPhoneField,
  GrRow,
  GrStatus,
  GrTaskRow,
} from "./Controls";
import { GrLiquid, useGlassMode } from "./Glass";
import { GrSheet } from "./Sheet";
import { SpotlightNav } from "./Spotlight";
import { GrToasts, toastPush, type GrToastMsg } from "./Toast";
import { GrPress, GrText, useGr, type GrThemePref } from "./theme";

const RELIEF = {
  dark: require("./assets/relief-dark.jpg"),
  light: require("./assets/relief-light.jpg"),
} as const;

interface DemoRow {
  id: string;
  icon: IconKey;
  title: DictKey;
  sub: DictKey;
  cents: number;
}
/** demo values (rule 9: examples, not anyone's prices) */
const ROWS: DemoRow[] = [
  {
    id: "r1",
    icon: "invoice",
    title: "ds.gr.row1",
    sub: "ds.gr.row1Sub",
    cents: 124000,
  },
  {
    id: "r2",
    icon: "pin",
    title: "ds.gr.row2",
    sub: "ds.gr.row2Sub",
    cents: 38500,
  },
  {
    id: "r3",
    icon: "user",
    title: "ds.gr.row3",
    sub: "ds.gr.row3Sub",
    cents: 96000,
  },
];
const NEXT_PREF: Record<GrThemePref, GrThemePref> = {
  system: "dark",
  dark: "light",
  light: "system",
};
const PREF_ICON: Record<GrThemePref, IconKey> = {
  system: "sync",
  dark: "moon",
  light: "sun",
};
const PREF_LABEL: Record<GrThemePref, DictKey> = {
  system: "ds.gr.themeSystem",
  dark: "ds.gr.themeDark",
  light: "ds.gr.themeLight",
};
const GLASS_LABEL = {
  native: "ds.gr.glassNative",
  matte: "ds.gr.glassMatte",
  solid: "ds.gr.glassSolid",
} as const;

const SP = graphite.space;
const S = graphite.size;

function Circle({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: IconKey;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const { g } = useGr();
  return (
    <GrPress
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
    >
      <GrLiquid
        radius={graphite.radius.pill}
        style={{
          width: S.control,
          height: S.control,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* in its own View: on the web an svg is painted under the glass layers */}
        <View>
          <Icon name={icon} s={S.glyph} color={g.text} />
        </View>
      </GrLiquid>
    </GrPress>
  );
}

export function GraphiteScreen({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { g, name, pref, setPref, reduceMotion, reduceTransparency } = useGr();
  const glass = useGlassMode();
  const ins = useSafeAreaInsets();
  const [rows, setRows] = useState(ROWS);
  const [sheet, setSheet] = useState(false);
  const [toasts, setToasts] = useState<GrToastMsg[]>([]);
  const seq = useRef(0);
  const navBottom = Math.max(ins.bottom, SP[2]);
  const show = (m: Omit<GrToastMsg, "id">) =>
    setToasts((st) => toastPush(st, { ...m, id: ++seq.current }));

  const removeRow = () => {
    const gone = rows[rows.length - 1];
    if (!gone) return;
    const before = rows;
    setRows(rows.slice(0, -1));
    show({
      text: t("ds.gr.deleted"),
      action: { label: t("ds.gr.undo"), run: () => setRows(before) },
    });
  };

  return (
    <View testID="gr-screen" style={{ flex: 1, backgroundColor: g.bg }}>
      <ImageBackground
        source={RELIEF[name]}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
      />
      <View
        style={{
          paddingTop: ins.top + SP[2],
          paddingHorizontal: SP[4],
          paddingBottom: SP[2],
          flexDirection: "row",
          alignItems: "center",
          gap: SP[2],
          zIndex: graphite.z.header,
        }}
      >
        <GrText v="display" style={{ flex: 1 }} lines={1}>
          {t("ds.gr.tab.today")}
        </GrText>
        <Circle
          testID="gr-theme"
          icon={PREF_ICON[pref]}
          label={`${t("ds.gr.theme")}: ${t(PREF_LABEL[pref])}`}
          onPress={() => setPref(NEXT_PREF[pref])}
        />
        <Circle
          testID="gr-close"
          icon="close"
          label={t("ds.gr.close")}
          onPress={onClose}
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: SP[4],
          paddingBottom: S.nav + navBottom + SP[12],
          gap: SP[3],
        }}
      >
        <GrPanel testID="gr-panel" title={t("ds.gr.burning", { n: "3" })}>
          <GrStatus tone="bad" label={t("ds.gr.st.bad")} />
          <GrStatus tone="warn" label={t("ds.gr.st.warn")} />
          <GrStatus tone="info" label={t("ds.gr.st.info")} />
          <GrStatus tone="ok" label={t("ds.gr.st.ok")} />
        </GrPanel>
        <GrPanel
          testID="gr-list"
          title={t("ds.gr.list")}
          count={String(rows.length + 1)}
        >
          <View>
            {rows.map((r) => (
              <GrRow
                key={r.id}
                testID={`gr-row-${r.id}`}
                icon={r.icon}
                title={t(r.title)}
                sub={t(r.sub)}
                right={fmtUsd(r.cents)}
              />
            ))}
            <GrTaskRow
              testID="gr-task"
              title={t("ds.gr.task")}
              sub={t("ds.gr.taskSub")}
              last
            />
          </View>
          <GrButton
            testID="gr-delete"
            kind="secondary"
            label={t("ds.gr.delete")}
            onPress={removeRow}
          />
        </GrPanel>
        <GrPanel title={t("ds.gr.phone")}>
          <GrPhoneField testID="gr-phone" />
        </GrPanel>
        <View style={{ gap: SP[2] }}>
          <GrButton
            testID="gr-primary"
            kind="primary"
            label={t("ds.gr.primary")}
            onPress={() => show({ text: t("ds.gr.primary") })}
          />
          <GrButton
            testID="gr-secondary"
            kind="secondary"
            label={t("ds.gr.secondary")}
            onPress={() => setSheet(true)}
          />
        </View>
        <View
          testID="gr-access"
          style={{
            alignSelf: "flex-start",
            backgroundColor: g.bgVeil,
            borderRadius: graphite.radius.sm,
            paddingHorizontal: SP[2],
            paddingVertical: SP[1],
          }}
        >
          <GrText v="micro" tone="text2">
            {t("ds.gr.access", {
              m: t(reduceMotion ? "ds.gr.on" : "ds.gr.off"),
              t: t(reduceTransparency ? "ds.gr.on" : "ds.gr.off"),
            })}
          </GrText>
          <GrText v="micro" tone="text2">
            {t(GLASS_LABEL[glass])}
          </GrText>
        </View>
      </ScrollView>
      <View
        style={{
          position: "absolute",
          left: SP[4],
          right: SP[4],
          bottom: navBottom,
          zIndex: graphite.z.nav,
        }}
      >
        <SpotlightNav badge={3} onPlus={() => setSheet(true)} />
      </View>
      <GrToasts
        stack={toasts}
        onGone={(id) => setToasts((st) => st.filter((x) => x.id !== id))}
        bottom={navBottom + S.nav + SP[2]}
      />
      <GrSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title={t("ds.gr.sheetTitle")}
      >
        <GrText v="sub" tone="text2">
          {t("ds.gr.sheetBody")}
        </GrText>
        <GrButton
          testID="gr-sheet-save"
          kind="secondary"
          label={t("ds.gr.save")}
          onPress={() => setSheet(false)}
        />
      </GrSheet>
    </View>
  );
}
