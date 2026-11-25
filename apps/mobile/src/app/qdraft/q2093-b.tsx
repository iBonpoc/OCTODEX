// ЧЕРНОВИК (#2093): «Требует внимания» у офиса — та же строка GroupRow, одно действие «Перенести» (значок календаря). Не для влития.
import { router } from "expo-router";
import { Screen } from "@/ui/surfaces";
import { ListGroup, GroupRow, GroupedList } from "@/ui/groupedList";
import { T } from "@/ui/primitives";

export default function Q2093b() {
  return (
    <Screen title="Требует внимания" back={() => router.back()}>
      <GroupedList>
        <ListGroup title="Сейчас" count={3}>
          <GroupRow
            lead={{ initials: "SM" }}
            title="Sarah Mitchell"
            subtitle="Клиента не было дома — перенести выезд"
            wrap
            actions={[{ icon: "calendar", a11y: "Перенести выезд Sarah Mitchell", onPress: () => undefined, testID: "att-noshow-move" }]}
            onPress={() => undefined}
          />
          <GroupRow lead={{ initials: "DK" }} title="David Kim" subtitle="Счёт просрочен на 9 дн" value="$1,840" onPress={() => undefined} />
          <GroupRow lead={{ initials: "LP" }} title="Linda Park" subtitle="Лид ждёт ответа 2 ч" onPress={() => undefined} />
        </ListGroup>
      </GroupedList>
      <T v="caption" tone="mut">
        Значок календаря — «Перенести». Написать клиенту — после выбора нового времени.
      </T>
    </Screen>
  );
}
