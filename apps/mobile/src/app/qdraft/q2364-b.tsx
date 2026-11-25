// ЧЕРНОВИК (#2364, вариант «б» — 48): одна строка — название слева, сумма справа, без «кол-во × цена». Не для влития.
import { View } from "react-native";
import { size, space } from "@octo/design-tokens";
import { RowView, ListRow } from "@/ui/surfaces";
import { T } from "@/ui/primitives";
import { EstimateFrame, LINES, Tail } from "./q2364-c";

export default function Q2364b() {
  return (
    <EstimateFrame caption="Вариант «б»: строка 48 — видно на 2 позиции больше, но цены за единицу не видно">
      {LINES.map((l) => (
        <RowView key={l.id} gap={0} style={{ paddingLeft: space[4], paddingRight: space[2] }}>
          <View style={{ flex: 1 }}>
            <ListRow title={l.name} minHeight={size.rowMin} right={<T v="body" tabular>{l.sum}</T>} />
          </View>
          <View style={{ marginLeft: space[3] }}>
            <Tail grip />
          </View>
        </RowView>
      ))}
    </EstimateFrame>
  );
}
