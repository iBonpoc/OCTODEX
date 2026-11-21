/**
 * Шаблон «Календарь» (BUILD-PLAN §1 поток Г, BUILD-SPEC §1 DayStrip, DS §12.3): План.
 * Guarantees: a tab root; the header icons · «＋» · «⋯» on the right, «⋯» the last; under the title the views (`views`: Segmented
 * «День / Неделя / Месяц») and the DayStrip (7 pills 52, the picked one `acc`, a dot = something in the day); then «Не назначено · N»
 * with its one action, the day's rows (GroupRow) or `empty`, and «Без даты · N ›». NO main button — a new entry is «＋».
 * `preview` — the showcase frame instead of the Screen.
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import type { DayKey } from "@/features/calendar";
import type { DayLoad } from "@/features/planFeed";
import { DayStrip } from "../dayStrip";
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
  });
  const under = (
    <View style={{ gap: space[3] }}>
      {layout.under.includes("views") ? p.views : null}
      <DayStrip testID={`${p.testID}-days`} days={p.days} date={p.day} loads={p.loads} onPick={p.onDay} />
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
      {layout.body.includes("empty") ? (
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
