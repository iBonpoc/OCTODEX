// ЧЕРНОВИК (#586): заказ поставщику — «Отправить поставщику» открывает шторку «Как отправить заказ?». Не для влития.
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { Screen, Divider, ListRow } from "@/ui/surfaces";
import { ListGroup, GroupRow } from "@/ui/groupedList";
import { ActionBar } from "@/ui/actionBar";
import { Button } from "@/ui/controls";
import { Sheet } from "@/ui/overlays";
import { Icon, T } from "@/ui/primitives";

export function OrderBehind() {
  return (
    <Screen
      footer={<ActionBar main={<Button size="bar" full label="Отправить поставщику" icon="send" onPress={() => undefined} />} />}
      title="PO-0007"
      subtitle="Home Depot · Seamless gutters"
      back={() => router.back()}
      
    >
      <ListGroup title="Позиции" count={3} inset={space[4]}>
        <GroupRow title="Hidden hanger 5″" subtitle="SKU 100123456" value="12 ea" />
        <GroupRow title="Downspout 2×3 10′" subtitle="SKU 100234567" value="4 pcs" />
        <GroupRow title="End cap 5″" subtitle="SKU 100345678" value="8 ea" />
      </ListGroup>
      <ListGroup title="Доставка" inset={space[4]}>
        <GroupRow title="1420 Oak St, Pasadena, CA" subtitle="Nov 27, 2026" />
      </ListGroup>
    </Screen>
  );
}

export default function Q586a() {
  return (
    <>
      <OrderBehind />
      <Sheet visible onClose={() => undefined} title="Как отправить заказ?">
        <View style={{ gap: 0 }}>
          <ListRow left={<Icon name="invoice" />} title="Отправить PDF-заказ" subtitle="Почта, сообщения, файлы" onPress={() => undefined} />
          <Divider />
          <ListRow left={<Icon name="sms" />} title="Отправить текстом" subtitle="Список позиций одним сообщением" onPress={() => undefined} />
          <Divider />
          <ListRow left={<Icon name="phone" />} title="Позвонить поставщику" subtitle="(555) 010-0100 · после звонка спросим, принят ли заказ" lines={2} onPress={() => undefined} />
          <T v="caption" tone="mut">Поставщику — всегда на английском. Цены в заказе не печатаем.</T>
        </View>
      </Sheet>
    </>
  );
}
