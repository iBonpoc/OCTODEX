import { memo, useEffect, useRef, useState, type ComponentRef } from "react";
import { View } from "react-native";
import Animated, { Easing, useReducedMotion, useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { motion, size, space } from "@octo/design-tokens";
import type { CustomLine, LineGroup } from "@octo/estimating-engine";
import { useI18n, type DictKey } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, IconButton, Segmented, StatusChip, TextField, Toggle } from "@/ui/controls";
import { Menu, type MenuItem } from "@/ui/overlays";
import { NumberField } from "@/ui/numberField";
import { Icon, Press, T, type IconKey } from "@/ui/primitives";
import type { RequiredForm } from "@/ui/requiredForm";
import { SelectField } from "@/ui/selectField";
import { RowView } from "@/ui/surfaces";
import { shownQty, lineMarks } from "@/features/estimateDoc";
import { rowFigures, rowSummary } from "@/features/estimateRows";
import { LineMarks } from "@/features/LineMarks";

/**
 * A line of the estimate, in place (DS §8.3, spec 2026-11-12-estimate-editor Р1): folded — the name, «120 LF × $8.50», the
 * sum; a tap opens it where it stands (one open); open — the name and description, the kind, the numbers, the sum and the
 * profit (for who sees costs), «Ещё». The screen decides who is open and when a row closes; the row only draws and edits.
 */
export const UNITS = ["ea", "ft", "LF", "sq ft", "hr", "day", "lot"] as const;
const GROUPS: LineGroup[] = ["service", "labor", "material"];
const KIND_ICON: Record<LineGroup, IconKey> = { service: "wrench", labor: "user", material: "note" };
/** the id of the choice «Своя…» in the unit list */
const OWN = "__own__";

export type RowAction = "replace" | "duplicate" | "delete";

/** what the rows ask of the screen: ONE object with stable functions (the rows are memoised: a row redraws when its own data does) */
export interface RowApi {
  open: (id: string) => void;
  close: () => void;
  change: (id: string, patch: Partial<CustomLine>) => void;
  action: (id: string, a: RowAction) => void;
  /** a number field of the row holds text that is not a number (the line itself keeps the last right value) */
  bad: (id: string, field: "qty" | "price" | "cost", bad: boolean) => void;
}

export interface LineRowProps {
  line: CustomLine;
  open: boolean;
  /** the sum of the line, the engine's (the screen has it from the totals) */
  total: number;
  /** who sees the cost (not the tech): the cost field, the profit */
  costsVisible: boolean;
  form: RequiredForm;
  api: RowApi;
  /** the field that takes the cursor when the row opens */
  autoFocus?: "name" | "qty";
  checkPrice?: boolean;
  /** a signed estimate: the row does not open (DS §8.3) */
  locked?: boolean;
}

export const rowFieldId = (lineId: string, f: "name" | "qty" | "price" | "cost") => `est-${f}-${lineId}`;

function LineRowView(p: LineRowProps) {
  const { l, open } = { l: p.line, open: p.open };
  const { t, money } = useI18n();
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const [menu, setMenu] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const moreRef = useRef<ComponentRef<typeof View>>(null);
  const [more, setMore] = useState(false);
  // «Своя…»: the unit is written by hand — chosen so, or not one of the list (a catalog thing, a module, «Отменить»)
  const known = (UNITS as readonly string[]).includes(l.unit);
  const [pickedOwn, setPickedOwn] = useState(false);
  useEffect(() => {
    if (known) setPickedOwn(false);
  }, [known, l.unit]);
  const ownUnit = pickedOwn || !known;
  // the height of the row opens in `durBase` (reduced motion: at once)
  const grow = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    grow.value = reduce ? (open ? 1 : 0) : withTiming(open ? 1 : 0, { duration: motion.durBase, easing: Easing.out(Easing.cubic) });
  }, [open, reduce, grow]);
  const fade = useAnimatedStyle(() => ({ opacity: grow.value }));

  const marks = lineMarks(l);
  const figures = open ? rowFigures(l, p.costsVisible) : null;
  const items: MenuItem<RowAction>[] = [
    { key: "replace", label: t("est.row.replace"), icon: "refresh", testID: `est-act-replace-${l.id}` },
    { key: "duplicate", label: t("est.row.duplicate"), icon: "copy", testID: `est-act-duplicate-${l.id}` },
    { key: "delete", label: t("est.row.delete"), icon: "trash", destructive: true, testID: `est-act-delete-${l.id}` },
  ];
  const f = (id: "name" | "qty" | "price" | "cost") => p.form.field(rowFieldId(l.id, id));

  if (!open) {
    return (
      <Press onPress={p.locked ? undefined : () => p.api.open(l.id)} disabled={p.locked} visibleHeight={size.rowMin} accessibilityRole="button" accessibilityLabel={l.name || t("est.row.unnamed")} accessibilityState={{ expanded: false }} testID={`est-line-${l.id}`}>
        <View style={{ minHeight: size.rowMin, paddingVertical: space[2], gap: space[1] }}>
          <RowView style={{ alignItems: "flex-start" }}>
            <View style={{ paddingTop: space[1] }}>
              <Icon name={KIND_ICON[l.group]} s={size.iconSm} color={c.mut} />
            </View>
            <View style={{ flex: 1, gap: space[1] }}>
              <T v="body" w="semibold" numberOfLines={1}>
                {l.name || t("est.row.unnamed")}
              </T>
              <T v="caption" tone="mut" tabular numberOfLines={1}>
                {rowSummary(l, money, shownQty)}
              </T>
            </View>
            <View style={{ alignItems: "flex-end", gap: space[1] }}>
              <T v="body" tabular tone={l.optional ? "mut" : "ink"}>
                {money(p.total)}
              </T>
              {l.optional ? <StatusChip status="neutral" label={t("ue.addonChip")} /> : null}
            </View>
          </RowView>
          <LineMarks marks={marks} lineId={l.id} />
          {p.checkPrice ? (
            <View testID={`est-checkprice-${l.id}`}>
              <StatusChip status="warn" label={t("est.tpl.checkLine")} />
            </View>
          ) : null}
        </View>
      </Press>
    );
  }

  const unitItems = [...UNITS, ...(l.unit && !(UNITS as readonly string[]).includes(l.unit) ? [l.unit] : [])].map((u) => ({ key: u as string, label: u }));
  unitItems.push({ key: OWN, label: t("est.row.unitOwn") });
  return (
    <Animated.View style={[{ paddingVertical: space[3], gap: space[3] }, fade]} testID={`est-line-${l.id}`} accessibilityState={{ expanded: true }}>
      <RowView style={{ justifyContent: "space-between" }}>
        <Icon name={KIND_ICON[l.group]} s={size.iconSm} color={c.mut} />
        <RowView>
          <View
            ref={moreRef}
            collapsable={false}
          >
            <View testID={`est-menu-${l.id}`}>
            <IconButton
              icon="more"
              label={t("est.row.actions")}
              onPress={() => moreRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setMenu({ x, y, w, h }))}
            />
            </View>
          </View>
          <View testID={`est-collapse-${l.id}`}>
            <Button label={t("est.row.collapse")} icon="chevronDown" variant="ghost" size="sm" onPress={p.api.close} />
          </View>
        </RowView>
      </RowView>
      {marks.length ? (
        <View testID="ue-line-source-hint" style={{ gap: space[2] }}>
          <LineMarks marks={marks} lineId={l.id} />
          <T v="caption" tone="mut">
            {t("ue.src.hint")}
          </T>
        </View>
      ) : null}
      <TextField type="title" value={l.name} onChangeText={(v) => p.api.change(l.id, { name: v })} placeholder={t("ue.lineName")} label={t("ue.lineName")} field={f("name")} autoFocus={p.autoFocus === "name"} testID={`est-name-${l.id}`} />
      <TextField type="note" value={l.description ?? ""} onChangeText={(v) => p.api.change(l.id, { description: v || undefined })} placeholder={t("ue.lineDesc")} label={t("ue.lineDesc")} />
      <Segmented<LineGroup> full radio label={t("ue.type")} value={l.group} onChange={(g) => p.api.change(l.id, { group: g })} items={GROUPS.map((g) => ({ key: g, label: t(`ue.group.${g}` as DictKey) }))} testID={`est-kind-${l.id}`} />
      <RowView style={{ alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <NumberField kind="qty" label={t("ue.qty")} qty={String(l.quantity)} onChange={(q) => p.api.change(l.id, { quantity: q })} field={f("qty")} onBad={(b) => p.api.bad(l.id, "qty", b)} autoFocus={p.autoFocus === "qty"} selectOnFocus testID={`est-qty-${l.id}`} />
        </View>
        <View style={{ flex: 1 }}>
          <SelectField<string>
            label={t("ue.unit")}
            value={ownUnit ? OWN : l.unit}
            items={unitItems}
            onChange={(u) => (u === OWN ? setPickedOwn(true) : (setPickedOwn(false), p.api.change(l.id, { unit: u })))}
            testID={`est-unit-${l.id}`}
          />
        </View>
      </RowView>
      {ownUnit ? <TextField type="unit" value={l.unit} onChangeText={(v) => p.api.change(l.id, { unit: v })} placeholder="ea" label={t("est.row.unitOwn")} testID={`est-unit-own-${l.id}`} /> : null}
      <RowView style={{ alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <NumberField kind="money" label={t("est.row.price")} unitWord={t("est.row.dollars")} cents={l.unitPriceCents} onChange={(cents) => p.api.change(l.id, { unitPriceCents: cents })} field={f("price")} onBad={(b) => p.api.bad(l.id, "price", b)} testID={`est-price-${l.id}`} />
        </View>
        {p.costsVisible ? (
          <View style={{ flex: 1 }}>
            <NumberField kind="money" label={t("est.row.cost")} unitWord={t("est.row.dollars")} cents={l.unitCostCents} onChange={(cents) => p.api.change(l.id, { unitCostCents: cents })} onClear={() => p.api.change(l.id, { unitCostCents: undefined })} field={f("cost")} onBad={(b) => p.api.bad(l.id, "cost", b)} placeholder="" testID={`est-cost-${l.id}`} />
          </View>
        ) : null}
      </RowView>
      {figures ? (
        <View testID={`est-figures-${l.id}`} style={{ gap: space[1] }}>
          <T v="caption" tabular>
            {t("est.row.sum", { total: money(figures.total) })}
            {figures.profit !== null ? ` · ${t("est.row.profit", { profit: money(figures.profit) })}${figures.marginPct !== null ? ` · ${figures.marginPct} %` : ""}` : ""}
          </T>
          {figures.profit !== null && figures.profit < 0 ? (
            <View testID={`est-loss-${l.id}`}>
              <RowView gap={space[1]}>
                <Icon name="alert" s={size.iconSm} color={c.status.bad.text} />
                <T v="caption" tone="bad">
                  {t("est.row.loss")}
                </T>
              </RowView>
            </View>
          ) : null}
        </View>
      ) : null}
      <View>
        <Press onPress={() => setMore((m) => !m)} visibleHeight={size.rowMin} accessibilityRole="button" accessibilityState={{ expanded: more }} testID={`est-more-${l.id}`}>
          <RowView style={{ minHeight: size.rowMin }}>
            <T v="body" tone="mut" style={{ flex: 1 }}>
              {t("est.row.more")}
            </T>
            <Icon name="chevronDown" s={size.iconSm} color={c.mut} />
          </RowView>
        </Press>
        {more ? (
          <RowView style={{ minHeight: size.hitMin }}>
            <T v="body" style={{ flex: 1 }}>
              {t("ue.addon")}
            </T>
            <Toggle label={t("ue.addon")} on={!!l.optional} onChange={(on) => p.api.change(l.id, { optional: on })} />
          </RowView>
        ) : null}
      </View>
      <Menu visible={!!menu} anchor={menu} items={items} onSelect={(a) => p.api.action(l.id, a)} onClose={() => setMenu(null)} />
    </Animated.View>
  );
}

export const LineRow = memo(LineRowView);
