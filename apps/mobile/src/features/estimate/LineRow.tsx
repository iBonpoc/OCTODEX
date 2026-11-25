import { GroupRowBody } from "@/ui/groupedList";
import { memo, useEffect, useRef, useState, type ComponentRef } from "react";
import { Platform, View } from "react-native";
import Animated, { Easing, useReducedMotion, useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { component, motion, size, space, spaceHalf } from "@octo/design-tokens";
import type { CustomLine, LineGroup } from "@octo/estimating-engine";
import { useI18n, type DictKey } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { IconButton, StatusChip, TextField, Toggle } from "@/ui/controls";
import { Menu, type MenuItem } from "@/ui/overlays";
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
import { DashedFrame } from "@/ui/dashedFrame";
import { useRowHandle, useRowHead } from "@/features/SortableList";
import { swipes } from "./swipeState";
import { docMoney, rowQtyLine, rowSum } from "./rowLine";
import { dragEnd, longPressMenu } from "./rowGesture";
import { finePointer } from "@/ui/pointer";
import { kindWidth, openClip } from "./rowOpen";

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
  /** «Выше» / «Ниже» of «⋯» — the drag's stand-in (direction 20.11 §8: every gesture has one in «⋯») */
  shift?: (id: string, dir: -1 | 1) => void;
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
  /** visual v2 №5: the screen asks the folded row to open its menu (a finger's hold let go in place, SortableList onHoldStill);
   *  each new number opens it once */
  menuAsk?: number;
  /** #2424: `false` — the list draws the hidden line's dashed frame around the whole row with its «≡» (`SortableList rowFrame`) */
  frame?: boolean;
}

export const rowFieldId = (lineId: string, f: "name" | "qty" | "price" | "cost") => `est-${f}-${lineId}`;

function LineRowView(p: LineRowProps) {
  const { l, open } = { l: p.line, open: p.open };
  const { t } = useI18n();
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const [menu, setMenu] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // the list draws «≡» of this open line over the right end of its header (DS §8.3): the header keeps the place
  const handleInHeader = useRowHandle();
  const setHeadH = useRowHead();
  const rowRef = useRef<ComponentRef<typeof View>>(null);
  const openMenuAt = (r: React.RefObject<ComponentRef<typeof View> | null>) => r.current?.measureInWindow((x: number, y: number, w: number, h: number) => setMenu({ x, y, w, h }));
  useEffect(() => {
    if (p.menuAsk) openMenuAt(rowRef);
  }, [p.menuAsk]);
  const [more, setMore] = useState(false);
  // «Своя…»: the unit is written by hand — chosen so, or not one of the list (a catalog thing, a module, «Отменить»)
  const known = (UNITS as readonly string[]).includes(l.unit);
  const [pickedOwn, setPickedOwn] = useState(false);
  useEffect(() => {
    if (known) setPickedOwn(false);
  }, [known, l.unit]);
  // #2387 (design audit: «Ед. — „Св…“ и отдельное поле „flat“»): a unit written by hand stands IN the choice (the list holds it); the
  // field to write one shows only after «Своя…» is chosen (or while there is no unit at all)
  const ownUnit = pickedOwn || (!known && !l.unit);
  // the height of the row opens in `durBase` (reduced motion: at once)
  const grow = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    grow.value = reduce ? (open ? 1 : 0) : withTiming(open ? 1 : 0, { duration: motion.durBase, easing: Easing.out(Easing.cubic) });
  }, [open, reduce, grow]);
  // #2421/#2426: the fields come out by height under the line's face (not a fade) — see `openClip`
  const fieldsH = useSharedValue(0);
  const clip = useAnimatedStyle(() => openClip(grow.value, fieldsH.value));

  const marks = lineMarks(l);
  const figures = open ? rowFigures(l, p.costsVisible) : null;
  // one list of what can be done: the «⋯» menu, the swipe and the screen reader's actions all take it (DS Б13, Р2)
  const acts = rowActions(l, { locked: p.locked, noHide: p.noHide });
  const META: Record<RowAct, { label: string; icon: IconKey }> = {
    replace: { label: t("est.row.replace"), icon: "refresh" },
    duplicate: { label: t("est.row.duplicate"), icon: "copy" },
    hide: { label: t("est.row.hide"), icon: "eye" },
    show: { label: t("est.row.show"), icon: "eye" },
    move: { label: t("est.sec.moveTitle"), icon: "sections" },
    delete: { label: t("est.row.delete"), icon: "trash" },
  };
  // «Выше» / «Ниже» are the screen reader's actions only (a line the person may move — not a module's): in the menu they were two
  // more items (7 rows — «Удалить» out of the list's 6½, #2448) and «Переместить» opens the sheet that has both (#2450)
  const shifts: ("up" | "down")[] = acts.menu.includes("move") && p.api.shift ? ["up", "down"] : [];
  const items: MenuItem<RowAction>[] = [
    ...acts.menu.map((k) => ({ key: k, ...META[k], destructive: k === "delete", dim: k === "hide" && !canHide(l), testID: `est-act-${k}-${l.id}` })),
  ];
  const pick = (a: RowAction) => p.api.action(l.id, a);
  const swipeBtn = (k: RowAct): SwipeBtn => ({ key: k, ...META[k], tone: k === "delete" ? "bad" : undefined, dim: k === "hide" && !canHide(l), testID: `est-swipe-${k}-${l.id}` });
  const f = (id: "name" | "qty" | "price" | "cost") => p.form.field(rowFieldId(l.id, id));

  // the line's actions for the screen reader — the folded row and the open line's head take the same
  const a11yActs = [...shifts.map((k) => ({ name: k, label: t(k === "up" ? "est.sec.moveUp" : "est.sec.moveDown") })), ...acts.menu.map((k) => ({ name: k, label: META[k].label }))];
  const onA11yAct = (e: { nativeEvent: { actionName: string } }) => {
          const n = e.nativeEvent.actionName;
          if ((n === "up" || n === "down") && shifts.length) return p.api.shift?.(l.id, n === "up" ? -1 : 1);
          const a = actOfName(n, acts);
          if (a) p.api.action(l.id, a);
        };
  const web = Platform.OS === "web";
  const full = p.view === "full";
  const hidden = isHidden(l);
  const spend = hiddenSpend(l, { costsVisible: p.costsVisible, clientScreen: !!p.clientScreen });
  // the right side of a folded row: the line's sum ($0 for a hidden line — the client pays nothing for it); the hidden
  // line's «расход» goes under the name, by its mark, for who sees costs — the name keeps its width
  const right = hidden ? rowSum(0) : rowSum(p.total);
  const chipsOf = (withOptional: boolean) => (
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
            {t("est2.row.spend", { spend: docMoney(spend) })}
          </T>
        </View>
      ) : null}
      {withOptional && l.optional ? (
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
  const chips = chipsOf(true);
  // «Кратко»: the optional word is in the second line, not a chip under it
  const briefChips = chipsOf(false);
  const sum = (
    <View testID={`est-sum-${l.id}`}>
      <T v="body" w="semibold" tabular tone={hidden || l.optional ? "mut" : "ink"}>
        {right}
      </T>
    </View>
  );
  // the line's face: the folded row, and the head of the open one — the same tree, so nothing moves when it opens (#2421)
  const face = full ? (
          <View style={{ minHeight: size.rowMin, paddingVertical: space[2], paddingLeft: space[4], gap: space[1], justifyContent: "center" }}>
            <View testID={`est-title-${l.id}`}>
              <T v="body" w="semibold" tone={hidden ? "mut" : "ink"}>
                {l.name || t("est.row.unnamed")}
              </T>
            </View>
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
                  {rowPriceTimes(l, docMoney, shownQty)}
                </T>
              </View>
              {sum}
            </RowView>
            <RowView style={{ flexWrap: "wrap" }}>{chips}</RowView>
            <LineMarks marks={marks} lineId={l.id} />
          </View>
        ) : (
          // #2387: the folded line is a GroupRow's inside (one look with every list of the app): the name 15/600 over
          // «кол-во × цена» 13, the sum 15 on the right; a hidden or optional line reads `mut`; its marks under the line
          <GroupRowBody
            title={l.name || t("est.row.unnamed")}
            subtitle={[l.optional ? t("px3.est.optional") : null, rowQtyLine(l, shownQty)].filter(Boolean).join(" · ") || undefined}
            value={right}
            quiet={hidden || !!l.optional}
            wrap
            padRight={0}
            ids={{ title: `est-title-${l.id}`, subtitle: `est-times-${l.id}`, subtitleInner: l.optional ? `est-optional-${l.id}` : undefined, value: `est-sum-${l.id}` }}
            below={
              <>
                {hidden || noPrice(l) || p.unhiddenMark || p.checkPrice ? <RowView style={{ flexWrap: "wrap", marginTop: space[1] }}>{briefChips}</RowView> : null}
                <LineMarks marks={marks} lineId={l.id} />
              </>
            }
          />
        );
  if (!open) {
    const body = (
      <Press onPress={p.locked ? undefined : () => (swipes.justSwiped(motion.durSlow) || dragEnd.justDragged(motion.durSlow) || swipes.closeOpen() ? undefined : p.api.open(l.id))} onLongPress={items.length && longPressMenu(finePointer()) ? () => openMenuAt(rowRef) : undefined} accessibilityHint={items.length ? t("px3.est.lineActions") : undefined} disabled={p.locked} visibleHeight={size.rowMin} accessibilityRole="button" accessibilityLabel={l.name || t("est.row.unnamed")} accessibilityState={{ expanded: false }} accessibilityActions={a11yActs} onAccessibilityAction={onA11yAct} testID={`est-line-${l.id}`} containerStyle={{ flex: 1 }}>
        {face}
      </Press>
    );
    // the row's other actions are in «⋯» (and, on a phone, the swipe): no trash or buttons standing on every row (direction 20.11,
    // the founder's «простыня, на которой 44 кнопки»); «⋯» is the bare glyph, the handle «≡» the list draws after it
    // visual v2 №5 (#2344): no «⋯» and no «≡» on a folded row — its actions are the swipe (a phone), a hold let go in place (a
    // finger), a long press (a mouse) and the screen reader's actions; the open line has the same face on top (#2421)
    const row = (
      <View ref={rowRef} collapsable={false}>
        {hidden && p.frame !== false ? <DashedFrame testID={`est-hidden-frame-${l.id}`} /> : null}
        {/* founder 21.11 («5 открытых»: корзина в свёрнутой строке — оставить, всегда; DS §8.3 О8, #2374): the trash stands on the folded
            line too, a quiet icon in the column of the group's «⋯»; the delete gives the «Вернуть» toast (rule 5) */}
        <RowView gap={0}>
          {body}
          {p.locked ? null : (
            // founder 21.11 (#2387: «корзину — к драг-н-дропу, всё поравнял бы по краю»): the trash stands by the «⠿» at the right
            // edge, its zone 44 wide beside the handle's 44 (they meet, never overlap), `space[6]` away from the sum
            <View testID={`est-row-trash-${l.id}`} style={{ marginLeft: space[6], width: size.hitMin, alignItems: "center" }}>
              <IconButton bare icon="trash" label={t("est2.row.trash")} onPress={() => p.api.action(l.id, "delete")} />
            </View>
          )}
        </RowView>
        <Menu visible={!!menu} anchor={menu} items={items} onSelect={pick} onClose={() => setMenu(null)} />
      </View>
    );
    // the web has no swipe: the same actions are in «⋯» (DS Б13)
    if (web) return row;
    return (
      <SwipeRow left={acts.swipeRight.map(swipeBtn)} right={acts.swipeLeft.map(swipeBtn)} onAct={(k) => p.api.action(l.id, k as RowAct)} hint={p.swipeHint} onHintPlayed={p.onSwipeHintPlayed}>
        {row}
      </SwipeRow>
    );
  }
  const unitItems = [...UNITS, ...(l.unit && !(UNITS as readonly string[]).includes(l.unit) ? [l.unit] : [])].map((u) => ({ key: u as string, label: u }));
  unitItems.push({ key: OWN, label: t("est.row.unitOwn") });
  return (
    // #2421/#2426 (founder 23.11: «ничего мне не дёргается»; the accepted picture n10): the open line's head IS its folded face — the
    // name, «кол-во × цена» and the sum stay where they stood, the trash and «≡» in their column; no «˄ Свернуть» row. A tap on the
    // head folds the line; its actions (the folded row's «⋯») are a long press of the head (a finger too: an open line is dragged by
    // its «≡», not by a hold) and the screen reader's actions. The fields come out under it by height (`openClip`)
    <View testID={`est-line-${l.id}`} accessibilityState={{ expanded: true }} onTouchStart={p.onTouchOpen}>
      <View ref={rowRef} collapsable={false} onLayout={(e) => setHeadH?.(e.nativeEvent.layout.height)}>
        {isHidden(l) && p.frame !== false ? <DashedFrame testID={`est-hidden-frame-${l.id}`} /> : null}
        <RowView gap={0}>
          <View testID={`est-collapse-${l.id}`} style={{ flex: 1 }}>
            <Press onPress={p.api.close} onLongPress={items.length ? () => openMenuAt(rowRef) : undefined} visibleHeight={size.rowMin} accessibilityRole="button" accessibilityLabel={l.name || t("est.row.unnamed")} accessibilityHint={t("est.row.collapse")} accessibilityState={{ expanded: true }} accessibilityActions={a11yActs} onAccessibilityAction={onA11yAct} containerStyle={{ flex: 1 }}>
              {face}
            </Press>
          </View>
          {p.locked ? null : (
            <View testID={`est-trash-${l.id}`} style={{ marginLeft: space[6], width: size.hitMin, alignItems: "center" }}>
              <IconButton bare icon="trash" label={t("est2.row.trash")} onPress={() => p.api.action(l.id, "delete")} />
            </View>
          )}
          {/* the list draws «≡» of the open line over this place (a folded line has it in the list's own column beside the row) */}
          {handleInHeader ? <View style={{ width: size.hitMin }} /> : null}
        </RowView>
      </View>
      <Animated.View style={clip}>
        <View onLayout={(e) => { fieldsH.value = e.nativeEvent.layout.height; }} style={{ paddingTop: space[1], paddingBottom: space[3], paddingHorizontal: space[4], gap: space[3] }}>
      {marks.length ? (
        // the marks themselves stand in the head (the folded face, #2421) — here only the words under them
        <View testID="ue-line-source-hint">
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
          <NumberField kind="money" label={t("est.row.price")} unitWord={t("est.row.dollars")} cents={l.unitPriceCents} onChange={(cents) => p.api.change(l.id, { unitPriceCents: cents })} field={f("price")} onBad={(b) => p.api.bad(l.id, "price", b)} selectOnFocus testID={`est-price-${l.id}`} />
        </View>
      </RowView>
      {ownUnit ? <TextField type="unit" value={l.unit} onChangeText={(v) => p.api.change(l.id, { unit: v })} placeholder="ea" label={t("est.row.unitOwn")} testID={`est-unit-own-${l.id}`} /> : null}
      {/* «Вид» — a list, not segments (the founder: «это тоже должен быть селектор»); the cost — only for who sees costs */}
      {/* #2426: one grid with the row above — «Вид» under «Кол-во · Ед.», the cost under «Цена» (`kindWidth`) */}
      <RowView style={{ alignItems: "flex-start" }}>
        <View style={{ width: kindWidth() }}>
          <SelectField<LineGroup> labelAbove label={t("est2.row.kind")} value={l.group} items={GROUPS.map((g) => ({ key: g, label: t(`ue.group.${g}` as DictKey) }))} onChange={(g) => p.api.change(l.id, { group: g })} testID={`est-kind-${l.id}`} />
        </View>
        {p.costsVisible && !p.clientScreen ? (
          <View style={{ flex: 1 }}>
            <NumberField kind="money" label={t("est.row.cost")} unitWord={t("est.row.dollars")} cents={l.unitCostCents} onChange={(cents) => p.api.change(l.id, { unitCostCents: cents })} onClear={() => p.api.change(l.id, { unitCostCents: undefined })} field={f("cost")} onBad={(b) => p.api.bad(l.id, "cost", b)} placeholder="" selectOnFocus testID={`est-cost-${l.id}`} />
          </View>
        ) : null}
      </RowView>
      {figures ? (
        <View testID={`est-figures-${l.id}`} style={{ gap: space[1] }}>
          <T v="caption" tabular>
            {(() => {
              // a hidden line costs the client $0; «ваш расход» only for who sees costs (and a known cost)
              const spend = isHidden(l) ? hiddenSpend(l, { costsVisible: p.costsVisible, clientScreen: !!p.clientScreen }) : null;
              if (isHidden(l)) return spend !== null ? t("est2.row.sumSpend", { total: docMoney(0), spend: docMoney(spend) }) : t("est.row.sum", { total: docMoney(0) });
              return t("est.row.sum", { total: docMoney(figures.total) });
            })()}
            {!isHidden(l) && figures.profit !== null && !p.clientScreen ? ` · ${t("est.row.profit", { profit: docMoney(figures.profit) })}${figures.marginPct !== null ? ` · ${String(figures.marginPct).replace(/^-/, "−")} %` : ""}` : ""}
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
            {/* founder 23.11 (MAP §12 п.7): no switch «Скрыть от клиента» here — a line is hidden by the swipe and «⋯ → Скрыть от
                клиента» (a priced one: the item is pale, a press says «Скрыть можно позицию с ценой $0») */}
            {p.noHide ? (
              <T v="caption" tone="mut">
                {t("est.row.hideTpl")}
              </T>
            ) : null}
          </>
        ) : null}
      </View>
        </View>
      </Animated.View>
      <Menu visible={!!menu} anchor={menu} items={items} onSelect={pick} onClose={() => setMenu(null)} />
    </View>
  );
}

export const LineRow = memo(LineRowView);
