/**
 * The supplier orders of a job (docs/specs/37 §6), on the job's «Детали»: the office makes the drafts («Заказ
 * поставщику» — one per supplier, in packs; a second tap opens the open draft); everybody who sees the job sees its
 * orders as compact cards (the tech: where to pick up, no prices). The order itself — /purchase-order/[id].
 */
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Job } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { canEditOrders, ordersOfJob, PO_TONE, receivedCount } from "./purchaseOrders";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { CardGrid, ListCard } from "@/ui/listCard";
import { SectionTitle } from "@/ui/surfaces";

export function JobOrdersBlock({ job }: { job: Job }) {
  const store = useStore();
  const { db, role } = store;
  const { t } = useI18n();
  const toast = useToast();
  const orders = ordersOfJob(db, job.id).filter((o) => o.status !== "cancelled");
  const office = canEditOrders(role) && !db.purchaseOrdersLegacy;
  if (!office && !orders.length) return null;
  const make = () => {
    const { ids, undo } = store.makeJobOrders(job.id);
    if (!ids.length) {
      toast.show(t("po.jobNone"));
      return;
    }
    toast.show(t("po.made", { n: ids.length }), undo);
    if (ids.length === 1) router.push(`/purchase-order/${ids[0]}`);
  };
  return (
    <View style={{ gap: space[2] }} testID="job-orders">
      <SectionTitle
        title={t("po.jobBlock")}
        right={office && job.status !== "done" ? (
          <View testID="job-orders-make">
            <Button label={t("po.order")} icon="truck" size="sm" variant="ghost" onPress={make} />
          </View>
        ) : undefined}
      />
      {orders.length ? (
        <CardGrid>
          {orders.map((o) => {
            const name = (db.suppliers ?? []).find((s) => s.id === o.supplierId)?.name ?? o.supplierName ?? t("po.noSupplier");
            return (
              <ListCard
                key={o.id}
                density="compact"
                testID={`job-po-${o.id}`}
                lead={{ kind: "icon", icon: "truck" }}
                title={name}
                when={[o.number, o.status === "draft" ? undefined : t("po.receivedOf", { done: receivedCount(o), n: o.lines.length })].filter(Boolean).join(" · ")}
                status={{ tone: PO_TONE[o.status], label: t(`po.status.${o.status}` as DictKey) }}
                onPress={() => router.push(`/purchase-order/${o.id}`)}
              />
            );
          })}
        </CardGrid>
      ) : (
        <T v="caption" tone="mut">{t("po.empty")}</T>
      )}
    </View>
  );
}
