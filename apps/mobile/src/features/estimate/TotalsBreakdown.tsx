import { View } from "react-native";
import { size, space } from "@octo/design-tokens";
import { useI18n, type DictKey } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, T } from "@/ui/primitives";
import { Divider, RowView } from "@/ui/surfaces";
import type { TotalsRow } from "./totalsRows";

const LABEL: Record<TotalsRow["key"], DictKey> = {
  subtotal: "ue.subtotal",
  discount: "ue.discount",
  tax: "ue.tax",
  total: "ue.total",
  deposit: "ue.deposit",
  ifAll: "est.tot.ifAll",
  cost: "est.tot.cost",
  profit: "est.tot.profit",
};

function Row({ r }: { r: TotalsRow }) {
  const { t, money } = useI18n();
  const { c } = useTheme();
  const big = r.key === "total";
  const value =
    r.cents === null
      ? "—"
      : r.key === "discount"
        ? `−${money(r.cents)}`
        : r.key === "profit" && r.pct !== null
          ? `${money(r.cents)} · ${r.pct} %`
          : money(r.cents);
  return (
    <View testID={`est-tot-${r.key}`}>
      <RowView style={{ justifyContent: "space-between", alignItems: "flex-start", gap: space[2] }}>
        <T v={big ? "body" : "caption"} w={big ? "semibold" : undefined} tone={big ? "ink" : "mut"} style={{ flex: 1 }}>
          {t(LABEL[r.key])}
        </T>
        {/* profit in the red — the icon and the word, `bad` (rule 2); a profit above zero has no colour */}
        {r.key === "profit" && r.loss ? (
          <RowView style={{ gap: space[1] }}>
            <Icon name="alert" s={size.iconSm} color={c.status.bad.text} />
            <T v="caption" tone="bad" tabular>
              {`${t("est.tot.loss")} ${value}`}
            </T>
          </RowView>
        ) : (
          <T v={big ? "body" : "caption"} w={big ? "semibold" : undefined} tabular>
            {value}
          </T>
        )}
      </RowView>
    </View>
  );
}

/** the rows of «Итого ˅» (DS §8.9): the client's part, then «Только для вас» (cost, profit) for who may see it */
export function TotalsBreakdown({ client, own, testID }: { client: TotalsRow[]; own: TotalsRow[]; testID?: string }) {
  const { t } = useI18n();
  return (
    <View testID={testID} style={{ gap: space[1] }}>
      {client.map((r) => (
        <Row key={r.key} r={r} />
      ))}
      {own.length ? (
        <View testID="est-tot-own" style={{ gap: space[1] }}>
          <Divider />
          <T v="caption" w="semibold" tone="mut">
            {t("est.tot.own")}
          </T>
          {own.map((r) => (
            <Row key={r.key} r={r} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
