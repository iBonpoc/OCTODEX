// ЧЕРНОВИК (#2364, вариант «в» — как сейчас): свёрнутая строка сметы = GroupRowBody (min 56) + корзина. Не для влития.
import { View } from "react-native";
import { router } from "expo-router";
import { size, space } from "@octo/design-tokens";
import { Screen, RowView } from "@/ui/surfaces";
import { ListGroup, GroupRowBody } from "@/ui/groupedList";
import { IconButton } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { useTheme } from "@/theme/ThemeProvider";

export const LINES = [
  { id: "1", name: "Seamless gutter 5″ K-style", times: "120 ft × $9.50", sum: "$1,140.00" },
  { id: "2", name: "Downspout 2×3", times: "40 ft × $7.25", sum: "$290.00" },
  { id: "3", name: "Hidden hanger", times: "60 ea × $2.40", sum: "$144.00" },
  { id: "4", name: "End cap", times: "8 ea × $4.00", sum: "$32.00" },
  { id: "5", name: "Outlet 2×3", times: "4 ea × $6.50", sum: "$26.00" },
  { id: "6", name: "Old gutter removal", times: "120 ft × $1.50", sum: "$180.00" },
  { id: "7", name: "Gutter guard", times: "120 ft × $6.00", sum: "$720.00" },
  { id: "8", name: "Elbow 2×3", times: "8 ea × $5.00", sum: "$40.00" },
  { id: "9", name: "Labor — install", times: "6 hr × $85.00", sum: "$510.00" },
  { id: "10", name: "Disposal fee", times: "1 ea × $45.00", sum: "$45.00" },
];

/** корзина и ручка «≡»: зоны 44, между центрами 64 (space[6] между зонами — по мини-спеке п.5) */
export function Tail({ grip }: { grip?: boolean }) {
  const { c } = useTheme();
  return (
    <RowView gap={space[5]}>
      <View style={{ width: size.hitMin, alignItems: "center" }}>
        <IconButton bare icon="trash" label="Удалить" onPress={() => undefined} />
      </View>
      {grip ? (
        <View style={{ width: size.hitMin, alignItems: "center" }}>
          <Icon name="grip" s={size.iconSm} color={c.mut} />
        </View>
      ) : null}
    </RowView>
  );
}

export function EstimateFrame({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <Screen title="EST-1042" subtitle="Sarah Mitchell · Seamless gutters" back={() => router.back()}>
      <T v="caption" tone="mut">
        {caption}
      </T>
      <ListGroup title="Позиции" count={LINES.length}>
        {children}
      </ListGroup>
    </Screen>
  );
}

export default function Q2364c() {
  return (
    <EstimateFrame caption="Как сейчас: строка ≈ 57, видно 8 позиций на экране">
      {LINES.map((l) => (
        <RowView key={l.id} gap={0} style={{ paddingRight: space[2] }}>
          <View style={{ flex: 1 }}>
            <GroupRowBody title={l.name} subtitle={l.times} value={l.sum} wrap padRight={0} ids={{ title: `row-${l.id}` }} />
          </View>
          <View style={{ marginLeft: space[6] }}>
            <Tail />
          </View>
        </RowView>
      ))}
    </EstimateFrame>
  );
}
