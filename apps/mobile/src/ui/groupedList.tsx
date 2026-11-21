/**
 * GroupedList / ListGroup / GroupRow (BUILD-SPEC §1 «GroupedList / ListRow 56»): grouped rows, as in iOS Contacts —
 * the prototype's lists (decision of the lead №21, 21.11: rule 12 «списки карточками» is waived for the prototype).
 * - ListGroup: the title 12 in capitals `mut`, on the right «Все ›» `accText`; the group is a `surf` card, `radius.card`,
 *   hairlines `bd` inset by `listRow.inset` 64 (past the initials). An empty group is not drawn.
 * - GroupRow: from `listRow.h` 56 (compact — `rowCompact` 40): initials 36 or a type icon · the title 15 semibold and a line
 *   13 `mut` · on the right a sum 15, a StatusPill or small quick actions (36, the zone 44). Pressed — `surf2`.
 *   A swipe is the shared `SwipeRow`; the same actions are on a long press (a Menu) and in `accessibilityActions`
 *   (the web has no swipe — the long press and the screen reader keep them). Archive / delete give their own «Отменить» toast (rule 5).
 */
import { Children, useState, type ReactNode } from "react";
import { StyleSheet, View, type AccessibilityActionEvent, type GestureResponderEvent } from "react-native";
import { component, radius, size, space, type StatusName } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar, IconButton } from "./controls";
import { Menu } from "./overlays";
import { Icon, Press, T, type IconKey } from "./primitives";
import { Card, RowView } from "./surfaces";
import { StatusPill } from "./statusPill";
import { SwipeRow, type SwipeAction } from "./swipeRow";
import type { IconAction } from "./templates/types";
import { rowActions, rowSaid } from "./groupedListLogic";

/** A column of groups, `space[6]` apart. */
export function GroupedList({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View style={{ gap: space[6] }} testID={testID}>
      {children}
    </View>
  );
}

/** the rows of a group, without the empty ones (`null`, `false`): an empty group is not drawn */
export function groupRows(children: ReactNode): ReactNode[] {
  return Children.toArray(children).filter(Boolean);
}

/** One group: its title (and «Все ›»), the rows in one card with inset hairlines between them. */
export function ListGroup({ title, all, children, inset = component.listRow.inset, testID }: {
  title?: string;
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
    <View style={{ gap: space[2] }} testID={testID}>
      {title || all ? (
        <RowView style={{ justifyContent: "space-between", paddingHorizontal: space[1] }}>
          <T v="micro" w="semibold" tone="mut" style={{ flex: 1, textTransform: "uppercase" }} numberOfLines={1}>
            {title ?? ""}
          </T>
          {all ? (
            <Press onPress={all.onPress} visibleHeight={size.iconMd} accessibilityRole="link" accessibilityLabel={all.label} testID={all.testID}>
              <RowView gap={space[1]}>
                <T v="caption" w="semibold" style={{ color: c.accText }}>
                  {all.label}
                </T>
                <Icon name="chevronRight" s={size.iconXs} color={c.accText} />
              </RowView>
            </Press>
          ) : null}
        </RowView>
      ) : null}
      <Card style={{ padding: 0, gap: 0 }}>
        {rows.map((r, i) => (
          <View key={i}>
            {i ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.bd, marginLeft: inset }} /> : null}
            {r}
          </View>
        ))}
      </Card>
    </View>
  );
}

export type RowLead = { initials: string } | { icon: IconKey };

export interface GroupRowProps {
  title: string;
  /** the line under the title: «работа · адрес · когда» */
  subtitle?: string;
  lead?: RowLead;
  /** a sum on the right (15, tabular) */
  value?: string;
  /** a StatusPill on the right */
  status?: { status: StatusName; label: string };
  /** small quick actions on the right (call, SMS): ≤ 2, the label names the object (П6) */
  actions?: IconAction[];
  /** the swipe (native): `left` — revealed by a swipe right, `right` — by a swipe left; the same on a long press and to VoiceOver */
  swipe?: { left?: SwipeAction[]; right?: SwipeAction[] };
  onPress?: () => void;
  /** a 40 row (`rowCompact`): small lists inside an object */
  compact?: boolean;
  testID?: string;
}

export function GroupRow({ title, subtitle, lead, value, status, actions = [], swipe, onPress, compact, testID }: GroupRowProps) {
  const { c } = useTheme();
  const [down, setDown] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const more = rowActions(swipe);
  const said = rowSaid({ title, subtitle, value, status });
  const onLong = more.length ? (e: GestureResponderEvent) => setMenu({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, w: 0, h: 0 }) : undefined;
  const onAction = (e: AccessibilityActionEvent) => more.find((a) => a.key === e.nativeEvent.actionName)?.onPress();
  const body = (
    <View style={{ backgroundColor: down ? c.surf2 : c.surf }}>
      <RowView style={{ minHeight: compact ? component.rowCompact : component.listRow.h, paddingHorizontal: space[4], paddingVertical: space[2], gap: space[3] }}>
        {lead ? "initials" in lead ? (
          <Avatar initials={lead.initials} s={component.avatar.md} />
        ) : (
          <View style={{ width: component.avatar.md, height: component.avatar.md, borderRadius: radius.pill, backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}>
            <Icon name={lead.icon} s={size.iconMd} color={c.ink} />
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="body" w="semibold" numberOfLines={1}>
            {title}
          </T>
          {subtitle ? (
            <T v="caption" tone="mut" numberOfLines={1}>
              {subtitle}
            </T>
          ) : null}
        </View>
        {value ? (
          <T v="body" w="semibold" tabular numberOfLines={1}>
            {value}
          </T>
        ) : null}
        {status ? <StatusPill status={status.status} label={status.label} /> : null}
        {actions.length ? (
          <RowView gap={space[1]}>
            {actions.map((a) => (
              <IconButton key={a.testID} icon={a.icon} label={a.a11y} onPress={a.onPress} testID={a.testID} />
            ))}
          </RowView>
        ) : null}
      </RowView>
    </View>
  );
  const row = onPress || onLong ? (
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
    >
      {body}
    </Press>
  ) : (
    <View testID={testID} accessible accessibilityLabel={said}>
      {body}
    </View>
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
