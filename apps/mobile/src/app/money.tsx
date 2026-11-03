import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Invoice, PaymentMethod } from "@/data/types";
import { useI18n } from "@/i18n";
import { Button, Segmented, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Divider, Empty, ListRow, Screen, SectionTitle } from "@/ui/surfaces";

/** Owner's money view: overdue → awaiting → paid. Manual payments now, Stripe in wave 4. */
export default function Money() {
  const { t, money, day } = useI18n();
  const { db, payInvoice, online } = useStore();
  const toast = useToast();
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("card");
  const now = Date.now();
  const open = db.invoices.filter((i) => i.paidCents < i.totalCents);
  const overdue = open.filter((i) => new Date(i.dueDate).getTime() < now).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const awaiting = open.filter((i) => new Date(i.dueDate).getTime() >= now);
  const paid = db.invoices.filter((i) => i.paidCents >= i.totalCents).sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));
  const name = (i: Invoice) => db.customers.find((c) => c.id === i.customerId)?.name ?? "";
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const section = (title: string, list: Invoice[], kind: "bad" | "warn" | "ok") =>
    list.length ? (
      <View style={{ gap: space[2] }}>
        <SectionTitle title={`${title} · ${money(list.reduce((s, i) => s + (kind === "ok" ? i.paidCents : i.totalCents - i.paidCents), 0))}`} />
        <Card>
          {list.map((i, n) => (
            <View key={i.id}>
              {n > 0 ? <Divider /> : null}
              <ListRow
                title={name(i)}
                subtitle={`${i.kind === "deposit" ? `${t("money.deposit")} · ` : ""}${
                  kind === "ok" && i.paidAt ? t("money.paidOn", { date: day(i.paidAt) }) : t("money.due", { date: day(i.dueDate) })
                }`}
                right={
                  kind === "ok" ? (
                    <StatusChip status="ok" label={money(i.paidCents)} />
                  ) : (
                    <Button label={money(i.totalCents - i.paidCents)} size="sm" variant={kind === "bad" ? "primary" : "secondary"} onPress={() => setPaying(i)} />
                  )
                }
              />
            </View>
          ))}
        </Card>
      </View>
    ) : null;

  return (
    <Screen title={t("money.title")} help={t("help.money")} back={back}>
      {db.invoices.length === 0 ? <Empty icon="invoice" title={t("money.empty")} /> : null}
      {section(t("money.overdue"), overdue, "bad")}
      {section(t("money.awaiting"), awaiting, "warn")}
      {section(t("money.paid"), paid, "ok")}
      <Sheet visible={!!paying} onClose={() => setPaying(null)} title={paying ? `${t("money.receive")}: ${name(paying)}` : ""}>
        {paying ? (
          <View style={{ gap: space[3] }}>
            <T v="display" tabular>
              {money(paying.totalCents - paying.paidCents)}
            </T>
            <Segmented
              full
              value={method}
              onChange={setMethod}
              items={[
                { key: "card", label: t("visit.payCard") },
                { key: "cash", label: t("visit.payCash") },
                { key: "check", label: t("visit.payCheck") },
                { key: "zelle", label: t("visit.payZelle") },
              ]}
            />
            <Button
              label={t("visit.recordPayment")}
              icon="dollar"
              full
              onPress={() => {
                const amount = money(paying.totalCents - paying.paidCents);
                const undo = payInvoice(paying.id, method);
                setPaying(null);
                toast.show(online ? t("toast.paid", { amount }) : t("offline.queued"), undo);
              }}
            />
            <Button
              label={t("money.remind")}
              icon="bell"
              variant="secondary"
              full
              onPress={() => {
                const n = name(paying);
                setPaying(null);
                toast.show(t("toast.reminded", { name: n }));
              }}
            />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
