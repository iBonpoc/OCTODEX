// ЧЕРНОВИК (#2536): «Обзор» клиента — в группе фактов строка «Ответственный · Алекс Ривера ›». Не для влития.
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { ObjectScreen } from "@/ui/templates";
import { StatGrid, StatTile } from "@/ui/statTile";
import { ListGroup, GroupRow, GroupedList } from "@/ui/groupedList";
import { PickerSheet } from "@/ui/pickerSheet";
import { T } from "@/ui/primitives";

type S = "over" | "work" | "est" | "money" | "places" | "log";
export const SECTIONS: { key: S; label: string; count?: number }[] = [
  { key: "over", label: "Обзор" },
  { key: "work", label: "Работы", count: 2 },
  { key: "est", label: "Сметы", count: 3 },
  { key: "money", label: "Счета", count: 2 },
  { key: "places", label: "Адреса" },
  { key: "log", label: "История" },
];
export const HEADER = {
  testID: "client-header",
  title: "Sarah Mitchell",
  avatar: "SM",
  kindWord: "Клиент",
  meta: [{ id: "vip", label: "VIP" }],
  status: { name: "ok" as const, label: "Активный", icon: "clock" as const },
  address: { text: "1420 Oak St, Pasadena, CA", onPress: () => undefined },
  labels: { expand: "Контакты", collapse: "Скрыть контакты", more: (n: number) => `ещё ${n}` },
};
export const QUICK = [
  { icon: "phone" as const, a11y: "Позвонить Sarah Mitchell", label: "Звонок", onPress: () => undefined, testID: "q-call" },
  { icon: "sms" as const, a11y: "SMS Sarah Mitchell", label: "SMS", onPress: () => undefined, testID: "q-sms" },
  { icon: "mail" as const, a11y: "Почта Sarah Mitchell", label: "Почта", onPress: () => undefined, testID: "q-mail" },
  { icon: "navigate" as const, a11y: "Маршрут", label: "Маршрут", onPress: () => undefined, testID: "q-route" },
];

export default function Q2536a() {
  const [pick, setPick] = useState(false);
  const [owner, setOwner] = useState("alex");
  const people = [
    { key: "alex", label: "Алекс Ривера", subtitle: "Офис" },
    { key: "maria", label: "Мария Лопес", subtitle: "Продажи" },
    { key: "john", label: "Джон Картер", subtitle: "Владелец" },
  ];
  return (
    <>
      <ObjectScreen<S>
        testID="client-screen"
        back={() => router.back()}
        header={HEADER}
        actions={QUICK}
        sections={SECTIONS}
        section="over"
        onSection={() => undefined}
        sectionsLabel="Разделы клиента"
        sectionsLook="chips"
        more={[{ key: "edit", label: "Изменить" }]}
        onMore={() => undefined}
      >
        <View style={{ gap: space[4] }}>
          <StatGrid>
            <StatTile label="Долг" value="$1,240" icon="invoice" />
            <StatTile label="Оплачено всего" value="$8,650" icon="wallet" />
            <StatTile label="Последний контакт · звонок" value="2 дн" icon="phone" />
            <StatTile label="Источник" value="Google" icon="star" />
          </StatGrid>
          <GroupedList>
            <ListGroup title="Главное">
              <GroupRow lead={{ icon: "userCheck" }} title="Ответственный" value={people.find((p) => p.key === owner)?.label} chevron onPress={() => setPick(true)} />
              <GroupRow lead={{ icon: "calendar" }} title="Клиент с" value="Mar 12, 2025" />
              <GroupRow lead={{ icon: "wrench" }} title="Работ сделано" value="3" />
            </ListGroup>
          </GroupedList>
          <T v="caption" tone="mut">
            Если вы в компании один — строки «Ответственный» нет.
          </T>
        </View>
      </ObjectScreen>
      <PickerSheet visible={pick} title="Ответственный" items={people.map((p) => ({ ...p, leading: { icon: "user" as const } }))} value={owner} onSelect={(k) => { setOwner(k); setPick(false); }} onClose={() => setPick(false)} />
    </>
  );
}
