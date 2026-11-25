// ЧЕРНОВИК (#2364, вариант «а» — 52): две строки (название в одну строку + «кол-во × цена»), сумма справа, поля spaceHalf.tight 6.
// Пропа `dense` у GroupRowBody ещё нет (мини-спека п.4) — здесь та же раскладка собрана из T + RowView на токенах. Не для влития.
import { View } from "react-native";
import { space, spaceHalf } from "@octo/design-tokens";
import { RowView } from "@/ui/surfaces";
import { T } from "@/ui/primitives";
import { EstimateFrame, LINES, Tail } from "./q2364-c";

export default function Q2364a() {
  return (
    <EstimateFrame caption="Вариант «а»: строка 52 — те же две строки, меньше воздуха сверху и снизу">
      {LINES.map((l) => (
        <RowView key={l.id} gap={space[3]} style={{ paddingLeft: space[4], paddingRight: space[2], paddingVertical: spaceHalf.tight }}>
          <View style={{ flex: 1 }}>
            <T v="body" w="semibold" numberOfLines={1}>
              {l.name}
            </T>
            <T v="caption" tone="mut" tabular numberOfLines={1}>
              {l.times}
            </T>
          </View>
          <T v="body" tabular>
            {l.sum}
          </T>
          <Tail grip />
        </RowView>
      ))}
    </EstimateFrame>
  );
}
