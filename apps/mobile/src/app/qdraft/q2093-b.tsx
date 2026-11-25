// ЧЕРНОВИК (#2093): «Требует внимания» у офиса — тот же пункт с одним действием «Перенести». Не для влития.
import { router } from "expo-router";
import { Screen, Card, RowView, SectionTitle } from "@/ui/surfaces";
import { ListGroup, GroupRow, GroupedList } from "@/ui/groupedList";
import { Button, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";

export default function Q2093b() {
  return (
    <Screen title="Требует внимания" back={() => router.back()}>
      <Card status="warn">
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="caption" tone="mut" tabular>1 из 3</T>
          <StatusChip status="warn" label="Нет дома" />
        </RowView>
        <T v="title">Sarah Mitchell</T>
        <T v="body" tone="mut">Клиента не было дома — перенести выезд</T>
        <T v="body" tone="mut">(626) 555-0142 · 1420 Oak St, Pasadena</T>
        <RowView style={{ flexWrap: "wrap" }}>
          <Button label="Перенести" icon="calendar" onPress={() => undefined} />
          <Button label="Позже" variant="secondary" onPress={() => undefined} />
        </RowView>
      </Card>
      <SectionTitle title="Ещё" />
      <GroupedList>
        <ListGroup>
          <GroupRow lead={{ initials: "DK" }} title="David Kim" subtitle="Счёт просрочен на 9 дн" value="$1,840" onPress={() => undefined} />
          <GroupRow lead={{ initials: "LP" }} title="Linda Park" subtitle="Лид ждёт ответа 2 ч" onPress={() => undefined} />
        </ListGroup>
      </GroupedList>
    </Screen>
  );
}
