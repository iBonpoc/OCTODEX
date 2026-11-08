/**
 * A purchase order (docs/specs/37 §6). The office: the supplier, delivery or pickup, the lines (a draft or a sent order;
 * a change of a sent one is a new revision when sent again), «Отправить» (the PDF in English to share), «Отменить
 * заказ» (asked first). The tech of the job: where to pick it up, the lines without prices, «Отметить получение».
 */
import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space, component } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { PurchaseOrder, PurchaseOrderLine } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { uid } from "@/features/estimateDoc";
import { CatalogPicker } from "@/features/estimatePickers";
import { SupplierPicker } from "@/features/SupplierParts";
import { canEditOrders, canReceive, isoDate, linesEditable, orderTotalCents, packCost, PO_TONE, receivedCount, usDate } from "@/features/purchaseOrders";
import { poHtml } from "@/features/poPdf";
import { saveEstimatePdf } from "@/features/estimatePdf";
import { companyForPortal } from "@/cloud/portal";
import { QtyField } from "@/features/fields";
import { Button, ChoiceChips, IconButton, StatusChip, TextField, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Divider, Empty, ListRow, RowView, Screen } from "@/ui/surfaces";

export default function PurchaseOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db, role } = store;
  const { t, money } = useI18n();
  const toast = useToast();
  const found = (db.purchaseOrders ?? []).find((x) => x.id === id);
  const [o, setO] = useState<PurchaseOrder | undefined>(found);
  const [dateText, setDateText] = useState(() => usDate(found?.neededOn));
  const [pickSup, setPickSup] = useState(false);
  const [pickItem, setPickItem] = useState(false);
  const [askCancel, setAskCancel] = useState(false);
  const [receiving, setReceiving] = useState<Record<string, string> | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace(canEditOrders(role) ? "/purchase-orders" : "/"));
  if (!found || !o) {
    return (
      <Screen title={t("po.order")} back={back}>
        <Empty icon="truck" title={t("po.notFound")} />
      </Screen>
    );
  }
  const office = canEditOrders(role);
  const edit = office && linesEditable(found);
  const costs = db.costsVisible !== false && office;
  const job = o.jobId ? db.jobs.find((j) => j.id === o.jobId) : undefined;
  const sup = o.supplierId ? (db.suppliers ?? []).find((s) => s.id === o.supplierId) : undefined;
  const supName = sup?.name ?? o.supplierName;
  const set = (p: Partial<PurchaseOrder>) => setO((x) => (x ? { ...x, ...p } : x));
  const setLine = (lid: string, p: Partial<PurchaseOrderLine>) => set({ lines: o.lines.map((l) => (l.id === lid ? { ...l, ...p } : l)) });
  const dirty = JSON.stringify(o) !== JSON.stringify(found);
  const dateBad = !!dateText.trim() && !isoDate(dateText);
  const total = costs ? orderTotalCents(o) : undefined;
  const title = found.number ? t("po.number", { number: found.number }) : t("po.noNumber");

  const save = () => {
    toast.show(t("po.saved"), store.savePurchaseOrder(o));
  };
  const send = () => {
    if (dirty) store.savePurchaseOrder(o);
    if (!store.sendPurchaseOrder(o.id)) return;
    const after = (store.db.purchaseOrders ?? []).find((x) => x.id === o.id) ?? o;
    toast.show(t("po.sent", { name: supName ?? "" }));
    const html = poHtml(db, { ...after, ...o, status: "sent", revision: found.revision + 1, sentAt: new Date().toISOString(), supplierName: supName }, companyForPortal(db, store.companyName ?? "OCTODEX"), { lang: "en" });
    saveEstimatePdf(html, `PO ${found.number ?? ""}`.trim()).catch((e) => toast.show(t("portal.error", { msg: String(e?.message ?? e) })));
    back();
  };
  const cancel = () => {
    store.cancelPurchaseOrder(o.id);
    setAskCancel(false);
    toast.show(t("po.cancelled"));
    back();
  };
  const saveReceive = () => {
    if (!receiving) return;
    const undo = store.receivePurchaseOrder(o.id, Object.entries(receiving).map(([lid, received]) => ({ id: lid, received: received || "0" })));
    setReceiving(null);
    toast.show(store.online ? t("po.receivedToast") : t("offline.queued"), undo);
  };
  const canRecv = canReceive(role) && ["sent", "partially_received", "received"].includes(found.status);

  return (
    <Screen title={title} back={back} subtitle={[supName ?? t("po.noSupplier"), job ? job.title : t("po.stock")].join(" · ")}>
      <Card>
        <RowView style={{ justifyContent: "space-between" }}>
          <View testID="po-status">
            <StatusChip status={PO_TONE[found.status]} label={t(`po.status.${found.status}` as DictKey)} />
          </View>
          {found.lines.length && found.status !== "draft" ? <T v="caption" tone="mut">{t("po.receivedOf", { done: receivedCount(found), n: found.lines.length })}</T> : null}
        </RowView>
        {edit ? (
          <View testID="po-supplier">
            <ListRow title={supName ?? t("po.noSupplier")} subtitle={t("po.supplier")} onPress={() => setPickSup(true)} />
          </View>
        ) : (
          <T v="body">{[supName, sup?.phone ?? o.supplierPhone].filter(Boolean).join(" · ") || t("po.noSupplier")}</T>
        )}
        {job ? <ListRow title={job.title} subtitle={[t("po.job"), job.number].filter(Boolean).join(" · ")} onPress={() => router.push(`/job/${job.id}`)} /> : null}
        {edit ? (
          <>
            <ChoiceChips value={o.fulfillment} onChange={(k) => set({ fulfillment: k })} items={(["delivery", "pickup"] as const).map((k) => ({ key: k, label: t(`po.fulfillment.${k}`) }))} />
            {o.fulfillment === "delivery" ? <TextField type="street" value={o.deliverTo ?? ""} onChangeText={(v) => set({ deliverTo: v })} placeholder={t("po.deliverTo")} /> : null}
            <TextField type="date" value={dateText} onChangeText={(v) => { setDateText(v); set({ neededOn: isoDate(v) }); }} placeholder={t("po.neededOn")} />
            {dateBad ? <T v="caption" tone="bad">{t("po.neededOn")}</T> : null}
            <TextField type="note" value={o.note ?? ""} onChangeText={(v) => set({ note: v })} placeholder={t("po.note")} multiline />
            {costs ? <Toggle on={o.printPrices} onChange={(v) => set({ printPrices: v })} label={t("po.printPrices")} /> : null}
          </>
        ) : (
          <View testID="po-where">
            <T v="body" tone="mut">
              {o.fulfillment === "pickup"
                ? t("po.pickupAt", { where: [supName, sup?.address ?? o.supplierAddress].filter(Boolean).join(", ") })
                : [t("po.fulfillment.delivery"), o.deliverTo].filter(Boolean).join(": ")}
            </T>
          </View>
        )}
      </Card>

      <Card>
        <T v="heading">{t("po.lines")}</T>
        {o.lines.map((l, i) => (
          <View key={l.id} style={{ gap: space[1] }} testID={`po-line-${i}`}>
            {i > 0 ? <Divider /> : null}
            <RowView>
              <View style={{ flex: 1 }}>
                <T v="body" numberOfLines={2}>{l.name}</T>
                <T v="caption" tone="mut">
                  {[l.supplierSku, l.note, l.checkPack ? t("po.checkPack") : "", costs && l.costCents !== undefined ? `${money(l.costCents)} / ${l.unit}` : ""].filter(Boolean).join(" · ")}
                </T>
              </View>
              {edit ? (
                <>
                  <View style={{ width: component.qtyFieldW }} testID={`po-qty-${i}`}>
                    <QtyField qty={l.qty} onChange={(q) => setLine(l.id, { qty: q })} />
                  </View>
                  <T v="caption" tone="mut">{l.unit}</T>
                  <IconButton icon="trash" label={t("po.removeLine")} onPress={() => set({ lines: o.lines.filter((x) => x.id !== l.id) })} />
                </>
              ) : (
                <T v="body" tabular>{`${found.status === "draft" || found.status === "cancelled" ? "" : `${l.receivedQty} / `}${l.qty} ${l.unit}`}</T>
              )}
            </RowView>
          </View>
        ))}
        {edit ? (
          <View testID="po-add">
            <Button label={t("po.addItem")} icon="plus" variant="ghost" size="sm" onPress={() => setPickItem(true)} />
          </View>
        ) : null}
        {total !== undefined ? <T v="heading" tabular>{t("po.total", { amount: money(total) })}</T> : null}
      </Card>

      {edit && dirty ? (
        <View testID="po-save">
          <Button label={t("ue.save")} icon="check" variant="secondary" full disabled={dateBad} onPress={save} />
        </View>
      ) : null}
      {edit ? (
        <View testID="po-send">
          <Button
            label={found.status === "sent" ? t("po.sendAgain", { n: found.revision + 1 }) : t("po.send")}
            icon="send"
            full
            disabled={!o.supplierId || !o.lines.length || dateBad}
            onPress={send}
          />
        </View>
      ) : null}
      {edit && !o.supplierId ? <T v="caption" tone="mut">{t("po.needSupplier")}</T> : null}
      {edit && !o.lines.length ? <T v="caption" tone="mut">{t("po.needLines")}</T> : null}
      {canRecv ? (
        <View testID="po-receive">
          <Button
            label={t("po.receive")}
            icon="check"
            variant={edit ? "secondary" : "primary"}
            full
            onPress={() => setReceiving(Object.fromEntries(found.lines.map((l) => [l.id, l.receivedQty === "0" ? "" : l.receivedQty])))}
          />
        </View>
      ) : null}
      {office && ["draft", "sent", "partially_received"].includes(found.status) ? (
        <View testID="po-cancel">
          <Button label={t("po.cancel")} icon="close" variant="ghost" full onPress={() => setAskCancel(true)} />
        </View>
      ) : null}

      <SupplierPicker
        visible={pickSup}
        onClose={() => setPickSup(false)}
        onPick={(s) => {
          set({ supplierId: s?.id });
          setPickSup(false);
        }}
        onNew={() => {
          setPickSup(false);
          router.push("/suppliers/new");
        }}
      />
      <CatalogPicker
        visible={pickItem}
        exclude={["service", "labor", "kit"]}
        onClose={() => setPickItem(false)}
        onPick={(it) => {
          const cost = costs ? packCost(it) : undefined;
          set({
            lines: [
              ...o.lines,
              {
                id: uid(), position: o.lines.length, catalogItemId: it.id, name: it.name, qty: "1", unit: it.purchaseUnit?.trim() || it.unit,
                receivedQty: "0", checkPack: !it.packSize, ...(it.supplierSku ? { supplierSku: it.supplierSku } : {}), ...(cost !== undefined ? { costCents: cost } : {}),
              },
            ],
          });
          setPickItem(false);
        }}
      />
      <Sheet visible={askCancel} onClose={() => setAskCancel(false)} title={t("po.cancel")}>
        <View style={{ gap: space[3] }}>
          <T v="body">{t("po.cancelAsk")}</T>
          <View testID="po-cancel-yes">
            <Button label={t("po.cancelYes")} variant="danger" full onPress={cancel} />
          </View>
        </View>
      </Sheet>
      <Sheet visible={!!receiving} onClose={() => setReceiving(null)} title={t("po.receive")}>
        <View style={{ gap: space[3] }}>
          {found.lines.map((l, i) => (
            <View key={l.id} testID={`po-recv-${i}`}>
              <RowView>
                <T v="body" style={{ flex: 1 }} numberOfLines={2}>{`${l.name} · ${l.qty} ${l.unit}`}</T>
                <View style={{ width: component.qtyFieldW }}>
                  <QtyField qty={receiving?.[l.id] ?? ""} onChange={(q) => setReceiving((r) => ({ ...(r ?? {}), [l.id]: q }))} />
                </View>
              </RowView>
            </View>
          ))}
          <View testID="po-recv-all">
            <Button label={t("po.receiveAll")} variant="secondary" full onPress={() => setReceiving(Object.fromEntries(found.lines.map((l) => [l.id, l.qty])))} />
          </View>
          <View testID="po-recv-save">
            <Button label={t("po.receiveSave")} icon="check" full onPress={saveReceive} />
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}
