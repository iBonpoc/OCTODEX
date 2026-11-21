/**
 * Шаблон «Объект» (BUILD-PLAN §1 поток Г, BUILD-SPEC §1, DS §12.2–§12.3): Клиент, Работа, Выезд, Счёт, Лид.
 * Guarantees: «‹ назад» at the top left; «＋» (if something is made from the object) and «⋯» on the right, «⋯» the last;
 * the name once (ObjectHeader — the Screen's title is not drawn, П7); IconRow under the header; ONE main step — `main` is a single
 * slot — right under the header and its quick actions: MainStep "top", a 40 button by its words, not across the screen (LAYOUT-RULES
 * П3, the founder 21.11 #2350: no pinned plate on an object — the tab bar stays seen, a plate always lit was too loud); a second
 * step always goes into «⋯»; then the sections strip (ViewTabs), sticking under the one header's row on scroll. The name is the one
 * header's big block (templates/screenHeader.tsx «Объект»: «Имя | две строки», a client's «⌄»); folded (from 112) the row reads
 * «← Имя ⌄ · ⋯» — «⌄» scrolls up and opens the panel, «＋» goes into «⋯» (ObjectRight).
 * `preview` — the showcase frame (templates/parts.tsx TemplateFrame) instead of the Screen.
 */
import { useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { IconRow, type IconRowItem } from "../iconRow";
import { MainStep, type MainStepTotal } from "../mainStep";
import { ObjectHeader, objectHeadSub, type ObjectHeaderProps } from "../objectHeader";
import { Screen } from "../surfaces";
import { ViewTabs } from "../viewTabs";
import { CreateButton, MoreButton, TemplateFrame } from "./parts";
import { SECOND_KEY, moreItems, templateLayout } from "./templateRules";
import type { CreateAction, MainAction, MoreAction } from "./types";
import { HeaderFade, useHeaderStage } from "./screenHeader";

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
  const right = <ObjectRight create={p.create} onCreate={p.onCreate} items={items} onMore={onMore} testID={p.testID} />;
  // the selected pill stays one object while the section is the same (03 §2.5: the strip's items memoised)
  const tabs = useMemo(
    () => (p.sections.length ? <ViewTabs testID={`${p.testID}-sections`} items={p.sections} value={p.section} onChange={p.onSection} label={p.sectionsLabel} /> : null),
    [p.sections, p.section, p.onSection, p.sectionsLabel, p.testID],
  );
  const top = (
    <View style={{ gap: space[4] }}>
      <ObjectHeader {...p.header} inHead open={open} onToggle={setOpen} />
      {p.actions?.length ? (
        <HeaderFade>
          <IconRow testID={`${p.testID}-actions`} actions={p.actions} />
        </HeaderFade>
      ) : null}
      {step}
    </View>
  );
  // v2 «Объект»: the name 30 | the rule | two lines; a client's «⌄» (the header has a panel) after the name
  const head = {
    kind: "object" as const,
    sub: objectHeadSub(p.header),
    expand: p.header.details
      ? { open, onToggle: setOpen, expandLabel: p.header.labels.expand, collapseLabel: p.header.labels.collapse, testID: `${p.header.testID}-toggle` }
      : undefined,
  };
  return { right, tabs, top, head };
}

/**
 * «＋» · «⋯» of the object's row: once the header has folded (v2 «С 112 — строка «← Sarah Mitchell ⌄ · ⋯», «＋» уходит в «⋯»»)
 * the «＋» items move to the top of «⋯» and the «＋» circle leaves the row.
 */
function ObjectRight({ create, onCreate, items, onMore, testID }: { create?: CreateAction; onCreate?: (k: string) => void; items: MoreAction; onMore: (k: string) => void; testID: string }) {
  const folded = useHeaderStage() === 2;
  const plusKeys = useMemo(() => new Set((create?.items ?? []).map((i) => i.key)), [create]);
  const merged = useMemo(() => (folded && create && onCreate ? [...create.items, ...items] : items), [folded, create, onCreate, items]);
  const pick = (k: string) => (folded && plusKeys.has(k) ? onCreate?.(k) : onMore(k));
  return (
    <>
      {create && onCreate && !folded ? <CreateButton create={create} onCreate={onCreate} testID={`${testID}-create`} /> : null}
      <MoreButton items={merged} onMore={pick} testID={`${testID}-more`} />
    </>
  );
}

function ObjectLive<S extends string>(p: ObjectScreenProps<S>) {
  const { right, tabs, top, head } = useObjectParts(p);
  return (
    <Screen
      testID={p.testID}
      title={p.header.title}
      head={head}
      back={p.back}
      right={right}
      tabs={tabs ?? undefined}
      tabKey={p.section}
      below={tabs ? <View style={{ gap: space[3] }}>{p.children}</View> : undefined}
    >
      {top}
      {tabs ? null : <View style={{ gap: space[3] }}>{p.children}</View>}
    </Screen>
  );
}

function ObjectPreview<S extends string>(p: ObjectScreenProps<S>) {
  const { right, tabs, top, head } = useObjectParts(p);
  return (
    <TemplateFrame testID={p.testID} kind="object" title={p.header.title} sub={head.sub} back={p.back} right={right}>
      {top}
      {tabs}
      {p.children}
    </TemplateFrame>
  );
}
