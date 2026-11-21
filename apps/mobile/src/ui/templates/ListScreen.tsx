/**
 * Шаблон «Список» (BUILD-PLAN §1 поток Г, BUILD-SPEC §1 GroupedList, DS §12.3): Клиенты, Сметы, Счета, Лиды, Задачи, Поиск.
 * Guarantees: a tab root or a section; search is an ICON of the header (the first one, `<testID>-search`) — a tap opens the field
 * under the title (it stays open while it holds text); the chips one strip that scrolls sideways (ChoiceChips layout="strip") — never
 * a second line; the other filters behind their own bar (`filters`, FilterBar); rows grouped (ListGroup / GroupRow 56), an empty group
 * is not drawn, an empty list is `empty` (one button); NO main button — making a new one is «＋» of the header; «⋯» the last.
 * `preview` — the showcase frame instead of the Screen.
 */
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { ChoiceChips, TextField } from "../controls";
import { GroupedList, GroupRow, ListGroup, type GroupRowProps } from "../groupedList";
import { Screen } from "../surfaces";
import { CreateButton, HeaderIcons, MoreButton, TemplateFrame } from "./parts";
import { shownGroups, templateLayout } from "./templateRules";
import type { CreateAction, IconAction, MoreAction } from "./types";

export interface ListScreenProps<T> {
  title: string;
  /** «Клиенты · 24» */
  count?: number;
  headerIcons?: IconAction[];
  create?: CreateAction;
  onCreate?: (key: string) => void;
  search: { placeholder: string; value: string; onChange: (s: string) => void };
  chips?: { items: { key: string; label: string }[]; value: string; onChange: (k: string) => void };
  /** the filter bar (FilterBar) under the chips */
  filters?: ReactNode;
  groups: { key: string; title?: string; rows: T[]; all?: { label: string; onPress: () => void } }[];
  /** a row of the list: GroupRow (56) — its `swipe` is also in its long press and VoiceOver actions */
  row: (t: T) => GroupRowProps & { key: string };
  more?: MoreAction;
  onMore?: (key: string) => void;
  /** nothing found / nothing yet: Empty with one button */
  empty: ReactNode;
  back?: () => void;
  preview?: boolean;
  testID: string;
}

export function ListScreen<T>(p: ListScreenProps<T>) {
  const { t } = useI18n();
  const [opened, setOpened] = useState(false);
  const searchOpen = opened || p.search.value !== "";
  const groups = shownGroups(p.groups);
  const layout = templateLayout("list", { back: !!p.back, icons: !!p.headerIcons?.length, create: !!p.create, more: !!p.more?.length, chips: !!p.chips, filters: !!p.filters, searchOpen, empty: groups.length === 0 });
  const title = p.count === undefined ? p.title : `${p.title} · ${p.count}`;
  const searchIcon: IconAction = { icon: "search", a11y: t("tpl.searchIn", { x: p.title }), onPress: () => setOpened((o) => !o || p.search.value !== ""), testID: `${p.testID}-search` };
  const icons = [searchIcon, ...(p.headerIcons ?? [])];
  const under = (
    <View style={{ gap: space[3] }}>
      {layout.under.includes("searchField") ? (
        <TextField testID={`${p.testID}-search-field`} type="search" icon="search" value={p.search.value} onChangeText={p.search.onChange} placeholder={p.search.placeholder} label={p.search.placeholder} autoFocus={opened} />
      ) : null}
      {layout.under.includes("chips") && p.chips ? <ChoiceChips layout="strip" testID={`${p.testID}-chips`} items={p.chips.items} value={p.chips.value} onChange={p.chips.onChange} /> : null}
      {layout.under.includes("filters") ? p.filters : null}
    </View>
  );
  const body = layout.body.includes("empty") ? (
    <View testID={`${p.testID}-empty`}>{p.empty}</View>
  ) : (
    <GroupedList testID={`${p.testID}-groups`}>
      {groups.map((g) => (
        <ListGroup key={g.key} title={g.title} all={g.all} testID={`${p.testID}-group-${g.key}`}>
          {g.rows.map((r) => {
            const { key, ...row } = p.row(r);
            return <GroupRow key={key} {...row} />;
          })}
        </ListGroup>
      ))}
    </GroupedList>
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
        title={title}
        back={p.back}
        right={
          <>
            <HeaderIcons icons={icons} />
            {tail}
          </>
        }
        under={under}
      >
        {body}
      </TemplateFrame>
    );
  return (
    <Screen testID={p.testID} title={title} back={p.back} headerIcons={icons} right={tail}>
      {under}
      {body}
    </Screen>
  );
}
