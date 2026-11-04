import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { InvoicesBoard } from "@/features/boards";
import type { Invoice, PaymentMethod } from "@/data/types";
import { useI18n } from "@/i18n";
import { Button, Segmented, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, CardList, Divider, Empty, ItemCard, ListRow, Screen, SectionTitle } from "@/ui/surfaces";

/** Owner's money view: overdue → awaiting → paid. Manual payments now, Stripe in wave 4. */
export default function Money() {
  const { t, money, day } = useI18n();
  const { db } = useStore();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <Screen title={t("money.title")} help={t("help.money")} hintKey="money" back={back}>
      <InvoicesBoard />
      {db.expenses.length ? (
        <View style={{ gap: space[2] }}>
          <SectionTitle title={`${t("money.expenses")} · ${money(db.expenses.reduce((s, x) => s + x.amountCents, 0))}`} />
          <CardList>
            {db.expenses.map((x, n) => (
              <View key={x.id}>
                <ItemCard
                  title={x.vendor}
                  subtitle={`${t(`exp.cat.${x.category}`)} · ${day(x.at)}${x.jobId ? ` · ${db.jobs.find((j) => j.id === x.jobId)?.title ?? ""}` : ""}`}
                  right={<T v="body" w="semibold" tabular>{money(x.amountCents)}</T>}
                />
              </View>
            ))}
          </CardList>
        </View>
      ) : null}
    </Screen>
  );
}
