import { useMemo, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { DEMO_PRICE_BOOK } from "@/data/priceBook";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { DEFAULT_FORM, quickOptions, type QuickGutterForm } from "@/features/quickEstimate";
import { Button, Segmented, StatusChip, Stepper, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Divider, Empty, Grid, RowView, Screen, SectionTitle } from "@/ui/surfaces";

/**
 * Quick gutter estimate from paper measurements (PRD 06 quick form) → Good / Better / Best
 * computed by @octo/estimating-engine. The photo drawing (ADR-004) feeds the same input in wave 3.
 */
export default function NewEstimate() {
  const { customerId, propertyId } = useLocalSearchParams<{ customerId?: string; propertyId?: string }>();
  const { db, addEstimate, online } = useStore();
  const { t, money } = useI18n();
  const { c } = useTheme();
  const toast = useToast();
  const [f, setF] = useState<QuickGutterForm>(() => {
    const p = db.properties.find((x) => x.id === propertyId);
    return { ...DEFAULT_FORM, stories: p?.stories ?? DEFAULT_FORM.stories };
  });
  const [chosen, setChosen] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const set = <K extends keyof QuickGutterForm>(k: K, v: QuickGutterForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const options = useMemo(() => quickOptions(f, DEMO_PRICE_BOOK), [f]);
  const customer = db.customers.find((x) => x.id === customerId);
  const property = db.properties.find((x) => x.id === propertyId) ?? db.properties.find((x) => x.customerId === customerId);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const save = () => {
    const o = options[chosen];
    if (!o || !customer || !property) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const undo = addEstimate({
      customerId: customer.id,
      propertyId: property.id,
      title: `${o.name}: ${f.lengthFt} LF, ${f.downspouts} DS`,
      totalCents: o.totals.total,
      status: "draft",
      depositCents: o.deposit,
      marginPct: o.totals.marginPct,
      lines: o.lines
        .map((l, i) => ({ l, total: o.totals.lineTotals[i] ?? 0 }))
        .filter(({ l }) => l.clientVisible !== false)
        .map(({ l, total }) => ({ name: l.name, qty: String(l.quantity), totalCents: total, optional: l.isOptional })),
    });
    toast.show(online ? t("est.saved", { name: customer.name }) : t("offline.queued"), undo);
    router.replace(`/client/${customer.id}`);
  };

  return (
    <Screen
      title={t("est.title")}
      back={back}
      subtitle={customer ? `${t("est.for")}: ${customer.name}${property ? ` · ${property.address}` : ""}` : t("est.noClient")}
    >
      <Grid>
        <Card>
          <T v="heading">{t("est.inputs")}</T>
          <T v="caption" tone="mut">
            {t("est.stories")}
          </T>
          <Segmented
            full
            value={String(f.stories)}
            onChange={(v) => set("stories", Number(v))}
            items={["1", "2", "3"].map((k) => ({ key: k, label: k }))}
          />
          <Stepper label={t("est.length")} unit={t("est.ft")} value={f.lengthFt} step={10} max={2000} onChange={(v) => set("lengthFt", v)} />
          <Divider />
          <Stepper label={t("est.downspouts")} value={f.downspouts} max={40} onChange={(v) => set("downspouts", v)} />
          <Stepper label={t("est.outCorners")} value={f.outsideCorners} max={40} onChange={(v) => set("outsideCorners", v)} />
          <Stepper label={t("est.inCorners")} value={f.insideCorners} max={40} onChange={(v) => set("insideCorners", v)} />
          <Divider />
          <RowView style={{ minHeight: 44 }}>
            <T v="body" style={{ flex: 1 }}>
              {t("est.tearOff")}
            </T>
            <Toggle label={t("est.tearOff")} on={f.tearOff} onChange={(v) => set("tearOff", v)} />
          </RowView>
          <RowView style={{ minHeight: 44 }}>
            <T v="body" style={{ flex: 1 }}>
              {t("est.tile")}
            </T>
            <Toggle label={t("est.tile")} on={f.tileRoof} onChange={(v) => set("tileRoof", v)} />
          </RowView>
        </Card>
        <View style={{ gap: space[3] }}>
          <SectionTitle title={t("est.options")} />
          {options.length === 0 ? (
            <Empty icon="ruler" title={t("est.empty")} />
          ) : (
            options.map((o, i) => {
              const sel = i === chosen;
              const visible = o.lines.filter((l) => l.clientVisible !== false);
              return (
                <Card key={o.name} onPress={() => setChosen(i)} accessibilityLabel={o.name} style={sel ? { borderColor: c.acc, borderWidth: 2 } : undefined}>
                  <RowView style={{ justifyContent: "space-between" }}>
                    <T v="heading">{o.name}</T>
                    {sel ? <StatusChip status="ok" label={t("est.chosen")} /> : null}
                  </RowView>
                  <T v="display" tabular>
                    {money(o.totals.total)}
                  </T>
                  <RowView style={{ flexWrap: "wrap" }}>
                    <T v="caption" tone="mut">
                      {t("est.margin", { p: o.totals.marginPct ?? "0" })}
                    </T>
                    <T v="caption" tone="mut">
                      · {t("est.deposit", { amount: money(o.deposit) })}
                    </T>
                  </RowView>
                  {o.depositCapped ? (
                    <T v="micro" tone="warn">
                      {t("est.capNote")}
                    </T>
                  ) : null}
                  <Button
                    label={`${t("est.lines")} · ${visible.length}`}
                    variant="ghost"
                    size="sm"
                    icon={open === i ? "chevronDown" : "chevronRight"}
                    onPress={() => setOpen(open === i ? null : i)}
                  />
                  {open === i
                    ? visible.map((l) => {
                        const idx = o.lines.indexOf(l);
                        return (
                          <RowView key={l.sku} style={{ justifyContent: "space-between" }}>
                            <T v="caption" style={{ flex: 1 }} tone={l.isOptional ? "mut" : "ink"}>
                              {l.name} × {String(l.quantity)}
                              {l.isOptional ? ` (${t("est.optional")})` : ""}
                            </T>
                            <T v="caption" tabular>
                              {money(o.totals.lineTotals[idx] ?? 0)}
                            </T>
                          </RowView>
                        );
                      })
                    : null}
                </Card>
              );
            })
          )}
          <T v="caption" tone="mut">
            {t("est.placeholder")}
          </T>
          {customer && property ? <Button label={t("est.save")} icon="check" full onPress={save} disabled={!options.length} /> : null}
        </View>
      </Grid>
    </Screen>
  );
}
