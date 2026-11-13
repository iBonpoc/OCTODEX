import { useState } from "react";
import { View } from "react-native";
import { component, motion, size, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { Fab } from "@/nav/Fab";
import { ActionBar } from "@/ui/actionBar";
import { Button, IconButton } from "@/ui/controls";
import { Icon, Press, T } from "@/ui/primitives";
import { DEFAULT_TAX, computeAllOptional, computeCustomOption, type CustomOption, type CustomSettings } from "@octo/estimating-engine";
import { TotalsBreakdown } from "@/features/estimate/TotalsBreakdown";
import { totalsRows } from "@/features/estimate/totalsRows";

// a sample estimate for «Итого ˅» (тестовые цены, rule 9): a line, an add-on, a 10 % discount and deposit
const SAMPLE: CustomOption = {
  id: "showcase",
  name: "Good",
  lines: [
    { id: "s1", name: "Install railing (тестовые)", group: "labor", quantity: "1", unit: "ea", unitPriceCents: 100000, unitCostCents: 60000 },
    { id: "s2", name: "Extended warranty (тестовые)", group: "service", quantity: "1", unit: "ea", unitPriceCents: 50000, unitCostCents: 20000, optional: true },
  ],
};
const SAMPLE_SETTINGS: CustomSettings = { discount: { kind: "pct", value: "0.1" }, tax: DEFAULT_TAX, deposit: { kind: "pct", bps: 1000 } };
import { Card, RowView, SectionTitle } from "@/ui/surfaces";
import { SECTIONS } from "./registry";

/**
 * Buttons (DS §7): every kind and every state, each one pressable — the counter says it was pressed. Sizes are the live
 * tokens: the label under a sample names the token and its number.
 */
export function ButtonsSection() {
  const { t } = useI18n();
  const s = SECTIONS.find((x) => x.id === "buttons")!;
  const [n, setN] = useState(0);
  const [active, setActive] = useState(false);
  const [barOpen, setBarOpen] = useState(false);
  const { money } = useI18n();
  const sampleTotals = computeCustomOption(SAMPLE, SAMPLE_SETTINGS);
  const rows = totalsRows({ totals: sampleTotals, allOptional: computeAllOptional(SAMPLE, SAMPLE_SETTINGS), own: true, costKnown: true });
  const press = () => setN((x) => x + 1);
  const b = component.button;
  const sample = (id: string, caption: string, node: React.ReactNode) => (
    <View key={id} testID={`showcase-btn-${id}`} style={{ gap: space[1] }}>
      {node}
      <T v="caption" tone="mut">
        {caption}
      </T>
    </View>
  );
  return (
    <View testID="showcase-buttons">
      <SectionTitle title={`${t(s.title)} · ${s.ds}`} />
      <Card>
        <View testID="showcase-btn-counter">
          <T v="heading">{t("ds.btn.pressed", { n })}</T>
        </View>
        <T v="caption" tone="mut">{t("ds.btn.hint", { scale: motion.pressScale, hit: size.hitMin })}</T>
      </Card>
      <Card>
        <View testID="showcase-btn-actionbar" style={{ gap: space[2] }}>
          <T v="heading">{t("ds.btn.bar")}</T>
          <T v="caption" tone="mut">{t("ds.btn.barHint")}</T>
          <ActionBar
            summary={
              // «Итого ˅» (DS §8.9, #1362): live — the engine counts a sample estimate (тестовые цены)
              <View style={{ gap: space[1] }}>
                {barOpen ? <TotalsBreakdown client={rows.client.filter((r) => r.key !== "total")} own={rows.own} testID="showcase-bar-breakdown" /> : null}
                <Press onPress={() => setBarOpen((o) => !o)} visibleHeight={size.hitMin} accessibilityRole="button" accessibilityState={{ expanded: barOpen }} {...({ "aria-expanded": barOpen } as object)} testID="showcase-bar-total">
                  <RowView style={{ justifyContent: "space-between", minHeight: size.hitMin }}>
                    <T v="body" tone="mut">{t("ue.total")}</T>
                    <RowView gap={space[1]}>
                      <T v="body" w="semibold" tabular>{money(sampleTotals.total)}</T>
                      <Icon name={barOpen ? "chevronUp" : "chevronDown"} s={size.iconSm} />
                    </RowView>
                  </RowView>
                </Press>
              </View>
            }
            second={<Button label={t("ds.btn.secondary")} size="bar" variant="secondary" full onPress={press} />}
            main={<Button label={t("ds.btn.primary")} size="bar" full onPress={press} />}
          />
          <T v="caption" tone="mut">{t("ds.btn.barOne")}</T>
          <ActionBar main={<Button label={t("ds.btn.primary")} size="bar" full onPress={press} />} />
        </View>
      </Card>
      <Card>
        <T v="heading">{t("ds.btn.kinds")}</T>
        {sample("primary", t("ds.btn.primaryNote"), <Button label={t("ds.btn.primary")} onPress={press} />)}
        {sample("secondary", t("ds.btn.secondaryNote"), <Button label={t("ds.btn.secondary")} variant="secondary" onPress={press} />)}
        {sample("ghost", t("ds.btn.ghostNote"), <Button label={t("ds.btn.ghost")} variant="ghost" onPress={press} />)}
        {sample("danger", t("ds.btn.dangerNote"), <Button label={t("ds.btn.danger")} variant="danger" onPress={press} />)}
        {sample("icon", t("ds.btn.iconNote"), <Button label={t("ds.btn.withIcon")} icon="plus" variant="secondary" onPress={press} />)}
      </Card>
      <Card>
        <T v="heading">{t("ds.btn.sizes")}</T>
        {sample("size-phone", t("ds.btn.sizeNote", { name: "component.button.phone", h: b.phone, hit: b.hit }), <Button label={t("ds.btn.phone")} size="phone" variant="secondary" onPress={press} />)}
        {sample("size-md", t("ds.btn.sizeNote", { name: "component.button.md", h: b.md, hit: b.hit }), <Button label={t("ds.btn.md")} size="md" variant="secondary" onPress={press} />)}
        {sample("size-sm", t("ds.btn.sizeNote", { name: "component.button.sm", h: b.sm, hit: b.hit }), <Button label={t("ds.btn.sm")} size="sm" variant="secondary" onPress={press} />)}
      </Card>
      <Card>
        <T v="heading">{t("ds.btn.states")}</T>
        {sample("state-normal", t("ds.btn.normalNote"), <Button label={t("ds.btn.normal")} onPress={press} />)}
        {sample("state-disabled", t("ds.btn.disabledNote"), <Button label={t("ds.btn.disabled")} disabled onPress={press} />)}
        <T v="caption" tone="mut">{t("ds.btn.waitingNote")}</T>
      </Card>
      <Card>
        <T v="heading">{t("ds.btn.round")}</T>
        <RowView>
          <View testID="showcase-btn-iconbutton" style={{ gap: space[1] }}>
            <IconButton icon="phone" label={t("ds.btn.iconButton")} onPress={press} />
            <T v="caption" tone="mut">{`component.dockBtn ${component.dockBtn}`}</T>
          </View>
          <View testID="showcase-btn-iconbutton-active" style={{ gap: space[1] }}>
            <IconButton icon="star" label={t("ds.btn.iconButtonActive")} active={active} onPress={() => { setActive((v) => !v); press(); }} />
            <T v="caption" tone="mut">{t("ds.btn.toggle")}</T>
          </View>
        </RowView>
        {sample("fab", t("ds.btn.fabNote", { fab: component.fab }), <Fab placement="header" set="home" />)}
      </Card>
    </View>
  );
}
