/**
 * Client-facing estimate body (shared by the client page and on-site signing):
 * option cards (when > 1, with "Recommended"), lines by group, add-on switches, totals with tax line and deposit.
 */
import { View } from "react-native";
import { space, component, size } from "@octo/design-tokens";
import { activeLines, ppmToPctText, taxRatePpm, type CustomOption } from "@octo/estimating-engine";
import type { EstimateDoc } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { optionTotals, shownQty, withAddons } from "./estimateDoc";
import { clientRows } from "./clientLayout";
import { DocPagesView } from "./DocPagesView";
import { StatusChip, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, Divider, RowView, SectionTitle } from "@/ui/surfaces";

export function EstimateView({
  doc,
  optionId,
  onOption,
  addonIds,
  onAddons,
  readOnly,
}: {
  doc: EstimateDoc;
  optionId: string;
  onOption?: (id: string) => void;
  addonIds: string[];
  onAddons?: (ids: string[]) => void;
  readOnly?: boolean;
}) {
  const { t, money } = useI18n();
  // the words of the document are the page's (the client page already speaks the client's language: the i18n provider there)
  const ct = t;
  const { c } = useTheme();
  const base = doc.options.find((o) => o.id === optionId) ?? doc.options[0]!;
  const option: CustomOption = withAddons(base, addonIds);
  const tot = optionTotals(doc, option);
  const act = activeLines(option.lines);
  const s = doc.settings;
  const many = doc.options.length > 1;

  return (
    <View style={{ gap: space[3] }}>
      {many ? (
        <>
          <SectionTitle title={t("portal.choose")} />
          {doc.options.map((o) => {
            const sel = o.id === base.id;
            const ot = optionTotals(doc, withAddons(o, sel ? addonIds : []));
            return (
              <Card
                key={o.id}
                onPress={readOnly || !onOption ? undefined : () => onOption(o.id)}
                accessibilityLabel={o.name}
                style={sel ? { borderColor: c.acc, borderWidth: component.selectedBorder } : undefined}
              >
                <RowView style={{ justifyContent: "space-between" }}>
                  <T v="heading" style={{ flex: 1 }}>
                    {o.name}
                  </T>
                  {o.recommended ? <StatusChip status="ok" label={t("ue.recommended")} /> : null}
                </RowView>
                <T v="title" tabular>
                  {money(ot.total)}
                </T>
                <T v="caption" tone="mut">
                  {activeLines(o.lines)
                    .filter((l) => !l.optional)
                    .map((l) => l.name)
                    .slice(0, 4)
                    .join(" · ")}
                </T>
              </Card>
            );
          })}
        </>
      ) : null}

      <Card>
        {many ? <T v="heading">{option.name}</T> : null}
        {/* the lines by section (own words as written, the dictionary's in the client's language) or by kind; an add-on stands in its own
            place with its switch (no separate block); a section's subtotal counts the chosen add-ons only */}
        {clientRows(option, s, ct, "all").map((r, k) => {
          if (r.type === "group") {
            return (
              <T key={`g${r.group}`} v="caption" tone="mut" w="semibold">
                {t(`ue.group.${r.group}` as DictKey)}
              </T>
            );
          }
          if (r.type === "section" || r.type === "other") {
            return (
              <View key={r.type === "section" ? `s${r.id}` : "other"} style={{ gap: space[1], paddingLeft: r.type === "section" && r.depth ? space[4] : 0 }}>
                <T v="caption" tone="mut" w="semibold">
                  {r.title}
                </T>
              </View>
            );
          }
          if (r.type === "subtotal") {
            return (
              <View key={`t${k}`} style={{ gap: space[1] }}>
                <Line label={ct("est.client.subtotal", { title: r.title })} v={money(r.cents)} />
                <Divider />
              </View>
            );
          }
          const l = act[r.i]!;
          return (
            <RowView key={l.id} style={{ justifyContent: "space-between", alignItems: "flex-start", minHeight: l.optional && !readOnly && onAddons ? size.hitMin : component.rowCompact, paddingLeft: r.depth ? space[4] : 0 }}>
              <View style={{ flex: 1 }}>
                <T v="body">{l.name}</T>
                <T v="caption" tone="mut" tabular>
                  {l.optional ? `${t("portal.addons")} · ` : ""}
                  {shownQty(l.quantity)} {l.unit} × {money(l.unitPriceCents)}
                </T>
              </View>
              <T v="body" tabular>
                {l.optional && !l.selected ? `+ ${money(tot.lineTotals[r.i] ?? 0)}` : money(tot.lineTotals[r.i] ?? 0)}
              </T>
              {l.optional ? (
                readOnly || !onAddons ? (
                  l.selected ? <StatusChip status="ok" label={t("est.chosen")} /> : null
                ) : (
                  <Toggle label={l.name} on={!!l.selected} onChange={(on) => onAddons(on ? [...addonIds, l.id] : addonIds.filter((x) => x !== l.id))} />
                )
              ) : null}
            </RowView>
          );
        })}
        <Divider />

        <Line label={t("ue.subtotal")} v={money(tot.subtotal)} />
        {tot.discount ? <Line label={t("ue.discount")} v={`−${money(tot.discount)}`} /> : null}
        {tot.tax ? <Line label={t("ue.taxLine", { rate: ppmToPctText(taxRatePpm(s.tax)) })} v={money(tot.tax)} /> : null}
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="title">{t("ue.total")}</T>
          <T v="display" tabular>
            {money(tot.total)}
          </T>
        </RowView>
        {tot.deposit ? <Line label={t("portal.depositDue")} v={money(tot.deposit)} /> : null}
      </Card>
      {doc.note ? (
        <T v="body" tone="mut">
          {doc.note}
        </T>
      ) : null}
      <DocPagesView pages={doc.pages} />
    </View>
  );
}

function Line({ label, v }: { label: string; v: string }) {
  return (
    <RowView style={{ justifyContent: "space-between" }}>
      <T v="body" tone="mut">
        {label}
      </T>
      <T v="body" tabular>
        {v}
      </T>
    </RowView>
  );
}
