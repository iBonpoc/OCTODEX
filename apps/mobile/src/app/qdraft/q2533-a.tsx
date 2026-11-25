// ЧЕРНОВИК (#2533): шторка «Принять оплату», договор CA до начала работ — подсказка о пределе депозита. Не для влития.
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { Screen, Card, ListRow } from "@/ui/surfaces";
import { Sheet } from "@/ui/overlays";
import { Button, Segmented, TextField } from "@/ui/controls";
import { StatusNote } from "@/ui/statusNote";
import { T } from "@/ui/primitives";

export function InvoiceBehind() {
  return (
    <Screen title="INV-1042" subtitle="Sarah Mitchell · Seamless gutters" back={() => router.back()}>
      <Card>
        <ListRow title="Сумма счёта" subtitle="Договор CA Home Improvement" right={<T v="heading" tabular>$8,000.00</T>} chevron={false} />
      </Card>
    </Screen>
  );
}

export default function Q2533a() {
  const [way, setWay] = useState<"tap" | "cash" | "check" | "zelle">("cash");
  const [quick, setQuick] = useState<"all" | "dep">("dep");
  const [amt, setAmt] = useState("800.00");
  return (
    <>
      <InvoiceBehind />
      <Sheet
        visible
        onClose={() => undefined}
        title="Принять оплату"
        footer={<Button label="Записать $800.00" icon="check" size="bar" full onPress={() => undefined} />}
      >
        <View style={{ gap: space[4] }}>
          <T v="caption" tone="mut" numberOfLines={1}>
            INV-1042 · Sarah Mitchell
          </T>
          <View style={{ gap: space[2] }}>
            <TextField type="money" big prefix="$" label="Сумма" value={amt} onChangeText={setAmt} />
            <Segmented full equal radio label="Быстрые суммы" value={quick} onChange={setQuick} items={[{ key: "all", label: "Всё" }, { key: "dep", label: "Депозит" }]} />
            <StatusNote tone="warn">В Калифорнии до начала работ — не больше $1,000 или 10 % (сейчас $800)</StatusNote>
            <T v="caption" tone="mut">из $8,000.00 к оплате</T>
          </View>
          <Segmented radio full label="Способ" value={way} onChange={setWay} items={[{ key: "tap", label: "Tap to Pay" }, { key: "cash", label: "Наличные" }, { key: "check", label: "Чек" }, { key: "zelle", label: "Zelle" }]} />
        </View>
      </Sheet>
    </>
  );
}
