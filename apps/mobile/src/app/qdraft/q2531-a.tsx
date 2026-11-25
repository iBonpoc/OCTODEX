// ЧЕРНОВИК (#2531): «Обновить прайс» — было → стало, до «Применить». Цены — демо (правило 9). Не для влития.
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { Screen, Card, Divider, ListRow } from "@/ui/surfaces";
import { ListGroup, GroupRow, GroupedList } from "@/ui/groupedList";
import { OptionRow } from "@/ui/optionRow";
import { ActionBar } from "@/ui/actionBar";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";

export function Source() {
  return (
    <Card>
      <ListRow title="Поставщик" subtitle="ABC Supply · прайс от Nov 25, 2026" chevron={false} />
      <Divider />
      <ListRow title="Найдено в каталоге" subtitle="3 позиции из 3 · новых нет" chevron={false} />
    </Card>
  );
}

export default function Q2531a() {
  const [on, setOn] = useState(true);
  return (
    <Screen
      title="Обновить прайс"
      back={() => router.back()}
      footer={
        <ActionBar summary={<T v="caption" tone="mut">Отмечено {on ? 1 : 0} из 3</T>} main={<Button size="bar" full label="Применить" icon="check" onPress={() => undefined} />} />
      }
    >
      <Source />
      <GroupedList>
        <ListGroup title="На проверку" count={1}>
          <GroupRow title="Gutter 5″ K-style" subtitle="Закупка $2.10 → $21.00 · клиенту $2.52 → $25.20" status={{ status: "bad", label: "+900 %" }} onPress={() => undefined} />
        </ListGroup>
        <View style={{ gap: space[1] }}>
          <T v="caption" tone="mut">Цена выросла больше чем на 25 %. Отметьте, если это не ошибка в прайсе.</T>
        </View>
        <ListGroup title="Обычные" count={1}>
          <OptionRow multiple selected={on} onPress={() => setOn(!on)} title="Downspout 2×3 · +10 %" subtitle="Закупка $1.80 → $1.98 · клиенту $2.16 → $2.38 · наценка 20 %" />
        </ListGroup>
        <ListGroup title="Не меняем" count={1}>
          <GroupRow title="Hidden hanger" subtitle="Закупка $0.95 → $1.02 · клиенту $2.40 — как было" status={{ status: "warn", label: "Цена вручную" }} />
        </ListGroup>
      </GroupedList>
      <T v="caption" tone="mut">
        Отправленные и подписанные сметы не меняются. Черновики — только по «Пересчитать».
      </T>
    </Screen>
  );
}
