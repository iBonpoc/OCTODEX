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
  // a loss reads «в минус $200 · 16.7 %» — the word carries the sign, no second minus
  const loss = r.key === "profit" && r.loss;
  const amount = (c: number) => money(loss ? Math.abs(c) : c);
  const pct = r.key === "profit" && r.pct !== null ? (loss ? r.pct.replace(/^-/, "") : r.pct) : null;
  const value = r.cents === null ? "—" : r.key === "discount" ? `−${money(r.cents)}` : pct !== null ? `${amount(r.cents)} · ${pct}%` : amount(r.cents);
  return (
    <View testID={`est-tot-${r.key}`}>
      <RowView style={{ justifyContent: "space-between", alignItems: "flex-start", gap: space[2] }}>
        <T v={big ? "body" : "caption"} w={big ? "semibold" : undefined} tone={big ? "ink" : "mut"} style={{ flex: 1 }}>
          {t(LABEL[r.key])}
        </T>
        {/* profit in the red — the icon and the word, `bad` (rule 2); a profit above zero has no colour */}
        {loss ? (
          <RowView style={{ gap: space[1] }}>
            <Icon name="alert" s={size.iconSm} color={c.status.bad.text} />
            <T v="caption" tone="bad" tabular>
              {`${t("est.row.loss")} ${value}`}
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

/** «Только для вас» (cost, profit): its own heading with a mark, set apart */
function Own({ own }: { own: TotalsRow[] }) {
  const { t } = useI18n();
  const { c } = useTheme();
  if (!own.length) return null;
  return (
    <View testID="est-tot-own" style={{ gap: space[1] }}>
      <RowView style={{ gap: space[1] }}>
        <Icon name="eyeOff" s={size.iconSm} color={c.mut} />
        <T v="caption" w="semibold" tone="mut">
          {t("est.tot.own")}
        </T>
      </RowView>
      {own.map((r) => (
        <Row key={r.key} r={r} />
      ))}
    </View>
  );
}

/**
 * The rows of «Итого ˅» (DS §8.9). `panel` — above the panel's «Итого» line, read like a receipt from the bottom up: the
 * parts of the total right above it (subtotal, discount, tax), then the deposit and «если клиент включит…», then «Только
 * для вас»; else (the totals card, under its own rows) — the given rows, then «Только для вас».
 */
export function TotalsBreakdown({ client, own, testID, panel }: { client: TotalsRow[]; own: TotalsRow[]; testID?: string; panel?: boolean }) {
  const parts = client.filter((r) => r.key === "subtotal" || r.key === "discount" || r.key === "tax");
  const rest = client.filter((r) => r.key === "deposit" || r.key === "ifAll");
  if (panel)
    return (
      <View testID={testID} style={{ gap: space[1] }}>
        <Own own={own} />
        {own.length && rest.length ? <Divider /> : null}
        {rest.map((r) => (
          <Row key={r.key} r={r} />
        ))}
        {(own.length || rest.length) && parts.length ? <Divider /> : null}
        {parts.map((r) => (
          <Row key={r.key} r={r} />
        ))}
      </View>
    );
  return (
    <View testID={testID} style={{ gap: space[1] }}>
      {client.map((r) => (
        <Row key={r.key} r={r} />
      ))}
      {own.length && client.length ? <Divider /> : null}
      <Own own={own} />
    </View>
  );
}
