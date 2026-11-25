// ЧЕРНОВИК (#1832, после 1.0, вариант «б»): владелец — пункт «Требует внимания» и окно «Разрешить». Не для влития.
import { useState } from "react";
import { router } from "expo-router";
import { Screen, SectionTitle } from "@/ui/surfaces";
import { ListGroup, GroupRow, GroupedList } from "@/ui/groupedList";
import { ConfirmDialog, type ConfirmAsk } from "@/ui/confirmDialog";

const ASK: ConfirmAsk = {
  title: "Разрешить цену ниже наценки?",
  text: "EST-1042 · Sarah Mitchell. Не хватает $42 до наценки 20 %. Просит Мария Лопес.",
  actions: [
    { key: "no", label: "Не разрешать", tone: "cancel" },
    { key: "yes", label: "Разрешить", tone: "primary" },
  ],
};

export default function Q1832b() {
  const [ask, setAsk] = useState<ConfirmAsk | null>(ASK);
  return (
    <Screen title="Требует внимания" back={() => router.back()}>
      <SectionTitle title="Нужно ваше решение" />
      <GroupedList>
        <ListGroup>
          <GroupRow lead={{ initials: "SM" }} title="Sarah Mitchell" subtitle="Смета EST-1042 · ниже наценки · не хватает $42" status={{ status: "warn", label: "Согласие" }} onPress={() => setAsk(ASK)} />
          <GroupRow lead={{ initials: "DK" }} title="David Kim" subtitle="Счёт просрочен на 9 дн" value="$1,840" onPress={() => undefined} />
        </ListGroup>
      </GroupedList>
      <ConfirmDialog ask={ask} onPick={() => setAsk(null)} />
    </Screen>
  );
}
