import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { component, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { InvoiceCardBody } from "@/features/invoice/InvoiceCard";
import { Empty, Screen } from "@/ui/surfaces";
import { canSeeInvoice } from "@/features/access";
import { VoidInvoiceBody } from "@/features/invoice/VoidInvoice";
import { useDevice } from "@/theme/ThemeProvider";

/** Invoice: amount, paid, balance; take a payment (any part); receipts; send / PDF (body — features/invoice/InvoiceCard). */
export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, role, mode } = useStore();
  const { t } = useI18n();
  const { wide, device } = useDevice();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/money"));
  // В1-5: a voided invoice opens too — marked, with its reason, outside every sum
  const live = db.invoices.find((i) => i.id === id);
  const inv = live ?? (db.voidInvoices ?? []).find((i) => i.id === id);
  if (!inv)
    return (
      <Screen title={t("inv.title")} back={back}>
        <Empty icon="invoice" title={t("clients.empty")} />
      </Screen>
    );
  // not the tech's (#868): no access, as the server would answer
  if (!canSeeInvoice(db, { role, mode, me: db.me }, inv.id))
    return (
      <Screen title={t("inv.title")} back={back}>
        <Empty icon="invoice" title={t("mny.noAccess")} testID="no-access" />
      </Screen>
    );
  const cust = db.customers.find((c) => c.id === inv.customerId);
  const title = `${t("inv.title")} ${inv.number ?? ""}`.trim();
  if (!live)
    return (
      <Screen testID="invoice-screen" title={title} back={back} subtitle={cust?.name}>
        <VoidInvoiceBody inv={inv} />
      </Screen>
    );
  // LAYOUT-RULES §3 «Объект» (#2350): the client is a link in the card's first line (not a second time under the title); «⋯» — only
  // «Аннулировать…»; «Принять оплату · $X» (or «Отправить») pinned at the bottom on a phone, after the money from 820
  return (
    <InvoiceCardBody
      inv={live}
      inline={wide}
      frame={({ more, bar, body, head, summary, rest }) =>
        device === "desktop" ? (
          // desktop (DS §12.3 «Десктоп», #1495 Б): the receipts on the left, the summary — status, money, the main action — in the
          // side column 360 on the right, as on the client's card (#1416)
          <Screen testID="invoice-screen" title={title} back={back} right={more}>
            {head}
            <View style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: space[6] }}>
              <View testID="invoice-side" style={{ width: component.panelW, gap: space[3] }}>
                {summary}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: space[3] }}>{rest}</View>
            </View>
          </Screen>
        ) : (
          <Screen testID="invoice-screen" title={title} back={back} right={more} footer={bar ?? undefined}>
            {body}
          </Screen>
        )
      }
    />
  );
}
