/**
 * GroupedList / ListGroup / GroupRow (BUILD-SPEC §1 «GroupedList / ListRow 56»): grouped rows, as in iOS Contacts —
 * the prototype's lists (decision of the lead №21, 21.11: rule 12 «списки карточками» is waived for the prototype).
 * - ListGroup (visual v2): the title 17/700, on the right «Все ›» 13/600 `mut`; the group is a `surf` card, `radius.card`,
 *   hairlines `bd` inset by `listRow.inset` 64 (past the initials). An empty group is not drawn.
 * - GroupRow: from `listRow.h` 56 (compact — `rowCompact` 40): initials 36 or a type icon · the title 15 semibold and a line
 *   13 `mut` · on the right a sum 15, a StatusPill or small quick actions (36, the zone 44). Pressed — `surf2`.
 *   A swipe is the shared `SwipeRow`; the same actions are on a long press (a Menu) and in `accessibilityActions`
 *   (the web has no swipe — the long press and the screen reader keep them). Archive / delete give their own «Отменить» toast (rule 5).
 */
import { SelectedCheck } from "./selectedCheck";
import { Children, useState, type ReactNode } from "react";
import { StyleSheet, View, type AccessibilityActionEvent, type GestureResponderEvent } from "react-native";
import { component, radius, rhythm, size, space, spaceHalf, statusIcon, type StatusName } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar, IconButton } from "./controls";
import { DoneCircle } from "./doneCircle";
import { Menu } from "./overlays";
import { Icon, Press, T, type IconKey } from "./primitives";
import { Card, RowView } from "./surfaces";
import { StatusPill } from "./statusPill";
import { CountPill, type FigureCol } from "./figures";
import { SwipeRow, type SwipeAction } from "./swipeRow";
import type { IconAction } from "./templates/types";
import { rowActions, rowSaid } from "./groupedListLogic";

/** A column of groups, `rhythm.blockGap` 20 apart (visual v2 «Поля и ритм»). */
export function GroupedList({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View style={{ gap: rhythm.blockGap }} testID={testID}>
      {children}
    </View>
  );
}

/** the rows of a group, without the empty ones (`null`, `false`): an empty group is not drawn */
export function groupRows(children: ReactNode): ReactNode[] {
  return Children.toArray(children).filter(Boolean);
}

/** One group: its title (and «Все ›»), the rows in one card with inset hairlines between them. */
export function ListGroup({ title, count, all, children, inset = component.listRow.inset, bare, testID }: {
  title?: string;
  /** #2363 F08: the number of the group beside its title — the same CountPill as «Позиции 7» and «Выезды сегодня 6» */
  count?: number;
  /** visual v2 Главная (макет 1): the block's children stand as their own cards `rhythm.cardGap` 8 apart (tiles, FigureRows) — no
   *  card around them, no hairlines */
  bare?: boolean;
  /** «Все ›» on the right of the title: the whole list */
  all?: { label: string; onPress: () => void; testID?: string };
  children: ReactNode;
  /** where a hairline starts: past the lead (64); rows without a lead — `space[4]` */
  inset?: number;
  testID?: string;
}) {
  const { c } = useTheme();
  const rows = groupRows(children);
  if (!rows.length) return null;
  return (
    <View style={{ gap: rhythm.headGap }} testID={testID}>
      {title || all || count != null ? <GroupHead title={title ?? ""} count={count} countTestID={testID ? `${testID}-count` : undefined} all={all} /> : null}
      {bare ? (
        <View style={{ gap: rhythm.cardGap }}>{rows}</View>
      ) : (
      <Card style={{ padding: 0, gap: 0 }}>
        {rows.map((r, i) => (
          <View key={i}>
            {i ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.bd, marginLeft: inset }} /> : null}
            {r}
          </View>
        ))}
      </Card>
      )}
    </View>
  );
}

/**
 * The title of a group (visual v2 «Заголовок блока»): 17/700 `ink` and its CountPill 8 apart; on the right «Все ›», a figure
 * (`value` 17/700 tabular — an estimate group's sum) and quiet actions (`actions` — bare icons 36, the zone 44, in a column of their
 * own so a group's «⋯» stands over its rows' trash). `fold` makes the title a button that folds the group («˅»/«›» before the
 * word, `aria-expanded`). One title for every group of the app: Главная, Деньги, a client, an estimate's groups (#2387).
 */
export function GroupHead({ title, count, countTestID, all, icon, value, valueTestID, fold, actions, testID }: {
  title: string;
  count?: number;
  countTestID?: string;
  all?: { label: string; onPress: () => void; testID?: string };
  /** a kind's icon before the word (an estimate group: materials, labor, services) */
  icon?: IconKey;
  value?: string;
  valueTestID?: string;
  fold?: { open: boolean; onToggle: () => void; label: string; testID?: string };
  actions?: ReactNode;
  testID?: string;
}) {
  const { c } = useTheme();
  const words = (
    <RowView gap={space[2]} style={{ flex: 1, minWidth: 0 }}>
      {/* (the marks keep their size: only the title gives way) */}
      {fold ? <View style={{ flexShrink: 0 }}><Icon name={fold.open ? "chevronDown" : "chevronRight"} s={size.iconSm} color={c.mut} /></View> : null}
      {icon ? <View style={{ flexShrink: 0 }}><Icon name={icon} s={size.iconSm} color={c.mut} /></View> : null}
      {/* the title wraps (never «Материа…»: a narrow column of 820 holds the sum, «⋯» and «⠿» too) */}
      <T v="heading" style={{ flexShrink: 1 }} numberOfLines={2}>
        {title}
      </T>
      {count != null ? <CountPill n={count} testID={countTestID} /> : null}
    </RowView>
  );
  return (
    // (no gap after the figure: it ends where a row's figure ends — right before the actions' column, as the rows' sums before their trash)
    <View testID={testID}>
    <RowView gap={0} style={{ justifyContent: "space-between", alignItems: fold || actions ? "center" : "baseline", minHeight: fold || actions ? size.hitMin : undefined }}>
      {fold ? (
        <Press onPress={fold.onToggle} visibleHeight={size.hitMin} accessibilityRole="button" accessibilityLabel={fold.label} accessibilityState={{ expanded: fold.open }} testID={fold.testID} containerStyle={{ flex: 1, minWidth: 0 }}>
          {words}
        </Press>
      ) : (
        words
      )}
      {all ? (
        <Press onPress={all.onPress} visibleHeight={size.iconMd} accessibilityRole="link" accessibilityLabel={all.label} testID={all.testID} containerStyle={{ marginLeft: space[3] }}>
          <RowView gap={space[1]}>
            <T v="caption" w="semibold" tone="mut">
              {all.label}
            </T>
            <Icon name="chevronRight" s={size.iconXs} color={c.mut} />
          </RowView>
        </Press>
      ) : null}
      {value != null ? (
        <View testID={valueTestID} style={{ marginLeft: space[3], flexShrink: 0 }}>
          <T v="heading" tabular numberOfLines={1}>
            {value}
          </T>
        </View>
      ) : null}
      {actions}
    </RowView>
    </View>
  );
}

/**
 * The card edge of one row of a group whose rows are drawn one by one (an estimate's sortable lines: the drag needs each row on its
 * own): the `surf` ground and the card's corners on the first and the last row only — the rows join into ONE card, as ListGroup.
 */
export function useGroupEdge() {
  const { c } = useTheme();
  return (first: boolean, last: boolean) => ({
    backgroundColor: c.surf,
    ...(first ? { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card } : null),
    ...(last ? { borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card } : null),
  });
}

/** the inset hairline between two rows of a group (ListGroup draws its own; a group drawn row by row takes this one) */
export function GroupHairline({ inset = space[4] }: { inset?: number }) {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.bd, marginLeft: inset }} />;
}

/**
 * What leads a row: initials 36, a type icon 36, or the hour column (as in the Plan): `time` 17 semibold tabular («8:30») and under
 * it `sub` 12 `mut` («AM», «2 ч»), `listRow.timeW` wide so the hours of a group stand in one column.
 */
export type RowLead = { initials: string } | { icon: IconKey } | { time: string; sub?: string } | RowDone;
/**
 * A task's row: the DoneCircle 22 on the left (`done`, `onToggle`; `label` — what is read: «Сделано: Позвонить Смитам»). The circle is
 * the row's NEIGHBOUR, not inside its press (no button in a button); done — the title `mut` and struck through.
 */
export type RowDone = { done: boolean; onToggle: (done: boolean) => void; label: string; testID?: string };

export interface GroupRowProps {
  title: string;
  /** the line under the title: «работа · адрес · когда» */
  subtitle?: string;
  lead?: RowLead;
  /** a sum on the right (15, tabular) */
  value?: string;
  /** visual v2 «цифры справа» (FigureRow): columns «word 12 / value 15» on the right instead of a bare `value` — «Срок Просрочен 9 дн ·
   *  Сумма $1,840»; each but the last at least `figureRow.colW` wide (a floor, not a fixed width: a wide word «Просрочен 9 дн» widens its column, never overlaps the line — the subtitle shrinks and is cut with «…») */
  cols?: FigureCol[];
  /** a StatusPill on the right */
  status?: { status: StatusName; label: string; draft?: boolean };
  /** small quick actions on the right (call, SMS): ≤ 2, the label names the object (П6) */
  actions?: IconAction[];
  /** the swipe (native): `left` — revealed by a swipe right, `right` — by a swipe left; the same on a long press and to VoiceOver */
  swipe?: { left?: SwipeAction[]; right?: SwipeAction[] };
  onPress?: () => void;
  /** a 40 row (`rowCompact`): small lists inside an object */
  compact?: boolean;
  /** #2363 F21/F24: the title and the line may take 2 lines each (a note, «работа · мастер» beside a pill) — never cut mid-word on one line */
  wrap?: boolean;
  /** 1280: the row whose record is open in the panel beside the list (`aria-current`, a tinted row; the focus returns to it, spec 06) */
  selected?: boolean;
  /** «›» at the right end: the row opens something (an estimate's discount, tax, deposit) */
  chevron?: boolean;
  /** the testID of the figure on the right (the tests read it) */
  valueTestID?: string;
  /** the right side is a quiet mark (a document's language «EN»), not a figure: 13 `mut` */
  valueMark?: boolean;
  testID?: string;
}

/**
 * The inside of a GroupRow — the lead, the title 15/600 over its line 13 `mut`, the figure or columns, a StatusPill and «›» — for a
 * row whose press is its owner's (an estimate's line: it opens in place, it is held to be carried). One look for every row (#2387).
 */
export function GroupRowBody({ title, subtitle, lead, value, cols, status, compact, wrap, selected, chevron, quiet, valueMark, padRight = space[4], below, ids }: Pick<GroupRowProps, "title" | "subtitle" | "lead" | "value" | "cols" | "status" | "compact" | "wrap" | "selected" | "chevron" | "valueMark"> & {
  /** a row that counts for nothing now (a hidden line, a line on the client's choice): the title and the figure `mut` */
  quiet?: boolean;
  padRight?: number;
  /** under the line: the row's marks (chips) */
  below?: ReactNode;
  /** testIDs of the parts (the tests read them); `subtitleInner` — a second name of the line (an estimate's «по желанию клиента») */
  ids?: { title?: string; subtitle?: string; subtitleInner?: string; value?: string };
}) {
  const { c } = useTheme();
  const check = lead && "done" in lead ? lead : null;
  /** a column with a status word («Просрочен 9 дн», DS §3.3) is wide and never shrinks: the name takes a second line, the subtitle is cut first */
  const wordCol = !!cols?.some((x) => x.tone);
  const pad = { minHeight: compact ? component.rowCompact : component.listRow.h, paddingVertical: space[2], gap: space[3] };
  return (
    <RowView style={[pad, { paddingLeft: check ? 0 : space[4], paddingRight: padRight }]}>
      {selected ? <SelectedCheck left /> : null}
      {!lead || check ? null : "initials" in lead ? (
        <Avatar initials={lead.initials} s={component.avatar.md} />
      ) : "time" in lead ? (
        <View style={{ width: component.listRow.timeW }}>
          <T v="heading" tabular numberOfLines={1}>
            {lead.time}
          </T>
          {lead.sub ? (
            <T v="micro" tone="mut" numberOfLines={1}>
              {lead.sub}
            </T>
          ) : null}
        </View>
      ) : "icon" in lead ? (
        <View style={{ width: component.avatar.md, height: component.avatar.md, borderRadius: radius.pill, backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}>
          <Icon name={lead.icon} s={size.iconMd} color={c.ink} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View testID={ids?.title}>
          <T v="body" w="semibold" tone={check?.done || quiet ? "mut" : "ink"} numberOfLines={wrap || wordCol ? 2 : 1} style={check?.done ? { textDecorationLine: "line-through" } : undefined}>
            {title}
          </T>
        </View>
        {subtitle ? (
          <View testID={ids?.subtitle}>
            <View testID={ids?.subtitleInner}>
              <T v="caption" tone="mut" tabular numberOfLines={wrap ? 2 : 1}>
                {subtitle}
              </T>
            </View>
          </View>
        ) : null}
        {below}
      </View>
      {cols?.length
        ? cols.map((x, i, all) => (
            <View key={x.label} style={{ alignItems: "flex-end", flexShrink: 0, minWidth: i < all.length - 1 ? component.figureRow.colW : undefined }}>
              <T v="micro" tone="mut" numberOfLines={1}>
                {x.label}
              </T>
              {/* a value in a status tone («Просрочен 9 дн» overdue) carries its status icon — rule 2, never the colour alone (#2363 X01) */}
              <RowView gap={spaceHalf.tight}>
                {x.tone ? <Icon name={statusIcon[x.tone]} s={size.iconXs} color={c.status[x.tone].text} /> : null}
                <T v="body" w="bold" tabular tone={x.tone ?? "ink"} numberOfLines={1}>
                  {x.value}
                </T>
              </RowView>
            </View>
          ))
        : value && status ? (
            // #2992 (lists B, design/crm review 27.11): a sum and its status stand as ONE column on the right — the sum, under it the
            // status word with its icon (Jobber, Housecall Pro) — not side by side: the name keeps its room on 390
            <View testID={ids?.value} style={{ alignItems: "flex-end", flexShrink: 0, gap: spaceHalf.hair }}>
              <T v="body" w="semibold" tabular tone={quiet ? "mut" : "ink"} numberOfLines={1}>
                {value}
              </T>
              <StatusPill status={status.status} label={status.label} draft={status.draft} />
            </View>
          )
        : value ? (
            <View testID={ids?.value}>
              {valueMark ? (
                <T v="caption" tone="mut" numberOfLines={1}>
                  {value}
                </T>
              ) : (
                <T v="body" w="semibold" tabular tone={quiet ? "mut" : "ink"} numberOfLines={1}>
                  {value}
                </T>
              )}
            </View>
          ) : null}
      {status && !(value && !cols?.length) ? <StatusPill status={status.status} label={status.label} draft={status.draft} /> : null}
      {chevron ? <Icon name="chevronRight" s={size.iconSm} color={c.mut} /> : null}
    </RowView>
  );
}

export function GroupRow({ title, subtitle, lead, value, cols, status, actions = [], swipe, onPress, compact, wrap, selected, chevron, valueTestID, valueMark, testID }: GroupRowProps) {
  const { c } = useTheme();
  const [down, setDown] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const more = rowActions(swipe);
  const said = rowSaid({ title, subtitle, value: cols?.length ? cols.map((x) => `${x.label} ${x.value}`).join(", ") : value, status, when: lead && "time" in lead ? [lead.time, lead.sub].filter(Boolean).join(" ") : undefined });
  const onLong = more.length ? (e: GestureResponderEvent) => setMenu({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, w: 0, h: 0 }) : undefined;
  const onAction = (e: AccessibilityActionEvent) => more.find((a) => a.key === e.nativeEvent.actionName)?.onPress();
  const check = lead && "done" in lead ? lead : null;
  const main = <GroupRowBody title={title} subtitle={subtitle} lead={lead} value={value} cols={cols} status={status} compact={compact} wrap={wrap} selected={selected} chevron={chevron} padRight={actions.length ? 0 : space[4]} ids={valueTestID ? { value: valueTestID } : undefined} valueMark={valueMark} />;
  const tap = onPress || onLong ? (
    <Press
      onPress={onPress}
      onLongPress={onLong}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      accessibilityRole="button"
      accessibilityLabel={said}
      accessibilityActions={more.map((a) => ({ name: a.key, label: a.label }))}
      onAccessibilityAction={onAction}
      testID={testID}
      {...({ "aria-current": selected ? "true" : undefined } as object)}
      containerStyle={{ flex: 1, minWidth: 0 }}
    >
      {main}
    </Press>
  ) : (
    <View testID={testID} accessible accessibilityLabel={said} style={{ flex: 1, minWidth: 0 }}>
      {main}
    </View>
  );
  // the quick actions are the row's NEIGHBOURS, not its children: a button inside the row's button is not a thing on the web
  // («<button> cannot contain a nested <button>») nor to a screen reader — the row reads as one, each action as its own
  const row = (
    <RowView gap={0} style={{ backgroundColor: down || selected ? c.surf2 : c.surf }}>
      {check ? (
        <View style={{ paddingLeft: space[4], paddingRight: space[3] }}>
          <DoneCircle done={check.done} onChange={check.onToggle} label={check.label} testID={check.testID} />
        </View>
      ) : null}
      {tap}
      {actions.length ? (
        <RowView gap={space[1]} style={{ paddingLeft: space[3], paddingRight: space[4] }}>
          {actions.map((a) => (
            <IconButton key={a.testID} icon={a.icon} label={a.a11y} onPress={a.onPress} testID={a.testID} />
          ))}
        </RowView>
      ) : null}
    </RowView>
  );
  return (
    <>
      <SwipeRow left={swipe?.left} right={swipe?.right} round={0} testID={testID ? `${testID}-swipe` : undefined}>
        {row}
      </SwipeRow>
      {more.length ? (
        <Menu
          visible={!!menu}
          anchor={menu}
          items={more.map((a) => ({ key: a.key, label: a.label, icon: a.icon, destructive: a.tone === "bad", testID: a.testID ? `${a.testID}-menu` : undefined }))}
          onSelect={(k) => more.find((a) => a.key === k)?.onPress()}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}
