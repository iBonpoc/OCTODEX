// ЧЕРНОВИК (#2536): «История» клиента — последней записью «Клиент добавлен». Не для влития.
import { router } from "expo-router";
import { ObjectScreen } from "@/ui/templates";
import { ListGroup, GroupRow, GroupedList } from "@/ui/groupedList";
import { SECTIONS, HEADER, QUICK } from "./q2536-a";

type S = (typeof SECTIONS)[number]["key"];

export default function Q2536b() {
  return (
    <ObjectScreen<S>
      testID="client-screen"
      back={() => router.back()}
      header={HEADER}
      actions={QUICK}
      sections={SECTIONS}
      section="log"
      onSection={() => undefined}
      sectionsLabel="Разделы клиента"
      sectionsLook="chips"
      more={[{ key: "edit", label: "Изменить" }]}
      onMore={() => undefined}
    >
      <GroupedList>
        <ListGroup title="Nov 18, 2026">
          <GroupRow lead={{ icon: "payment" }} title="Оплата получена" subtitle="INV-1031 · карта" value="$2,400.00" />
          <GroupRow compact lead={{ icon: "phone" }} title="Звонок · 4 мин" />
        </ListGroup>
        <ListGroup title="Apr 02, 2025">
          <GroupRow lead={{ icon: "doc" }} title="Смета отправлена" subtitle="EST-1007 · Seamless gutters" value="$3,180.00" />
        </ListGroup>
        <ListGroup title="Mar 12, 2025">
          <GroupRow compact lead={{ icon: "leads" }} title="Лид стал клиентом" />
          <GroupRow lead={{ icon: "user" }} title="Клиент добавлен" subtitle="Mar 12, 2025 · Алекс Ривера" />
        </ListGroup>
      </GroupedList>
    </ObjectScreen>
  );
}
