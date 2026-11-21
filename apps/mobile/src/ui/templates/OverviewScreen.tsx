/**
 * Шаблон «Обзор» (BUILD-PLAN §1 поток Г, DS §12.3): Главная, «Мой день» мастера.
 * Guarantees: a tab root — no «назад»; the header icons (search, the bell) · «＋» · «⋯» on the right, «⋯» the last; the next step
 * first (`next` — the NowCard with ONE main button in it, 40 the whole width); «Нужно внимание» — at most three rows, the rest behind
 * «Все ›»; the summary line; the rest folded (`details` in a Collapsible). The head: the icons row on top, the 30 title in one line
 * under it — or `greeting` (avatar · «Доброе утро» 17 · the date) on the left of the icons instead; `home` (default) — the company line.
 * `preview` — the showcase frame instead of the Screen.
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import { rhythm } from "@octo/design-tokens";
import { Collapsible } from "../collapsible";
import { GroupedList, ListGroup } from "../groupedList";
import { NowCard, type NowCardProps } from "../nowCard";
import { Screen } from "../surfaces";
import { SummaryLine, type SummaryItem } from "../summaryLine";
import { CreateButton, HeaderIcons, MoreButton, TemplateFrame } from "./parts";
import { attentionRows, templateLayout } from "./templateRules";
import type { CreateAction, IconAction, MoreAction } from "./types";

export interface OverviewScreenProps {
  /** the screen's name (the tests, VoiceOver, the tab); drawn as the 30 title only without `greeting` */
  title: string;
  /** the root header of a role's «Главная» (v2 «Корень вкладки»): the avatar on the left (→ «Ещё»), the date in the 13 line, «Доброе
   *  утро, Алекс» as the 30 title; folded — «Сегодня, 20 нояб.» (`mini`) */
  greeting?: { initials: string; text: string; date: string; mini?: string; onAvatar?: () => void; avatarLabel: string };
  /** a role's «Главная» (default): the company line «Компания ▾» and its «not loaded yet» under the head, the sync badge; `false` — not */
  home?: boolean;
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
  const g = p.greeting;
  const avatar = g ? (g.onAvatar ? { initials: g.initials, onPress: g.onAvatar, label: g.avatarLabel, testID: "home-profile" } : null) : undefined;
  const body = (
    // visual v2 «Поля и ритм»: between blocks 20
    <View style={{ gap: rhythm.blockGap }}>
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
        kind="root"
        title={g?.text ?? p.title}
        kicker={g?.date}
        avatar={avatar ?? undefined}
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
    <Screen
      testID={p.testID}
      title={g?.text ?? p.title}
      head={{ kind: "root", kicker: g?.date, mini: g?.mini, avatar }}
      home={p.home ?? true}
      headerIcons={p.headerIcons}
      right={tail}
    >
      {body}
    </Screen>
  );
}
