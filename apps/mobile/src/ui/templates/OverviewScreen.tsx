/**
 * Шаблон «Обзор» (BUILD-PLAN §1 поток Г, DS §12.3): Главная, «Мой день» мастера.
 * Guarantees: a tab root — no «назад»; the header icons (search, the bell) · «＋» · «⋯» on the right, «⋯» the last; the next step
 * first (`next` — the NowCard with ONE main button in it, 40 the whole width); «Нужно внимание» — at most three rows, the rest behind
 * «Все ›»; the summary line; the rest folded (`details` in a Collapsible). `preview` — the showcase frame instead of the Screen.
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { Collapsible } from "../collapsible";
import { GroupedList, ListGroup } from "../groupedList";
import { NowCard, type NowCardProps } from "../nowCard";
import { Screen } from "../surfaces";
import { SummaryLine, type SummaryItem } from "../summaryLine";
import { CreateButton, HeaderIcons, MoreButton, TemplateFrame } from "./parts";
import { attentionRows, templateLayout } from "./templateRules";
import type { CreateAction, IconAction, MoreAction } from "./types";

export interface OverviewScreenProps {
  title: string;
  headerIcons?: IconAction[];
  create?: CreateAction;
  onCreate?: (key: string) => void;
  more?: MoreAction;
  onMore?: (key: string) => void;
  /** «Сейчас / Дальше»: the NowCard with THE main step of the screen (its `main` — a button 40 the whole width, the reason under it) */
  next?: Omit<NowCardProps, "testID">;
  /** «Нужно внимание»: rows (GroupRow); only three are shown */
  attention?: { title: string; rows: ReactNode[]; all?: { label: string; onPress: () => void } };
  summary?: SummaryItem[];
  details?: { title: string; children: ReactNode };
  children?: ReactNode;
  preview?: boolean;
  testID: string;
}

export function OverviewScreen(p: OverviewScreenProps) {
  const layout = templateLayout("overview", {
    icons: !!p.headerIcons?.length,
    create: !!p.create,
    more: !!p.more?.length,
    main: p.next?.main,
    attention: !!p.attention?.rows.length,
    summary: !!p.summary?.length,
    details: !!p.details,
  });
  const att = attentionRows(p.attention?.rows ?? []);
  const body = (
    <View style={{ gap: space[6] }}>
      {p.next ? (
        <NowCard {...p.next} main={layout.body.includes("main") ? p.next.main : undefined} testID={`${p.testID}-next`} />
      ) : null}
      {layout.body.includes("attention") && p.attention ? (
        <GroupedList testID={`${p.testID}-attention`}>
          <ListGroup title={p.attention.title} all={att.more > 0 || p.attention.all ? p.attention.all : undefined}>
            {att.shown}
          </ListGroup>
        </GroupedList>
      ) : null}
      {layout.body.includes("summary") ? <SummaryLine testID={`${p.testID}-summary`} items={p.summary!} /> : null}
      {layout.body.includes("details") ? (
        <Collapsible testID={`${p.testID}-details`} title={p.details!.title}>
          {p.details!.children}
        </Collapsible>
      ) : null}
      {p.children}
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
      >
        {body}
      </TemplateFrame>
    );
  return (
    <Screen testID={p.testID} title={p.title} headerIcons={p.headerIcons} right={tail}>
      {body}
    </Screen>
  );
}
