import { memo, useEffect, useRef, useState, type ComponentRef } from "react";
import { Platform, View } from "react-native";
import Animated, { Easing, useReducedMotion, useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { component, motion, size, space } from "@octo/design-tokens";
import Svg, { Defs, Line, Pattern, Rect } from "react-native-svg";
import type { CustomLine, LineGroup } from "@octo/estimating-engine";
import { useI18n, type DictKey } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, IconButton, StatusChip, TextField, Toggle } from "@/ui/controls";
import { Menu, useToast, type MenuItem } from "@/ui/overlays";
import { ReadOnly } from "@/ui/readOnly";
import { NumberField } from "@/ui/numberField";
import { Icon, Press, T, type IconKey } from "@/ui/primitives";
import type { RequiredForm } from "@/ui/requiredForm";
import { SelectField } from "@/ui/selectField";
import { RowView } from "@/ui/surfaces";
import { shownQty, lineMarks } from "@/features/estimateDoc";
import { canHide, hiddenSpend, isHidden, noPrice, rowActions, rowFigures, rowPriceTimes, actOfName, type CatalogRefusal, type RowAct } from "@/features/estimateRows";
import type { RowView as RowLook } from "./rowView";
import { LineMarks } from "@/features/LineMarks";
import { SwipeRow, type SwipeBtn } from "./SwipeRow";
import { useRowHandle } from "@/features/SortableList";
import { swipes } from "./swipeState";

/**
 * A line of the estimate, in place (DS §8.3, spec 2026-11-12-estimate-editor §11.2.2): folded — «Кратко» (the name, the
 * sum, the trash) or «Подробно» (the name, the description, «$12.00 × 86 LF» and the sum, the marks); a tap opens it where
 * it stands (one open); open — «˄ Свернуть», the name and description, one row «Кол-во · Ед. · Цена», the kind and the cost,
 * the sum and the profit (for who sees costs), «Ещё». No profit, margin or cost on a folded row — ever; the one exception is
 * the «расход» of a hidden line, for who sees costs and not on «Экран для клиента». The screen decides who is open and when a
 * row closes; the row only draws and edits.
 */
export const UNITS = ["ea", "ft", "LF", "sq ft", "hr", "day", "lot"] as const;
const GROUPS: LineGroup[] = ["service", "labor", "material"];
/** the id of the choice «Своя…» in the unit list */
const OWN = "__own__";

export type RowAction = RowAct;

/** what the rows ask of the screen: ONE object with stable functions (the rows are memoised: a row redraws when its own data does) */
export interface RowApi {
  open: (id: string) => void;
  close: () => void;
  change: (id: string, patch: Partial<CustomLine>) => void;
  action: (id: string, a: RowAction) => void;
  /** a number field of the row holds text that is not a number (the line itself keeps the last right value) */
  bad: (id: string, field: "qty" | "price" | "cost", bad: boolean) => void;
  /** «Сохранить в каталог» on / off for the row */
  wantCatalog: (id: string, on: boolean) => void;
  /** «Открыть в каталоге ›» */
  openInCatalog: (id: string) => void;
  /** «›» in «Кол-во» of a line from a template: the next line from it opens, the cursor in its «Кол-во» (DS §8.13) */
  nextQty?: (id: string) => void;
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
  /** a line from a template with another after it: «›» (Enter on the web) in «Кол-во» goes to that line's «Кол-во» */
  qtyNext?: string;
  checkPrice?: boolean;
  /** a signed estimate: the row does not open (DS §8.3) */
  locked?: boolean;
  /** the template editor: a hidden line is not kept in a template yet (the server does not take it) — no «Скрыть» */
  noHide?: boolean;
  /** the open row's place in the catalog (not for the tech): in it already, or the choice to save it and what the engine says */
  catalog?: { linked: boolean; want: boolean; offer: "offered" | "later" | "refused"; reason?: CatalogRefusal };
  /** the estimate came from a template / a module with this line hidden and priced: it was shown again */
  unhiddenMark?: boolean;
  /** «Кратко» / «Подробно» — how a folded row looks (the device's choice) */
  view?: RowLook;
  /** «Экран для клиента» (DS §8.3): no cost, no profit, no «расход». The mode itself comes with #1307 part «г»; the row is ready */
  clientScreen?: boolean;
  /** a finger went down on the open row: a scroll that starts there does not close it (DS §8.3) */
  onTouchOpen?: () => void;
  /** the swipe hint of the first estimates plays on this row (DS §8.11): the screen gives it to the first line only */
  swipeHint?: boolean;
  onSwipeHintPlayed?: () => void;
}

/** the hidden line's hatch (DS §8.3): `track` stripes at 45°, `hairline` × 2 wide, a `space[2]` step — no status colour */
function Hatch({ color, id }: { color: string; /** one pattern id per row: two equal ids on a web page draw only the first */ id: string }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={`est-hatch-${id}`} patternUnits="userSpaceOnUse" width={space[2]} height={space[2]} patternTransform="rotate(45)">
            <Line x1={0} y1={0} x2={0} y2={space[2]} stroke={color} strokeWidth={component.hairline * 2} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#est-hatch-${id})`} />
      </Svg>
    </View>
  );
}

/** the trash on the row (DS §8.3): visible 36, the zone 44; `space[6]` from the handle «≡» that the list draws after it */
function Trash({ label, onPress, testID, gap = true }: { label: string; onPress: () => void; testID: string; /** the gap to «≡» — false where «⋯» stands between */ gap?: boolean }) {
  return (
    <View testID={testID} style={gap ? { marginRight: space[6] } : undefined}>
      <IconButton icon="trash" label={label} onPress={onPress} />
    </View>
  );
}

export const rowFieldId = (lineId: string, f: "name" | "qty" | "price" | "cost") => `est-${f}-${lineId}`;

function LineRowView(p: LineRowProps) {
  const { l, open } = { l: p.line, open: p.open };
  const { t, money } = useI18n();
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const toast = useToast();
  const [menu, setMenu] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const moreRef = useRef<ComponentRef<typeof View>>(null);
  // the list draws «≡» of this open line over the right end of its header (DS §8.3): the header keeps the place
  const handleInHeader = useRowHandle();
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
  // one list of what can be done: the «⋯» menu, the swipe and the screen reader's actions all take it (DS Б13, Р2)
  const acts = rowActions(l, { locked: p.locked, noHide: p.noHide });
  const META: Record<RowAct, { label: string; icon: IconKey }> = {
    replace: { label: t("est.row.replace"), icon: "refresh" },
    duplicate: { label: t("est.row.duplicate"), icon: "copy" },
    hide: { label: t("est.row.hide"), icon: "eye" },
    show: { label: t("est.row.show"), icon: "eye" },
    move: { label: t("est.sec.moveTitle"), icon: "route" },
    delete: { label: t("est.row.delete"), icon: "trash" },
  };
  const items: MenuItem<RowAction>[] = acts.menu.map((k) => ({ key: k, ...META[k], destructive: k === "delete", dim: k === "hide" && !canHide(l), testID: `est-act-${k}-${l.id}` }));
  const swipeBtn = (k: RowAct): SwipeBtn => ({ key: k, ...META[k], tone: k === "delete" ? "bad" : undefined, dim: k === "hide" && !canHide(l), testID: `est-swipe-${k}-${l.id}` });
  const f = (id: "name" | "qty" | "price" | "cost") => p.form.field(rowFieldId(l.id, id));

  if (!open) {
    const web = Platform.OS === "web";
    const full = p.view === "full";
    const hidden = isHidden(l);
    const spend = hiddenSpend(l, { costsVisible: p.costsVisible, clientScreen: !!p.clientScreen });
    // the right side of a folded row: the line's sum ($0 for a hidden line — the client pays nothing for it); the hidden
    // line's «расход» goes under the name, by its mark, for who sees costs — the name keeps its width
    const right = hidden ? money(0) : money(p.total);
    const chips = (
      <>
        {hidden ? (
          <View testID={`est-hidden-${l.id}`}>
            <RowView gap={space[1]}>
              <Icon name="eyeOff" s={size.iconSm} color={c.mut} />
              <T v="caption" tone="mut">
                {t("est.row.hidden")}
              </T>
            </RowView>
          </View>
        ) : null}
        {spend !== null ? (
          <View testID={`est-spend-${l.id}`}>
            <T v="caption" tone="mut" tabular>
              {t("est2.row.spend", { spend: money(spend) })}
            </T>
          </View>
        ) : null}
        {l.optional ? (
          <View testID={`est-optional-${l.id}`}>
            <RowView gap={space[1]}>
              <Icon name="plus" s={size.iconSm} color={c.mut} />
              <T v="caption" tone="mut">
                {t("ue.addon")}
              </T>
            </RowView>
          </View>
        ) : null}
        {noPrice(l) ? (
          <View testID={`est-noprice-${l.id}`}>
            <StatusChip status="warn" label={t("est2.row.noPrice")} />
          </View>
        ) : null}
        {p.unhiddenMark ? (
          <View testID={`est-unhidden-${l.id}`}>
            <StatusChip status="info" label={t("est.row.unhiddenMark")} />
          </View>
        ) : null}
        {p.checkPrice ? (
          <View testID={`est-checkprice-${l.id}`}>
            <StatusChip status="warn" label={t("est.tpl.checkLine")} />
          </View>
        ) : null}
      </>
    );
    const sum = (
      <View testID={`est-sum-${l.id}`}>
        <T v="body" w="semibold" tabular tone={hidden || l.optional ? "mut" : "ink"}>
          {right}
        </T>
      </View>
    );
    const body = (
      <Press onPress={p.locked ? undefined : () => (swipes.justSwiped(motion.durSlow) || swipes.closeOpen() ? undefined : p.api.open(l.id))} disabled={p.locked} visibleHeight={size.rowMin} accessibilityRole="button" accessibilityLabel={l.name || t("est.row.unnamed")} accessibilityState={{ expanded: false }} accessibilityActions={acts.menu.map((k) => ({ name: k, label: META[k].label }))} onAccessibilityAction={(e) => {
          const a = actOfName(e.nativeEvent.actionName, acts);
          if (a) p.api.action(l.id, a);
        }} testID={`est-line-${l.id}`} containerStyle={{ flex: 1 }}>
        <View style={{ minHeight: size.rowMin, paddingVertical: space[2], gap: space[1], justifyContent: "center" }}>
          {full ? (
            <>
              <T v="body" w="semibold" tone={hidden ? "mut" : "ink"} numberOfLines={2}>
                {l.name || t("est.row.unnamed")}
              </T>
              {l.description ? (
                <View testID={`est-desc-${l.id}`}>
                  <T v="caption" tone="mut" numberOfLines={2}>
                    {l.description}
                  </T>
                </View>
              ) : null}
              <RowView style={{ justifyContent: "space-between" }}>
                <View testID={`est-times-${l.id}`}>
                  <T v="caption" tone="mut" tabular numberOfLines={1}>
                    {rowPriceTimes(l, money, shownQty)}
                  </T>
                </View>
                {sum}
              </RowView>
              <RowView style={{ flexWrap: "wrap" }}>{chips}</RowView>
            </>
          ) : (
            <>
              <RowView gap={space[4]}>
                <T v="body" w="semibold" tone={hidden ? "mut" : "ink"} numberOfLines={1} style={{ flex: 1 }}>
                  {l.name || t("est.row.unnamed")}
                </T>
                {sum}
              </RowView>
              {hidden || l.optional || noPrice(l) || p.unhiddenMark || p.checkPrice ? <RowView style={{ flexWrap: "wrap" }}>{chips}</RowView> : null}
            </>
          )}
          <LineMarks marks={marks} lineId={l.id} />
        </View>
      </Press>
    );
    const trash = p.locked || !acts.menu.includes("delete") ? null : <Trash label={t("est2.row.trash")} onPress={() => p.api.action(l.id, "delete")} testID={`est-trash-${l.id}`} />;
    const row = (inner: React.ReactNode) => (
      <View>
        {hidden ? <Hatch color={c.track} id={l.id} /> : null}
        <RowView style={{ alignItems: full ? "flex-start" : "center" }}>
          {inner}
          {trash}
        </RowView>
      </View>
    );
    if (web) {
      // the web has no swipe: the same actions are in «⋯» (DS Б13), next to the row
      return acts.menu.length
        ? row(
            <>
              {body}
              <View ref={moreRef} collapsable={false}>
                <View testID={`est-menu-${l.id}`}>
                  <IconButton icon="more" label={t("est.row.actions")} onPress={() => moreRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setMenu({ x, y, w, h }))} />
                </View>
              </View>
              <Menu visible={!!menu} anchor={menu} items={items} onSelect={(a) => p.api.action(l.id, a)} onClose={() => setMenu(null)} />
            </>,
          )
        : row(body);
    }
    return (
      <SwipeRow left={acts.swipeRight.map(swipeBtn)} right={acts.swipeLeft.map(swipeBtn)} onAct={(k) => p.api.action(l.id, k as RowAct)} hint={p.swipeHint} onHintPlayed={p.onSwipeHintPlayed}>
        {row(body)}
      </SwipeRow>
    );
  }
  const unitItems = [...UNITS, ...(l.unit && !(UNITS as readonly string[]).includes(l.unit) ? [l.unit] : [])].map((u) => ({ key: u as string, label: u }));
  unitItems.push({ key: OWN, label: t("est.row.unitOwn") });
  return (
    <Animated.View style={[{ paddingVertical: space[3], gap: space[3] }, fade]} testID={`est-line-${l.id}`} accessibilityState={{ expanded: true }} onTouchStart={p.onTouchOpen}>
      {/* the header (DS §8.3): «˄ Свернуть» on the left (the founder's words); on the right the trash, «⋯» and «≡» (the list's handle) */}
      <RowView style={{ justifyContent: "space-between" }}>
        <View testID={`est-collapse-${l.id}`}>
          <Button label={t("est.row.collapse")} icon="chevronUp" variant="ghost" size="sm" onPress={p.api.close} />
        </View>
        <RowView>
          {p.locked ? null : <Trash gap={false} label={t("est2.row.trash")} onPress={() => p.api.action(l.id, "delete")} testID={`est-trash-${l.id}`} />}
          <View ref={moreRef} collapsable={false} style={{ marginRight: space[6] }}>
            <View testID={`est-menu-${l.id}`}>
              <IconButton icon="more" label={t("est.row.actions")} onPress={() => moreRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setMenu({ x, y, w, h }))} />
            </View>
          </View>
          {handleInHeader ? <View style={{ width: size.hitMin }} /> : null}
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
      <TextField type="note" rows={1} value={l.description ?? ""} onChangeText={(v) => p.api.change(l.id, { description: v || undefined })} placeholder={t("est2.row.descHint")} label={t("ue.lineDesc")} />
      {/* one row «Кол-во · Ед. · Цена за ед.» (the founder: «в одной строке», narrow fields) */}
      <RowView style={{ alignItems: "flex-start" }}>
        <View style={{ width: component.estRow.qty }}>
          <NumberField kind="qty" label={t("ue.qty")} qty={String(l.quantity)} onChange={(q) => p.api.change(l.id, { quantity: q })} field={f("qty")} onBad={(b) => p.api.bad(l.id, "qty", b)} autoFocus={p.autoFocus === "qty"} selectOnFocus onNext={p.qtyNext ? () => p.api.nextQty?.(p.qtyNext!) : undefined} testID={`est-qty-${l.id}`} />
        </View>
        <View style={{ width: component.estRow.unit }}>
          <SelectField<string>
            labelAbove
            label={t("ue.unit")}
            value={ownUnit ? OWN : l.unit}
            items={unitItems}
            onChange={(u) => (u === OWN ? setPickedOwn(true) : (setPickedOwn(false), p.api.change(l.id, { unit: u })))}
            testID={`est-unit-${l.id}`}
          />
        </View>
        <View style={{ flex: 1 }}>
          <NumberField kind="money" label={t("est.row.price")} unitWord={t("est.row.dollars")} cents={l.unitPriceCents} onChange={(cents) => p.api.change(l.id, { unitPriceCents: cents })} field={f("price")} onBad={(b) => p.api.bad(l.id, "price", b)} testID={`est-price-${l.id}`} />
        </View>
      </RowView>
      {ownUnit ? <TextField type="unit" value={l.unit} onChangeText={(v) => p.api.change(l.id, { unit: v })} placeholder="ea" label={t("est.row.unitOwn")} testID={`est-unit-own-${l.id}`} /> : null}
      {/* «Вид» — a list, not segments (the founder: «это тоже должен быть селектор»); the cost — only for who sees costs */}
      <RowView style={{ alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <SelectField<LineGroup> labelAbove label={t("est2.row.kind")} value={l.group} items={GROUPS.map((g) => ({ key: g, label: t(`ue.group.${g}` as DictKey) }))} onChange={(g) => p.api.change(l.id, { group: g })} testID={`est-kind-${l.id}`} />
        </View>
        {p.costsVisible && !p.clientScreen ? (
          <View style={{ flex: 1 }}>
            <NumberField kind="money" label={t("est.row.cost")} unitWord={t("est.row.dollars")} cents={l.unitCostCents} onChange={(cents) => p.api.change(l.id, { unitCostCents: cents })} onClear={() => p.api.change(l.id, { unitCostCents: undefined })} field={f("cost")} onBad={(b) => p.api.bad(l.id, "cost", b)} placeholder="" testID={`est-cost-${l.id}`} />
          </View>
        ) : null}
      </RowView>
      {figures ? (
        <View testID={`est-figures-${l.id}`} style={{ gap: space[1] }}>
          <T v="caption" tabular>
            {(() => {
              // a hidden line costs the client $0; «ваш расход» only for who sees costs (and a known cost)
              const spend = isHidden(l) ? hiddenSpend(l, { costsVisible: p.costsVisible, clientScreen: !!p.clientScreen }) : null;
              if (isHidden(l)) return spend !== null ? t("est2.row.sumSpend", { total: money(0), spend: money(spend) }) : t("est.row.sum", { total: money(0) });
              return t("est.row.sum", { total: money(figures.total) });
            })()}
            {!isHidden(l) && figures.profit !== null && !p.clientScreen ? ` · ${t("est.row.profit", { profit: money(figures.profit) })}${figures.marginPct !== null ? ` · ${figures.marginPct} %` : ""}` : ""}
            {l.optional ? ` · ${t("est2.row.optionalNote")}` : ""}
          </T>
          {!isHidden(l) && !p.clientScreen && figures.profit !== null && figures.profit < 0 ? (
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
      {p.catalog ? (
        p.catalog.linked ? (
          <View testID={`est-open-catalog-${l.id}`}>
            <Press onPress={() => p.api.openInCatalog(l.id)} visibleHeight={size.rowMin} accessibilityRole="link">
              <RowView style={{ minHeight: size.rowMin }}>
                <T v="body" style={{ flex: 1 }}>
                  {t("est.row.openInCatalog")}
                </T>
                <Icon name="chevronRight" s={size.iconSm} color={c.mut} />
              </RowView>
            </Press>
          </View>
        ) : (
          <View testID={`est-save-catalog-${l.id}`} style={{ gap: space[1] }}>
            <RowView style={{ minHeight: size.hitMin }}>
              <T v="body" tone={p.catalog.offer === "refused" ? "mut" : "ink"} style={{ flex: 1 }}>
                {t("est.row.saveCatalog")}
              </T>
              <Toggle label={t("est.row.saveCatalog")} on={p.catalog.want && p.catalog.offer !== "refused"} onChange={(on) => p.catalog?.offer !== "refused" && p.api.wantCatalog(l.id, on)} />
            </RowView>
            {p.catalog.offer === "refused" && p.catalog.reason ? (
              <T v="caption" tone="mut">
                {t(`est.row.refuse.${p.catalog.reason}` as DictKey)}
              </T>
            ) : p.catalog.want && p.catalog.offer === "later" ? (
              <T v="caption" tone="mut">
                {t("est.row.catalogNeed")}
              </T>
            ) : null}
          </View>
        )
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
          <>
            <View testID={`est-optional-toggle-${l.id}`}>
              <RowView style={{ minHeight: size.hitMin }}>
                <T v="body" style={{ flex: 1 }}>
                  {t("ue.addon")}
                </T>
                <Toggle label={t("ue.addon")} on={!!l.optional} onChange={(on) => p.api.change(l.id, { optional: on })} />
              </RowView>
            </View>
            {p.noHide ? (
              <T v="caption" tone="mut">
                {t("est.row.hideTpl")}
              </T>
            ) : (
              <View testID={`est-hide-${l.id}`}>
                <RowView style={{ minHeight: size.hitMin }}>
                  <T v="body" tone={isHidden(l) || canHide(l) ? "ink" : "mut"} style={{ flex: 1 }}>
                    {t("est.row.hide")}
                  </T>
                  {isHidden(l) || canHide(l) ? (
                    <Toggle label={t("est.row.hide")} on={isHidden(l)} onChange={(on) => p.api.change(l.id, { clientVisible: on ? false : undefined })} />
                  ) : (
                    // a price on the line: the switch is pale and does not turn; a press says why (DS §8.3, Б13)
                    <Press onPress={() => toast.show(t("est.row.hideNeedZero"))} visibleHeight={size.hitMin} accessibilityRole="button" accessibilityLabel={`${t("est.row.hide")}. ${t("est.row.hideNeedZero")}`} testID={`est-hide-why-${l.id}`}>
                      <ReadOnly value>
                        <Toggle label={t("est.row.hide")} on={false} onChange={() => {}} />
                      </ReadOnly>
                    </Press>
                  )}
                </RowView>
              </View>
            )}
          </>
        ) : null}
      </View>
      <Menu visible={!!menu} anchor={menu} items={items} onSelect={(a) => p.api.action(l.id, a)} onClose={() => setMenu(null)} />
    </Animated.View>
  );
}

export const LineRow = memo(LineRowView);
