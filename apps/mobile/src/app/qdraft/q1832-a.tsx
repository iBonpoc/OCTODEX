// ЧЕРНОВИК (#1832, после 1.0, вариант «б»): сотрудник — строка ниже минимальной наценки и «Попросить согласие». Не для влития.
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { Screen } from "@/ui/surfaces";
import { ListGroup, GroupRowBody } from "@/ui/groupedList";
import { StatusNote } from "@/ui/statusNote";
import { Banner } from "@/ui/banner";
import { ActionBar } from "@/ui/actionBar";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";

export default function Q1832a() {
  return (
    <Screen
      title="EST-1042"
      subtitle="Sarah Mitchell · Seamless gutters"
      back={() => router.back()}
      
    >
      <Banner tone="warn" title="Цена ниже минимальной — нужно согласие владельца" hint="Смета уйдёт клиенту, когда владелец разрешит" />
      <ListGroup title="Позиции" count={3}>
        <GroupRowBody title="Seamless gutter 5″ K-style" subtitle="120 ft × $8.10" value="$972.00" wrap below={<View style={{ marginTop: space[1] }}><StatusNote tone="warn">Ниже наценки 20 % · не хватает $42</StatusNote></View>} />
        <GroupRowBody title="Downspout 2×3" subtitle="40 ft × $7.25" value="$290.00" wrap />
        <GroupRowBody title="Elbow 2×3" subtitle="8 ea × $1.00" value="$8.00" wrap below={<View style={{ marginTop: space[1] }}><StatusNote tone="bad">в минус · ниже себестоимости</StatusNote></View>} />
      </ListGroup>
      <T v="caption" tone="mut">
        Жёлтое — ниже минимальной наценки. Красное — в минус, ниже себестоимости.
      </T>
    {/* в настоящем экране — закреплено внизу (ActionBar); черновой маршрут не в NO_TAB_BAR, поэтому стоит в конце страницы */}
      <ActionBar
          summary={<T v="caption" tone="mut" tabular>Итого $2,118.00</T>}
          second={<Button size="bar" full variant="secondary" label="Сохранить" onPress={() => undefined} />}
          main={<Button size="bar" full label="Попросить согласие" icon="send" onPress={() => undefined} />}
        />
    </Screen>
  );
}
