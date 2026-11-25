// ЧЕРНОВИК (#2531 / #2549, не для влития): «Обновить прайс» — было → стало до «Обновить». Экрана в приложении нет; он собран
// шаблоном списка каталога (Screen + группы строк + ActionBar) на демо-каталоге Home Depot (цены — демо, правило 9).
// Отметки — по ДС §9 А4: у выбранного CheckMark, у невыбранного пусто; у «Цена вручную» отметки нет. После «Обновить» —
// тост «Вернуть» 5 с, «Не обновлено · 1» с «Проверить» и «Вернуть старые цены» с подтверждением.
import { useState } from "react";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Screen } from "@/ui/surfaces";
import { GroupedList, GroupRow, ListGroup } from "@/ui/groupedList";
import { OptionRow } from "@/ui/optionRow";
import { ActionRow } from "@/ui/multiValueField";
import { ActionBar } from "@/ui/actionBar";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { StatusNote } from "@/ui/statusNote";
import { useToast } from "@/ui/overlays";
import { useConfirm } from "@/ui/confirmDialog";
import { markUndo } from "@/data/undo";
import type { CatalogItem } from "@/data/types";

/** the client's price of a catalog material: cost + the supplier's tax + the markup (demo arithmetic; the real one is the engine's) */
const clientCents = (cost: number, c?: CatalogItem) => Math.round((cost * (10000 + (c?.vendorTaxBps ?? 0)) * (10000 + (c?.markupBps ?? 0))) / 1e8);

export default function PriceUpdate() {
  const { db } = useStore();
  const { money } = useI18n();
  const toast = useToast();
  const [dialog, ask] = useConfirm();
  const [picked, setPicked] = useState<string[]>(["cat-led"]);
  const [applied, setApplied] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/catalog"));
  const sup = (db.suppliers ?? []).find((s) => s.id === "sup-hd");
  const item = (id: string) => db.catalog.find((c) => c.id === id);
  const bracket = item("cat-bracket");
  const bulb = item("cat-led");
  const gfci = item("cat-gfci");
  const cost = (c?: CatalogItem) => c?.costCents ?? 0;
  const bracketNew = cost(bracket) * 10;
  const bulbNew = Math.round(cost(bulb) * 1.1);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const n = picked.length;
  const apply = () => {
    setApplied(true);
    toast.show(`Цены обновлены: ${n} ${n === 1 ? "позиция" : "позиции"}`, markUndo(() => { setApplied(false); return true; }));
  };
  const restore = async () => {
    const k = await ask({
      title: "Вернуть старые цены?",
      text: "1 позиция каталога вернётся к ценам до загрузки. Сметы не меняются.",
      actions: [
        { key: "no", label: "Не возвращать", tone: "cancel" },
        { key: "yes", label: "Вернуть", tone: "primary", testID: "pu-restore-yes" },
      ],
    });
    if (k === "yes") setApplied(false);
  };
  const source = (
    <ListGroup inset={space[4]} testID="pu-source">
      <GroupRow compact title="Поставщик" value={sup?.name ?? ""} valueMark />
      <GroupRow compact title="Прайс от" value="Nov 25, 2026" valueMark />
      <GroupRow compact title="Найдено в каталоге" value="3 из 3 · новых нет" valueMark />
    </ListGroup>
  );
  const bracketTitle = bracket?.name ?? "";
  const bracketLine = `Закупка ${money(cost(bracket))} → ${money(bracketNew)} (+900\u00a0%) · клиенту ${money(clientCents(cost(bracket), bracket))} → ${money(clientCents(bracketNew, bracket))}`;
  if (applied)
    return (
      <Screen title="Обновить прайс" back={back}>
        {source}
        <StatusNote tone="ok">Обновлено Nov 25, 2026 · 1 позиция</StatusNote>
        <GroupedList>
          <ListGroup title="Обновлено" count={1} inset={space[4]}>
            <GroupRow title={bulb?.name ?? ""} subtitle={`Клиенту ${money(clientCents(cost(bulb), bulb))} → ${money(clientCents(bulbNew, bulb))} · закупка +10\u00a0%`} value={money(clientCents(bulbNew, bulb))} />
          </ListGroup>
          <ListGroup title="Не обновлено" count={1} inset={space[4]} note="Цена выросла больше чем на 25\u00a0% — ждёт вашей проверки.">
            <GroupRow wrap title={bracketTitle} subtitle={bracketLine} status={{ status: "bad", label: "Проверьте" }} />
            <ActionRow inGroup label="Проверить" icon="search" onPress={() => setApplied(false)} testID="pu-check" />
          </ListGroup>
          <ListGroup title="Загрузка целиком" inset={space[4]} note="Можно до Dec 25, 2026 · 1 позиция">
            <ActionRow inGroup label="Вернуть старые цены" icon="undo" onPress={() => void restore()} testID="pu-restore" />
          </ListGroup>
        </GroupedList>
        {dialog}
      </Screen>
    );
  return (
    <Screen
      title="Обновить прайс"
      back={back}
      footer={<ActionBar summary={<T v="caption" tone="mut">{`Отмечено ${n} из 2`}</T>} main={<Button size="bar" full label={n ? `Обновить ${n} ${n === 1 ? "цену" : "цены"}` : "Обновить"} icon="check" disabled={!n} onPress={apply} />} testID="pu-bar" />}
    >
      {source}
      <GroupedList>
        <ListGroup title="На проверку" count={1} inset={space[4]} note="Выросла больше чем на 25\u00a0%. Отметьте, если в прайсе нет ошибки.">
          <OptionRow inGroup multiple selected={picked.includes("cat-bracket")} onPress={() => toggle("cat-bracket")} title={bracketTitle} subtitle={bracketLine} status={{ status: "bad", label: "Проверьте" }} testID="pu-bracket" />
        </ListGroup>
        <ListGroup title="Обычные" count={1} inset={space[4]}>
          <OptionRow inGroup multiple selected={picked.includes("cat-led")} onPress={() => toggle("cat-led")} title={bulb?.name ?? ""} subtitle={`Закупка ${money(cost(bulb))} → ${money(bulbNew)} (+10\u00a0%) · клиенту ${money(clientCents(cost(bulb), bulb))} → ${money(clientCents(bulbNew, bulb))}`} testID="pu-bulb" />
        </ListGroup>
        <ListGroup title="Не меняем" count={1} inset={space[4]}>
          <GroupRow wrap title={gfci?.name ?? ""} subtitle="Не меняем — цена введена вручную" status={{ status: "warn", label: "Цена вручную" }} />
        </ListGroup>
      </GroupedList>
      <T v="caption" tone="mut">
        Отправленные и подписанные сметы не меняются.
      </T>
      {dialog}
    </Screen>
  );
}
