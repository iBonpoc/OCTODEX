// ЧЕРНОВИК (#586): образец текста заказа на английском (откроется «Поделиться» / «Сообщения»). Не для влития.
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { Screen, Card, SectionTitle } from "@/ui/surfaces";
import { T } from "@/ui/primitives";

const TEXT = [
  "PO-0007 · Bright Gutters",
  "Deliver to: 1420 Oak St, Pasadena, CA",
  "Needed by: Nov 27, 2026",
  "",
  "12 ea — Hidden hanger 5\" (SKU 100123456)",
  "4 pcs — Downspout 2x3 10' (SKU 100234567)",
  "8 ea — End cap 5\" (SKU 100345678)",
  "",
  "Questions: (626) 555-0100",
];

export default function Q586b() {
  return (
    <Screen title="PO-0007" subtitle="Home Depot · Seamless gutters" back={() => router.back()}>
      <SectionTitle title="Откроется «Сообщения» с текстом" />
      <Card inner>
        <View style={{ gap: space[1] }}>
          {TEXT.map((l, i) => (
            <T key={i} v="body" tabular>
              {l || " "}
            </T>
          ))}
        </View>
      </Card>
      <T v="caption" tone="mut">Заказ поставщику — всегда на английском. Статус станет «Отправлен».</T>
    </Screen>
  );
}
