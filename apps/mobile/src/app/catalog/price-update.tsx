// ЧЕРНОВИК (#2531 / #2549, не для влития): «Обновить прайс» — было → стало до «Применить». Экрана в приложении нет; он собран
// шаблоном списка каталога (Screen + группы строк + ActionBar) на демо-каталоге Home Depot (цены — демо, правило 9).
// `?qv=a` — проверка; после «Применить» — тост «Вернуть» и «Вернуть старые цены» с подтверждением.
import { useState } from "react";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Screen } from "@/ui/surfaces";
import { GroupedList, GroupRow, ListGroup } from "@/ui/groupedList";
import { OptionRow } from "@/ui/optionRow";
import { ActionBar } from "@/ui/actionBar";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { StatusNote } from "@/ui/statusNote";
import { useToast } from "@/ui/overlays";
import { useConfirm } from "@/ui/confirmDialog";
import { markUndo } from "@/data/undo";

export default function PriceUpdate() {
  const { db } = useStore();
  const { money } = useI18n();
  const toast = useToast();
  const [dialog, ask] = useConfirm();
  const [led, setLed] = useState(true);
  const [applied, setApplied] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/catalog"));
  const sup = (db.suppliers ?? []).find((s) => s.id === "sup-hd");
  const item = (id: string) => db.catalog.find((c) => c.id === id);
  const bracket = item("cat-bracket");
  const bulb = item("cat-led");
  const gfci = item("cat-gfci");
  const was = (c: typeof bulb) => c?.costCents ?? 0;
  const price = (cost: number, c: typeof bulb) => Math.round((cost * (10000 + (c?.markupBps ?? 0))) / 10000);
  const bulbNew = Math.round(was(bulb) * 1.1);
  const apply = () => {
    setApplied(true);
    toast.show("Цены обновлены: 1 позиция", markUndo(() => { setApplied(false); return true; }));
  };
  const restore = async () => {
    const k = await ask({
      title: "Вернуть старые цены?",
      text: "1 позиция каталога вернётся к ценам до Nov 25, 2026. Сметы не меняются.",
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
  if (applied)
    return (
      <Screen title="Обновить прайс" back={back}>
        {source}
        <StatusNote tone="ok">Применено Nov 25, 2026 · 1 позиция</StatusNote>
        <GroupedList>
          <ListGroup title="Обновлено" count={1} inset={space[4]}>
            <GroupRow title={bulb?.name ?? ""} subtitle={`Клиенту ${money(price(was(bulb), bulb))} → ${money(price(bulbNew, bulb))} · закупка +10 %`} value={money(price(bulbNew, bulb))} />
          </ListGroup>
          <ListGroup title="Загрузка целиком" inset={space[4]}>
            <GroupRow title="Вернуть старые цены" subtitle="Можно до Dec 25, 2026 · 1 позиция" action="acc" onPress={() => void restore()} testID="pu-restore" />
          </ListGroup>
        </GroupedList>
        {dialog}
      </Screen>
    );
  return (
    <Screen
      title="Обновить прайс"
      back={back}
      footer={<ActionBar summary={<T v="caption" tone="mut">{`Отмечено ${led ? 1 : 0} из 2`}</T>} main={<Button size="bar" full label="Применить" icon="check" disabled={!led} onPress={apply} />} testID="pu-bar" />}
    >
      {source}
      <GroupedList>
        <ListGroup title="На проверку" count={1} inset={space[4]}>
          <OptionRow inGroup multiple selected={false} onPress={() => undefined} title={`${bracket?.name ?? ""} · ${money(was(bracket))} → ${money(was(bracket) * 10)}`} subtitle="Выросла больше чем на 25 % — отметьте, если в прайсе нет ошибки" />
          <GroupRow compact title="Закупка за единицу" status={{ status: "bad", label: "Проверьте · +900 %" }} />
        </ListGroup>
        <ListGroup title="Обычные" count={1} inset={space[4]}>
          <OptionRow inGroup multiple selected={led} onPress={() => setLed(!led)} title={`${bulb?.name ?? ""} · ${money(was(bulb))} → ${money(bulbNew)} · +10 %`} subtitle={`Клиенту ${money(price(was(bulb), bulb))} → ${money(price(bulbNew, bulb))} · наценка 10 %`} />
        </ListGroup>
        <ListGroup title="Не меняем" count={1} inset={space[4]}>
          <GroupRow wrap title={gfci?.name ?? ""} subtitle={`Закупка ${money(was(gfci))} → ${money(Math.round(was(gfci) * 1.05))} · клиенту как было`} status={{ status: "warn", label: "Цена вручную" }} />
        </ListGroup>
      </GroupedList>
      <T v="caption" tone="mut">
        Отправленные и подписанные сметы не меняются.
      </T>
      {dialog}
    </Screen>
  );
}
