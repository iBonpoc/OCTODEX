// ЧЕРНОВИК (#2533): после записи наличных — квитанция (с «Отменить оплату», как сейчас) и подсказка про форму IRS 8300. Не для влития.
import { Linking, View } from "react-native";
import { space } from "@octo/design-tokens";
import { Card, RowView } from "@/ui/surfaces";
import { Sheet } from "@/ui/overlays";
import { Button } from "@/ui/controls";
import { ButtonPair } from "@/ui/pairs";
import { StatusNote } from "@/ui/statusNote";
import { Icon, T } from "@/ui/primitives";
import { useTheme } from "@/theme/ThemeProvider";
import { InvoiceBehind } from "./q2533-a";

export default function Q2533b() {
  const { c } = useTheme();
  return (
    <>
      <InvoiceBehind />
      <Sheet
        visible
        onClose={() => undefined}
        title="Квитанция RCT-0213"
        footer={<ButtonPair main={{ label: "Отправить клиенту", icon: "send", onPress: () => undefined }} second={{ label: "Готово", onPress: () => undefined }} />}
      >
        <View style={{ gap: space[3] }}>
          <Card status="ok">
            <RowView gap={space[2]}>
              <Icon name="check" color={c.status.ok.text} />
              <T v="heading" tone="ok">Оплата записана</T>
            </RowView>
            <T v="display" tabular>$4,000.00</T>
            <T v="caption" tone="mut">Наличные · RCT-0213 · Nov 25, 2026</T>
            <T v="caption" tone="mut">Осталось $3,200.00</T>
          </Card>
          <StatusNote tone="info">Наличные больше $10,000 по этой работе ($10,400) — подайте форму IRS 8300 в течение 15 дней</StatusNote>
          <View style={{ alignSelf: "flex-start" }}>
            <Button label="Что это?" icon="help" variant="ghost" size="sm" onPress={() => void Linking.openURL("https://www.irs.gov/forms-pubs/about-form-8300")} />
          </View>
          <T v="caption" tone="mut">Подсказка — не юридическая консультация.</T>
          <View style={{ alignSelf: "flex-start" }}>
            <Button label="Отменить оплату" icon="undo" variant="ghost" size="sm" onPress={() => undefined} />
          </View>
        </View>
      </Sheet>
    </>
  );
}
