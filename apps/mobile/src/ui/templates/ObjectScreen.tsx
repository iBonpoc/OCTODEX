/**
 * Шаблон «Объект» (BUILD-PLAN §1 поток Г, BUILD-SPEC §1, DS §12.2–§12.3): Клиент, Работа, Выезд, Счёт, Лид.
 * Guarantees: «‹ назад» at the top left; «＋» (if something is made from the object) and «⋯» on the right, «⋯» the last;
 * the name once (ObjectHeader — the Screen's title is not drawn, П7); IconRow under the header; the sections strip (ViewTabs) right
 * under them, sticking to the top on scroll; ONE main step — `main` is a single slot, pinned at the bottom (MainStep "bar", 44 across
 * the width). Where the screen has no pinned bar (820/1280, or a route that still shows the tab bar) the same MainStep stands at the
 * top of the section's content — never two. A second step that does not fit the bar's pair goes into «⋯» (mainStepLayout).
 * `preview` — the showcase frame (templates/parts.tsx TemplateFrame) instead of the Screen.
 */
import { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { IconRow, type IconRowItem } from "../iconRow";
import { MainStep, type MainStepTotal } from "../mainStep";
import { ObjectHeader, type ObjectHeaderProps } from "../objectHeader";
import { T } from "../primitives";
import { Screen, useFooterShown } from "../surfaces";
import { ViewTabs } from "../viewTabs";
import { CreateButton, MoreButton, TemplateFrame } from "./parts";
import { SECOND_KEY, moreItems, templateLayout } from "./templateRules";
import type { CreateAction, MainAction, MoreAction } from "./types";

export interface ObjectScreenProps<S extends string> {
  header: ObjectHeaderProps;
  /** QuickActions `row` under the header: 3–5, the fifth «Ещё» */
  actions?: IconRowItem[];
  /** THE main step — always pinned at the bottom */
  main?: MainAction;
  /** «вторая + главная»; a label longer than `pair.labelMax` goes into «⋯» */
  second?: MainAction;
  /** «Итого ˅ $…» on the left of the bar */
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

function useObjectParts<S extends string>(p: ObjectScreenProps<S>, noBar: boolean) {
  const layout = templateLayout("object", { back: true, create: !!p.create, more: true, main: p.main, second: p.second, total: p.total, sections: p.sections.length > 0, noBar });
  const items = useMemo(() => moreItems(p.more, p.second, p.total), [p.more, p.second, p.total]);
  const onMore = (k: string) => (k === SECOND_KEY ? p.second?.onPress() : p.onMore(k));
  const secondShown = layout.bottom.includes("second") || layout.body.includes("second");
  const step = p.main ? <MainStep placement="bar" main={p.main} second={secondShown ? p.second : null} total={p.total} /> : null;
  const right = (
    <>
      {p.create && p.onCreate ? <CreateButton create={p.create} onCreate={p.onCreate} testID={`${p.testID}-create`} /> : null}
      <MoreButton items={items} onMore={onMore} testID={`${p.testID}-more`} />
    </>
  );
  // the selected pill stays one object while the section is the same (03 §2.5: the strip's items memoised)
  const tabs = useMemo(
    () => (p.sections.length ? <ViewTabs testID={`${p.testID}-sections`} items={p.sections} value={p.section} onChange={p.onSection} label={p.sectionsLabel} /> : null),
    [p.sections, p.section, p.onSection, p.sectionsLabel, p.testID],
  );
  const top = (
    <View style={{ gap: space[4] }}>
      <ObjectHeader {...p.header} />
      {p.actions?.length ? <IconRow testID={`${p.testID}-actions`} actions={p.actions} /> : null}
    </View>
  );
  return { layout, step, right, tabs, top };
}

function ObjectLive<S extends string>(p: ObjectScreenProps<S>) {
  const bar = useFooterShown();
  const { layout, step, right, tabs, top } = useObjectParts(p, !bar);
  const inBody = layout.body.includes("main");
  return (
    <Screen
      testID={p.testID}
      title={p.header.title}
      titleHidden
      back={p.back}
      right={right}
      tabs={tabs ?? undefined}
      tabKey={p.section}
      tabsMini={
        <T v="heading" numberOfLines={1}>
          {p.header.title}
        </T>
      }
      below={
        tabs ? (
          <View style={{ gap: space[3] }}>
            {inBody ? step : null}
            {p.children}
          </View>
        ) : undefined
      }
      footer={layout.bottom.includes("main") ? step : undefined}
    >
      {top}
      {tabs ? null : (
        <View style={{ gap: space[3] }}>
          {inBody ? step : null}
          {p.children}
        </View>
      )}
    </Screen>
  );
}

function ObjectPreview<S extends string>(p: ObjectScreenProps<S>) {
  const { layout, step, right, tabs, top } = useObjectParts(p, false);
  return (
    <TemplateFrame testID={p.testID} title={p.header.title} titleHidden back={p.back} right={right} bottom={layout.bottom.includes("main") ? step : null}>
      {top}
      {tabs}
      {p.children}
    </TemplateFrame>
  );
}
