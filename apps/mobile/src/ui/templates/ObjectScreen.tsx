/**
 * Шаблон «Объект» (BUILD-PLAN §1 поток Г, BUILD-SPEC §1, DS §12.2–§12.3): Клиент, Работа, Выезд, Счёт, Лид.
 * Guarantees: «‹ назад» at the top left; «＋» (if something is made from the object) and «⋯» on the right, «⋯» the last;
 * the name once (ObjectHeader — the Screen's title is not drawn, П7); IconRow under the header; ONE main step — `main` is a single
 * slot — right under the header and its quick actions: MainStep "top", a 40 button by its words, not across the screen (LAYOUT-RULES
 * П3, the founder 21.11 #2350: no pinned plate on an object — the tab bar stays seen, a plate always lit was too loud); a second
 * step always goes into «⋯»; then the sections strip (ViewTabs), sticking to the top on scroll. Once it sticks, the compact bar
 * «‹ Имя ⌄ ⋯» (ObjectHeaderBar) stands over it: «⌄» scrolls up and opens the header, «⋯» is the same menu.
 * `preview` — the showcase frame (templates/parts.tsx TemplateFrame) instead of the Screen.
 */
import { useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useDevice } from "@/theme/ThemeProvider";
import { IconRow, type IconRowItem } from "../iconRow";
import { MainStep, type MainStepTotal } from "../mainStep";
import { ObjectHeader, ObjectHeaderBar, type ObjectHeaderProps } from "../objectHeader";
import { useScreenScroll } from "../requiredForm";
import { Screen } from "../surfaces";
import { ViewTabs } from "../viewTabs";
import { CreateButton, MoreButton, TemplateFrame } from "./parts";
import { SECOND_KEY, moreItems, templateLayout } from "./templateRules";
import type { CreateAction, MainAction, MoreAction } from "./types";

export interface ObjectScreenProps<S extends string> {
  header: ObjectHeaderProps;
  /** QuickActions `row` under the header: 3–5, the fifth «Ещё» */
  actions?: IconRowItem[];
  /** THE main step — under the header and its quick actions, a 40 button by its words (no pinned plate on an object) */
  main?: MainAction;
  /** a second step — always in «⋯» on an object (the main one stands alone) */
  second?: MainAction;
  /** not drawn on an object since the pinned bar is gone (put the sum into the label: «Выставить · $3,078») — kept so «⋯» knows it */
  total?: MainStepTotal;
  sections: { key: S; label: string; count?: number }[];
  section: S;
  onSection: (k: S) => void;
  /** what the strip is of — read with the group («Разделы клиента») */
  sectionsLabel: string;
  /** the open section's content */
  children: ReactNode;
  more: MoreAction;
  onMore: (key: string) => void;
  create?: CreateAction;
  onCreate?: (key: string) => void;
  back: () => void;
  /** the showcase frame instead of the Screen */
  preview?: boolean;
  testID: string;
}

export function ObjectScreen<S extends string>(p: ObjectScreenProps<S>) {
  return p.preview ? <ObjectPreview {...p} /> : <ObjectLive {...p} />;
}

/** the header's panel: the screen's own control when given, else held here (the compact bar's «⌄» opens it too) */
function useHeaderOpen(h: ObjectHeaderProps) {
  const [own, setOwn] = useState(!!h.defaultOpen);
  const open = h.open ?? own;
  const set = (next: boolean) => {
    if (h.open === undefined) setOwn(next);
    h.onToggle?.(next);
  };
  return [open, set] as const;
}

function useObjectParts<S extends string>(p: ObjectScreenProps<S>) {
  const [open, setOpen] = useHeaderOpen(p.header);
  const layout = templateLayout("object", { back: true, create: !!p.create, more: true, main: p.main, second: p.second, total: p.total, sections: p.sections.length > 0 });
  const items = useMemo(() => moreItems(p.more, p.second, p.total, true), [p.more, p.second, p.total]);
  const onMore = (k: string) => (k === SECOND_KEY ? p.second?.onPress() : p.onMore(k));
  // the one step under the header: a 40 button by its words (never a plate across the screen, never two)
  const step = p.main && layout.under.includes("main") ? <MainStep placement="top" fit main={p.main} /> : null;
  const more = <MoreButton items={items} onMore={onMore} testID={`${p.testID}-more`} />;
  const right = (
    <>
      {p.create && p.onCreate ? <CreateButton create={p.create} onCreate={p.onCreate} testID={`${p.testID}-create`} /> : null}
      {more}
    </>
  );
  // the selected pill stays one object while the section is the same (03 §2.5: the strip's items memoised)
  const tabs = useMemo(
    () => (p.sections.length ? <ViewTabs testID={`${p.testID}-sections`} items={p.sections} value={p.section} onChange={p.onSection} label={p.sectionsLabel} /> : null),
    [p.sections, p.section, p.onSection, p.sectionsLabel, p.testID],
  );
  const top = (
    <View style={{ gap: space[4] }}>
      <ObjectHeader {...p.header} open={open} onToggle={setOpen} />
      {p.actions?.length ? <IconRow testID={`${p.testID}-actions`} actions={p.actions} /> : null}
      {step}
    </View>
  );
  const bar = <CompactBar title={p.header.title} back={p.back} more={<MoreButton items={items} onMore={onMore} testID={`${p.testID}-bar-more`} />} onOpen={() => setOpen(true)} expandLabel={p.header.labels.expand} testID={`${p.testID}-bar`} />;
  return { right, tabs, top, bar };
}

/** «‹ Имя ⌄ ⋯» over the stuck strip: «⌄» goes back to the top and opens the header (the page's scroll is the Screen's) */
function CompactBar({ title, back, more, onOpen, expandLabel, testID }: { title: string; back: () => void; more: ReactNode; onOpen: () => void; expandLabel: string; testID: string }) {
  const { t } = useI18n();
  const { wide } = useDevice();
  const scroll = useScreenScroll();
  // 820/1280: «‹» and «⋯» stay in the pinned address row over the scroll — the bar is only «Имя ⌄», not a second «⋯»
  return (
    <ObjectHeaderBar
      testID={testID}
      title={title}
      back={wide ? undefined : { label: t("common.back"), onPress: back }}
      right={wide ? undefined : more}
      expandLabel={expandLabel}
      onExpand={() => {
        scroll?.toTop?.(true);
        onOpen();
      }}
    />
  );
}

function ObjectLive<S extends string>(p: ObjectScreenProps<S>) {
  const { right, tabs, top, bar: compact } = useObjectParts(p);
  return (
    <Screen
      testID={p.testID}
      title={p.header.title}
      titleHidden
      back={p.back}
      right={right}
      tabs={tabs ?? undefined}
      tabKey={p.section}
      tabsMini={compact}
      below={tabs ? <View style={{ gap: space[3] }}>{p.children}</View> : undefined}
    >
      {top}
      {tabs ? null : <View style={{ gap: space[3] }}>{p.children}</View>}
    </Screen>
  );
}

function ObjectPreview<S extends string>(p: ObjectScreenProps<S>) {
  const { right, tabs, top } = useObjectParts(p);
  return (
    <TemplateFrame testID={p.testID} title={p.header.title} titleHidden back={p.back} right={right}>
      {top}
      {tabs}
      {p.children}
    </TemplateFrame>
  );
}
