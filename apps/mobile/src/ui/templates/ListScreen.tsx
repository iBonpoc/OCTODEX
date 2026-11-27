/**
 * Шаблон «Список» (BUILD-PLAN §1 поток Г, BUILD-SPEC §1 GroupedList, DS §12.3): Клиенты, Сметы, Счета, Лиды, Задачи, Поиск.
 * Guarantees: a tab root or a section; search is an ICON of the header (the first one, `<testID>-search`) — a tap opens the field
 * under the title (it stays open while it holds text); the chips one strip that scrolls sideways (ChoiceChips layout="strip") — never
 * a second line; the other filters behind their own bar (`filters`, FilterBar); rows grouped (ListGroup / GroupRow 56), an empty group
 * is not drawn, an empty list is `empty` (one button); NO main button — making a new one is «＋» of the header; «⋯» the last.
 * `aside` — the open record beside the list on 1280 (ListPanel, spec 06 «Панель 1280»): drawn only on a desktop width, where the list
 * keeps its own scroll and the panel stands on the right; on 390/820 the record opens as its own screen and `aside` is not drawn.
 * `preview` — the showcase frame instead of the Screen.
 */
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { component, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useDevice } from "@/theme/ThemeProvider";
import { ChoiceChips, Segmented, TextField } from "../controls";
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
  /** `open` — the field always stands open under the title, focused on entry (the Search screen); then no search icon in the header */
  search: { placeholder: string; value: string; onChange: (s: string) => void; open?: boolean };
  chips?: { items: { key: string; label: string }[]; value: string; onChange: (k: string) => void };
  /** visual v2: the parts of a tab («Сметы · Счета · Оплаты» of «Деньги») — a Segmented 36 across the width, not a chips strip;
   *  for a few parts that always fit (≤ 3) — a long list of filters stays chips */
  chipsAs?: "segment";
  /** the filter bar (FilterBar) under the chips */
  filters?: ReactNode;
  groups: { key: string; title?: string; rows: T[]; all?: { label: string; onPress: () => void } }[];
  /** a row of the list: GroupRow (56) — its `swipe` is also in its long press and VoiceOver actions */
  row: (t: T) => GroupRowProps & { key: string };
  more?: MoreAction;
  onMore?: (key: string) => void;
  /** 1280: the open record beside the list (ListPanel); not drawn below the desktop width */
  aside?: ReactNode;
  /** nothing found / nothing yet: Empty with one button */
  empty: ReactNode;
  back?: () => void;
  preview?: boolean;
  testID: string;
  /** founder 27.11 (#3017, the stand: «Клиенты», «Лиды»): each row its own card, not the rows of one card */
  separate?: boolean;
}

export function ListScreen<T>(p: ListScreenProps<T>) {
  const { t } = useI18n();
  const { device } = useDevice();
  const aside = device === "desktop" && p.aside ? p.aside : undefined;
  const [opened, setOpened] = useState(false);
  const always = !!p.search.open;
  const searchOpen = always || opened || p.search.value !== "";
  const groups = shownGroups(p.groups);
  const layout = templateLayout("list", { back: !!p.back, icons: !!p.headerIcons?.length, create: !!p.create, more: !!p.more?.length, chips: !!p.chips, filters: !!p.filters, searchOpen, empty: groups.length === 0 });
  const title = p.count === undefined ? p.title : `${p.title} · ${p.count}`;
  const searchIcon: IconAction = { icon: "search", a11y: t("tpl.searchIn", { x: p.title }), onPress: () => setOpened((o) => !o || p.search.value !== ""), testID: `${p.testID}-search` };
  const icons = always ? (p.headerIcons ?? []) : [searchIcon, ...(p.headerIcons ?? [])];
  const chips =
    layout.under.includes("chips") && p.chips ? (
      p.chipsAs === "segment" ? (
        // not wider than a form column on 820/1280 (three words stretched over 1176 read as one)
        <View style={{ maxWidth: component.sheetFormMax, width: "100%" }}>
          <Segmented full equal testID={`${p.testID}-chips`} items={p.chips.items} value={p.chips.value} onChange={p.chips.onChange} />
        </View>
      ) : (
        <ChoiceChips layout="strip" testID={`${p.testID}-chips`} items={p.chips.items} value={p.chips.value} onChange={p.chips.onChange} />
      )
    ) : null;
  const field = layout.under.includes("searchField") ? (
    <TextField testID={`${p.testID}-search-field`} type="search" icon="search" value={p.search.value} onChangeText={p.search.onChange} placeholder={p.search.placeholder} label={p.search.placeholder} autoFocus={opened || always} />
  ) : null;
  const filters = layout.under.includes("filters") ? p.filters : null;
  const under = (
    <View style={{ gap: space[3] }}>
      {field}
      {chips}
      {filters}
    </View>
  );
  // the screen: the chips are the strip that sticks under the folded header (v2 «полоса разделов / сегмент прилипает»)
  const body = layout.body.includes("empty") ? (
    <View testID={`${p.testID}-empty`}>{p.empty}</View>
  ) : (
    <GroupedList testID={`${p.testID}-groups`}>
      {groups.map((g) => (
        <ListGroup key={g.key} title={g.title} all={g.all} separate={p.separate} testID={`${p.testID}-group-${g.key}`}>
          {g.rows.map((r) => {
            const { key, ...row } = p.row(r);
            return <GroupRow key={key} {...row} />;
          })}
        </ListGroup>
      ))}
    </GroupedList>
  );
  const rest = (
    <View style={{ gap: space[3] }}>
      {filters}
      {body}
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
        kind={p.back ? "object" : "root"}
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
        {aside ? (
          <View style={{ flexDirection: "row", gap: space[4], alignItems: "flex-start" }}>
            <View style={{ flex: 1, minWidth: 0 }}>{body}</View>
            {aside}
          </View>
        ) : (
          body
        )}
      </TemplateFrame>
    );
  return (
    <Screen
      testID={p.testID}
      title={title}
      back={p.back}
      headerIcons={icons}
      right={tail}
      aside={aside}
      tabs={chips ?? undefined}
      tabKey={chips ? p.chips?.value : undefined}
      below={chips ? rest : undefined}
    >
      {field}
      {chips ? null : rest}
    </Screen>
  );
}
