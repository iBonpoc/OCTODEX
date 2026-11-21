/**
 * Шаблон «Календарь» (BUILD-PLAN §1 поток Г, BUILD-SPEC §1 DayStrip, DS §12.3): План.
 * Guarantees: a tab root; the header icons · «＋» · «⋯» on the right, «⋯» the last; under the title the views (`views`: Segmented
 * «День / Неделя / Месяц»), the month «Ноябрь ⌄» — a button that opens the month calendar in place (MonthHead: «Сегодня», ‹ › by a
 * week, by a month in «Месяц») — and the DayStrip (pills 52, the picked one `acc` in the middle of the row, a dot = something in the
 * day; not drawn in «Месяц»: the grid is the days); then «Не назначено · N» with its one action, the day's rows (GroupRow) or `empty`
 * — or `body`, what the view draws itself (the Week, the Month, the board by person on 820/1280) — and «Без даты · N ›».
 * NO main button — a new entry is «＋».
 * `preview` — the showcase frame instead of the Screen.
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import type { DayKey } from "@/features/calendar";
import type { DayLoad } from "@/features/planFeed";
import { DayStrip, MonthHead } from "../dayStrip";
import { GroupedList, GroupRow, ListGroup } from "../groupedList";
import { Screen } from "../surfaces";
import { CreateButton, HeaderIcons, MoreButton, TemplateFrame } from "./parts";
import { templateLayout } from "./templateRules";
import type { CreateAction, IconAction, MoreAction } from "./types";

export interface CalendarScreenProps {
  title: string;
  headerIcons?: IconAction[];
  create?: CreateAction;
  onCreate?: (key: string) => void;
  more?: MoreAction;
  onMore?: (key: string) => void;
  /** «День / Неделя / Месяц» (Segmented) */
  views?: ReactNode;
  /** the view shown: «month» draws no strip and steps the month head by a month */
  view?: "day" | "week" | "month";
  /** what stands under the views and the strip — the filters (FilterBar) */
  filters?: ReactNode;
  days?: DayKey[];
  day: DayKey;
  onDay: (k: DayKey) => void;
  loads: Map<DayKey, DayLoad>;
  /** the day's title over its rows («Сегодня, 20 нояб.») */
  dayTitle?: string;
  /** «Не назначено · 2» — a row that opens the assigning */
  unassigned?: { label: string; onPress: () => void };
  /** the day's rows (GroupRow) */
  items: ReactNode[];
  empty: ReactNode;
  /** the view's own body instead of the day's rows: the Week, the Month, the board by person (820/1280) */
  body?: ReactNode;
  /** «Без даты · 3 ›» */
  undated?: { label: string; onPress: () => void };
  preview?: boolean;
  testID: string;
}

export function CalendarScreen(p: CalendarScreenProps) {
  const layout = templateLayout("calendar", {
    icons: !!p.headerIcons?.length,
    create: !!p.create,
    more: !!p.more?.length,
    views: !!p.views,
    unassigned: !!p.unassigned,
    undated: !!p.undated,
    empty: p.items.length === 0,
    monthView: p.view === "month",
    viewBody: p.body !== undefined && p.body !== null,
  });
  const under = (
    <View style={{ gap: space[3] }}>
      {layout.under.includes("views") ? p.views : null}
      {p.filters}
      <View style={{ gap: space[2] }}>
        <MonthHead testID={`${p.testID}-month`} date={p.day} onPick={p.onDay} step={p.view === "month" ? "month" : 7} />
        {layout.under.includes("days") ? <DayStrip testID={`${p.testID}-days`} head={false} days={p.days} date={p.day} loads={p.loads} onPick={p.onDay} /> : null}
      </View>
    </View>
  );
  const body = (
    <View style={{ gap: space[4] }}>
      {layout.body.includes("unassigned") && p.unassigned ? (
        <GroupedList testID={`${p.testID}-unassigned`}>
          <ListGroup inset={space[4]}>
            <GroupRow compact title={p.unassigned.label} lead={{ icon: "user" }} onPress={p.unassigned.onPress} />
          </ListGroup>
        </GroupedList>
      ) : null}
      {layout.body.includes("view") ? (
        <View testID={`${p.testID}-view`}>{p.body}</View>
      ) : layout.body.includes("empty") ? (
        <View testID={`${p.testID}-empty`}>{p.empty}</View>
      ) : (
        <GroupedList testID={`${p.testID}-items`}>
          <ListGroup title={p.dayTitle}>{p.items}</ListGroup>
        </GroupedList>
      )}
      {layout.body.includes("undated") && p.undated ? (
        <GroupedList testID={`${p.testID}-undated`}>
          <ListGroup inset={space[4]}>
            <GroupRow compact title={p.undated.label} lead={{ icon: "calendar" }} onPress={p.undated.onPress} />
          </ListGroup>
        </GroupedList>
      ) : null}
    </View>
  );
  const tail = (
    <>
      {p.create && p.onCreate ? <CreateButton create={p.create} onCreate={p.onCreate} testID={`${p.testID}-create`} /> : null}
      {p.more?.length && p.onMore ? <MoreButton items={p.more} onMore={p.onMore} testID={`${p.testID}-more`} /> : null}
    </>
  );
  if (p.preview)
    return (
      <TemplateFrame
        testID={p.testID}
        title={p.title}
        right={
          <>
            <HeaderIcons icons={p.headerIcons ?? []} />
            {tail}
          </>
        }
        under={under}
      >
        {body}
      </TemplateFrame>
    );
  return (
    <Screen testID={p.testID} title={p.title} headerIcons={p.headerIcons} right={tail}>
      {under}
      {body}
    </Screen>
  );
}
