// ЧЕРНОВИК (#2364, вариант «а» — 52): две строки (название + «кол-во × цена»), сумма справа, высота rowMin+поля.
// Своего пропа `dense` у GroupRowBody нет — ближайшее: ListRow (minHeight = size.rowMin) с отступом слева. Не для влития.
import { View } from "react-native";
import { size, space } from "@octo/design-tokens";
import { RowView, ListRow } from "@/ui/surfaces";
import { T } from "@/ui/primitives";
import { EstimateFrame, LINES, Tail } from "./q2364-c";

export default function Q2364a() {
  return (
    <EstimateFrame caption="Вариант «а»: строка 52 — видно на 1 позицию больше, цена за единицу на месте">
      {LINES.map((l) => (
        <RowView key={l.id} gap={0} style={{ paddingLeft: space[4], paddingRight: space[2] }}>
          <View style={{ flex: 1 }}>
            <ListRow title={l.name} subtitle={l.times} minHeight={size.rowMin} right={<T v="body" tabular>{l.sum}</T>} />
          </View>
          <View style={{ marginLeft: space[3] }}>
            <Tail grip />
          </View>
        </RowView>
      ))}
    </EstimateFrame>
  );
}
