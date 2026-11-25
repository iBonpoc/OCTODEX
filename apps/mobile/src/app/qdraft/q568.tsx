// ЧЕРНОВИК (#568): «Сегодня» — «Получено» без аванса, под плитками подсказка «Без счёта · $50». Не для влития.
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { OverviewScreen } from "@/ui/templates";
import { StatGrid, StatTile } from "@/ui/statTile";
import { ListGroup } from "@/ui/groupedList";
import { Card, ListRow } from "@/ui/surfaces";
import { Icon } from "@/ui/primitives";
import { useTheme } from "@/theme/ThemeProvider";

export default function Q568() {
  const { c } = useTheme();
  return (
    <OverviewScreen
      testID="today"
      title="Сегодня"
      home={false}
      greeting={{ initials: "AR", text: "Доброе утро, Алекс", date: "Среда, 25 нояб.", avatarLabel: "Ещё" }}
    >
      <ListGroup title="Требует действия" bare>
        <StatGrid>
          <StatTile icon="leads" dense label="Лиды ждут ответа" value={2} />
          <StatTile icon="doc" dense label="Сметы ждут" value={3} unit="до 6 дн" />
          <StatTile icon="invoice" dense label="Должны" value="$4,320" />
          <StatTile icon="trend" dense label="Получено сегодня" value="$1,850" unit="2 оплаты" />
        </StatGrid>
      </ListGroup>
      <Card>
        <ListRow
          left={<Icon name="info" color={c.status.info.text} />}
          title="Без счёта · $50"
          subtitle="Sarah Mitchell · зачесть или вернуть"
          onPress={() => undefined}
        />
      </Card>
      <View style={{ height: space[2] }} />
    </OverviewScreen>
  );
}
