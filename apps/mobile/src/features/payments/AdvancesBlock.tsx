/**
 * A client's advances on the client card (docs/specs/35-stripe.md §4г): money of this client that came without an invoice
 * and waits for the owner (apply to an invoice or refund — on the receipt). Linked objects on an object's screen —
 * ListCard compact (rule 12). Shown only to whom the client's money is shown (the caller checks canSeeClientMoney).
 */
import { router } from "expo-router";
import { useStore } from "@/data/store";
import type { ID } from "@/data/types";
import { useI18n } from "@/i18n";
import { ListCard } from "@/ui/listCard";
import { CardList, SectionTitle } from "@/ui/surfaces";

export function AdvancesBlock({ customerId }: { customerId: ID }) {
  const { db } = useStore();
  const { t, money, day } = useI18n();
  const mine = (db.advances ?? []).filter((a) => a.customerId === customerId);
  if (!mine.length) return null;
  return (
    <>
      <SectionTitle title={t("mny.adv.blockTitle")} />
      <CardList>
        {mine.map((a) => (
          <ListCard
            key={a.id}
            density="compact"
            testID={`client-advance-${a.id}`}
            lead={{ kind: "icon", icon: "wallet" }}
            title={t("mny.adv.label")}
            when={[day(a.at), a.receiptNumber].filter(Boolean).join(" · ")}
            value={money(a.amountCents)}
            status={{ tone: "warn", label: t("mny.adv.chip") }}
            onPress={() => router.push(`/receipt/${a.id}`)}
          />
        ))}
      </CardList>
    </>
  );
}
