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
import { Children, useState, type ReactNode } from "react";
import { StyleSheet, View, type AccessibilityActionEvent, type GestureResponderEvent } from "react-native";
import { component, radius, rhythm, size, space, type StatusName } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar, IconButton } from "./controls";
import { DoneCircle } from "./doneCircle";
import { Menu } from "./overlays";
import { Icon, Press, T, type IconKey } from "./primitives";
import { Card, RowView } from "./surfaces";
import { StatusPill } from "./statusPill";
import type { FigureCol } from "./figures";
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
export function ListGroup({ title, all, note, children, inset = component.listRow.inset, bare, testID }: {
  title?: string;
  /** visual v2 Деньги (макет 6): a plain word on the right of the title instead of «Все ›» («Оплачены сегодня   2») */
  note?: string;
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
      {title || all || note ? (
        // visual v2: the block's title 17/700 `ink`, «Все ›» 13/600 `mut` on its baseline; the title → the content 10
        <RowView style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <T v="heading" style={{ flex: 1 }} numberOfLines={1}>
            {title ?? ""}
          </T>
          {all ? (
            <Press onPress={all.onPress} visibleHeight={size.iconMd} accessibilityRole="link" accessibilityLabel={all.label} testID={all.testID}>
              <RowView gap={space[1]}>
                <T v="caption" w="semibold" tone="mut">
                  {all.label}
                </T>
                <Icon name="chevronRight" s={size.iconXs} color={c.mut} />
              </RowView>
            </Press>
          ) : note ? (
            <T v="caption" w="semibold" tone="mut" numberOfLines={1}>
              {note}
            </T>
          ) : null}
        </RowView>
      ) : null}
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
  /** visual v2 «цифры справа» (FigureRow): columns «word 12 / value 15» on the right instead of a bare `value` — «Срок −9 дн ·
   *  Сумма $1,840»; each but the last `figureRow.colW` wide, so the columns of a group stand under each other */
  cols?: FigureCol[];
  /** a StatusPill on the right */
  status?: { status: StatusName; label: string };
  /** small quick actions on the right (call, SMS): ≤ 2, the label names the object (П6) */
  actions?: IconAction[];
  /** the swipe (native): `left` — revealed by a swipe right, `right` — by a swipe left; the same on a long press and to VoiceOver */
  swipe?: { left?: SwipeAction[]; right?: SwipeAction[] };
  onPress?: () => void;
  /** a 40 row (`rowCompact`): small lists inside an object */
  compact?: boolean;
  /** 1280: the row whose record is open in the panel beside the list (`aria-current`, a tinted row; the focus returns to it, spec 06) */
  selected?: boolean;
  testID?: string;
}

export function GroupRow({ title, subtitle, lead, value, cols, status, actions = [], swipe, onPress, compact, selected, testID }: GroupRowProps) {
  const { c } = useTheme();
  const [down, setDown] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const more = rowActions(swipe);
  const said = rowSaid({ title, subtitle, value: cols?.length ? cols.map((x) => `${x.label} ${x.value}`).join(", ") : value, status, when: lead && "time" in lead ? [lead.time, lead.sub].filter(Boolean).join(" ") : undefined });
  const onLong = more.length ? (e: GestureResponderEvent) => setMenu({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, w: 0, h: 0 }) : undefined;
  const onAction = (e: AccessibilityActionEvent) => more.find((a) => a.key === e.nativeEvent.actionName)?.onPress();
  const check = lead && "done" in lead ? lead : null;
  const pad = { minHeight: compact ? component.rowCompact : component.listRow.h, paddingVertical: space[2], gap: space[3] };
  const main = (
    <RowView style={[pad, { paddingLeft: check ? 0 : space[4], paddingRight: actions.length ? 0 : space[4] }]}>
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
        <T v="body" w="semibold" tone={check?.done ? "mut" : "ink"} numberOfLines={1} style={check?.done ? { textDecorationLine: "line-through" } : undefined}>
          {title}
        </T>
        {subtitle ? (
          <T v="caption" tone="mut" numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {cols?.length
        ? cols.map((x, i, all) => (
            <View key={x.label} style={{ alignItems: "flex-end", width: i < all.length - 1 ? component.figureRow.colW : undefined }}>
              <T v="micro" tone="mut" numberOfLines={1}>
                {x.label}
              </T>
              <T v="body" w="bold" tabular tone={x.tone ?? "ink"} numberOfLines={1}>
                {x.value}
              </T>
            </View>
          ))
        : value ? (
            <T v="body" w="semibold" tabular numberOfLines={1}>
              {value}
            </T>
          ) : null}
      {status ? <StatusPill status={status.status} label={status.label} /> : null}
    </RowView>
  );
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
