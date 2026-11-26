/**
 * Шаблон «Редактор» (BUILD-PLAN §1 поток Г, DS §12.3): Новый клиент, Смета, Выезд-форма.
 * Guarantees: «‹ назад» at the top left — with unsaved changes (`dirty`) it asks «Выйти без сохранения?» first (rule 5);
 * «⋯» the last on the right; the fields (`children`: FieldGroup / FieldRow) in the form column; ONE main step — `save` is a single
 * slot, pinned at the bottom in ONE compact row (MainStep "bar": the total or the reason on the left, the button 40 by its words on the
 * right, ≤ 56 — LAYOUT-RULES П3, 21.11 #2350); where the screen has no pinned bar (820/1280) the same row stands after the fields.
 * `preview` — the showcase frame instead of the Screen.
 */
import { useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { MainStep, type MainStepTotal } from "../mainStep";
import { Button } from "../controls";
import { Screen, useFooterShown } from "../surfaces";
import { ConfirmSheet, MoreButton, TemplateFrame } from "./parts";
import { SECOND_KEY, moreItems, templateLayout } from "./templateRules";
import type { MainAction, MoreAction } from "./types";

export interface EditorScreenProps {
  title: string;
  /** the state line under the title in the header's one row («Черновик · сохранено 8:19»; «Демо» joins it as a word) */
  state?: string;
  /** THE main step: «Сохранить», «Отправить» */
  save: MainAction;
  second?: MainAction;
  total?: MainStepTotal;
  /** what stands after the fields: totals of an estimate, a note */
  summary?: ReactNode;
  children: ReactNode;
  more?: MoreAction;
  onMore?: (key: string) => void;
  /** unsaved changes: «назад» asks first */
  dirty: boolean;
  back: () => void;
  /** a finger starts to scroll the page (passed to Screen: an open row of the estimate folds and keeps what is typed, DS §8.3) */
  onScrollBegin?: () => void;
  preview?: boolean;
  testID: string;
}

export function EditorScreen(p: EditorScreenProps) {
  const { t } = useI18n();
  const bar = useFooterShown();
  const noBar = p.preview ? false : !bar;
  const [leave, setLeave] = useState(false);
  const layout = templateLayout("editor", { back: true, more: !!p.more?.length, main: p.save, second: p.second, total: p.total, summary: !!p.summary, noBar });
  const items = useMemo(() => moreItems(p.more, p.second, p.total, false, p.save.reason), [p.more, p.second, p.total, p.save.reason]);
  const onMore = (k: string) => (k === SECOND_KEY ? p.second?.onPress() : p.onMore?.(k));
  const secondShown = layout.bottom.includes("second") || layout.body.includes("second");
  const step = <MainStep placement="bar" main={p.save} second={secondShown ? p.second : null} total={p.total} />;
  const back = () => (p.dirty ? setLeave(true) : p.back());
  // PROTOTYPE #2851 (б): iOS «Готово» top right; the pinned bottom step goes
  const done = <Button label={t("st.done")} size="sm" variant="ghost" onPress={p.save.onPress} testID={`${p.testID}-done`} />;
  const right = <>{done}{items.length ? <MoreButton items={items} onMore={onMore} testID={`${p.testID}-more`} /> : null}</>;
  const body = (
    <View style={{ gap: space[4] }}>
      {p.children}
      {p.summary}
      {layout.body.includes("main") ? step : null}
    </View>
  );
  const ask = leave ? { title: t("tpl.leaveTitle"), text: t("tpl.leaveText"), yes: t("tpl.leave"), onYes: p.back } : null;
  return (
    <>
      {p.preview ? (
        <TemplateFrame testID={p.testID} kind="editor" title={p.title} state={p.state} back={back} right={right} bottom={layout.bottom.includes("main") ? step : null}>
          {body}
        </TemplateFrame>
      ) : (
        <Screen testID={p.testID} title={p.title} head={{ kind: "editor", state: p.state }} back={back} right={right} onScrollBegin={p.onScrollBegin} form>
          {body}
        </Screen>
      )}
      <ConfirmSheet ask={ask} onClose={() => setLeave(false)} />
    </>
  );
}
