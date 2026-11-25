// ЧЕРНОВИК (#2531): после «Применить» — тост «Вернуть» на 5 с и отмена загрузки целиком 30 дней. Не для влития.
import { useEffect } from "react";
import { router } from "expo-router";
import { Screen } from "@/ui/surfaces";
import { ListGroup, GroupRow, GroupedList } from "@/ui/groupedList";
import { StatusNote } from "@/ui/statusNote";
import { useToast } from "@/ui/overlays";
import { markUndo } from "@/data/undo";
import { Source } from "./q2531-a";

export default function Q2531b() {
  const toast = useToast();
  useEffect(() => {
    toast.show("Цены обновлены: 1 позиция", markUndo(() => true));
  }, [toast]);
  return (
    <Screen title="Обновить прайс" back={() => router.back()}>
      <Source />
      <StatusNote tone="ok">Применено Nov 25, 2026 · 1 позиция</StatusNote>
      <GroupedList>
        <ListGroup title="Обновлено" count={1}>
          <GroupRow title="Downspout 2×3" subtitle="Клиенту $2.16 → $2.38 · +10 %" value="$2.38" />
        </ListGroup>
        <ListGroup title="Загрузка целиком">
          <GroupRow title="Отменить загрузку" subtitle="Можно до Dec 25, 2026 (30 дней)" chevron onPress={() => undefined} />
        </ListGroup>
      </GroupedList>
    </Screen>
  );
}
