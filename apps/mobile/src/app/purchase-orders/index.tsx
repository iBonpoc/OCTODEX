/**
 * «Ещё → Заказы поставщикам» (docs/specs/37 §6): every order of the company as a card — number, supplier, job, status,
 * how much came. Owner, admin, office (nav/roles.ts; the tech sees the orders of his jobs on the job). «Новый заказ» —
 * an empty order for stock.
 */
import { useMemo, useState } from "react";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import type { PurchaseOrder } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { uid } from "@/features/estimateDoc";
import { PO_TONE, receivedCount } from "@/features/purchaseOrders";
import { Button } from "@/ui/controls";
import { FilterBar } from "@/ui/filterBar";
import { filterStoreKey } from "@/ui/filterBarRules";
import { usePersistentState } from "@/data/persist";
import { CardList, Empty, Screen } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";
import { useDevice } from "@/theme/ThemeProvider";

type Lane = "open" | "done";
const OPEN = new Set(["draft", "sent", "partially_received"]);

export default function PurchaseOrders() {
  const store = useStore();
  const { db } = store;
  const { t, day } = useI18n();
  const { device } = useDevice();
  const [q, setQ] = useState("");
  const [kept, setLane] = usePersistentState<Lane>(`${filterStoreKey("purchase-orders")}.lane`, "open");
  const lane: Lane = kept === "done" ? "done" : "open";
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  const all = db.purchaseOrders ?? [];
  const supName = (o: PurchaseOrder) => (db.suppliers ?? []).find((s) => s.id === o.supplierId)?.name ?? o.supplierName;
  const jobOf = (o: PurchaseOrder) => (o.jobId ? db.jobs.find((j) => j.id === o.jobId) : undefined);
  const list = useMemo(
    () =>
      all
        .filter((o) => (lane === "open" ? OPEN.has(o.status) : !OPEN.has(o.status)))
        .filter((o) => !q.trim() || [o.number, supName(o), jobOf(o)?.title, jobOf(o)?.number].some((w) => (w ?? "").toLowerCase().includes(q.trim().toLowerCase())))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, lane, q, db.suppliers, db.jobs],
  );
  const newOrder = () => {
    const id = uid();
    store.savePurchaseOrder({ id, status: "draft", revision: 0, fulfillment: "delivery", printPrices: false, createdAt: new Date().toISOString(), lines: [] });
    router.push(`/purchase-order/${id}`);
  };
  const card = (o: PurchaseOrder) => {
    const job = jobOf(o);
    return (
      <ListCard
        key={o.id}
        testID={`po-card-${o.id}`}
        title={o.number ?? t("po.noNumber")}
        lead={{ kind: "icon", icon: "truck" }}
        status={{ tone: PO_TONE[o.status], label: t(`po.status.${o.status}` as DictKey) }}
        facts={{
          supplier: supName(o) ?? t("po.noSupplier"),
          work: job ? [job.number, job.title].filter(Boolean).join(" · ") : t("po.stock"),
          due: o.neededOn ? day(`${o.neededOn}T12:00:00Z`) : undefined,
          lines: o.status === "draft" || o.status === "cancelled" ? undefined : t("po.receivedOf", { done: receivedCount(o), n: o.lines.length }),
        }}
        onPress={() => router.push(`/purchase-order/${o.id}`)}
      />
    );
  };
  return (
    <Screen
      title={t("po.title")}
      back={back}
      help={t("po.help")}
      right={<Button label={t("po.new")} icon="plus" size="sm" variant="secondary" onPress={newOrder} />}
    >
      <FilterBar<Lane>
        search={{ value: q, onChange: setQ, placeholder: t("po.title") }}
        value={lane}
        onChange={setLane}
        items={[
          { key: "open", label: t("po.f.open"), count: all.filter((o) => OPEN.has(o.status)).length },
          { key: "done", label: t("po.f.done"), count: all.filter((o) => !OPEN.has(o.status)).length },
        ]}
      />
      {list.length === 0 ? <Empty icon="truck" title={t("po.empty")} /> : device === "phone" ? <CardList>{list.map(card)}</CardList> : <CardGrid>{list.map(card)}</CardGrid>}
    </Screen>
  );
}
