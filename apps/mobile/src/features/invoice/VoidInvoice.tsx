/**
 * В1-5 (#1107, main-path spec §3.3): «⋯ → Аннулировать» on a sent invoice. Only the director (owner / admin), only an
 * invoice with no payment, the reason required. One sheet, two pages (DS Б1: a nested step is a page, not a second
 * sheet): the menu, then the reason with the button. No «Отменить» — the server never lets a void invoice back
 * (decision of the director 12.11). The store checks the same (voidRefusal) and the server too (tg_invoice_guard, db T197).
 */
import { useRef, useState, type ComponentRef } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Invoice } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { VOID_REASON_MAX, voidRefusal } from "@/features/contractInvoice";
import { Button, IconButton, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Menu, Sheet, useToast } from "@/ui/overlays";
import type { IconKey } from "@/ui/primitives";
import { Card, RowView, SectionTitle } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";
import { router } from "expo-router";
import { RelatedBlock } from "@/features/RelatedBlock";
import { findJob } from "@/data/jobs";

/** an action of the invoice's «⋯» besides «Аннулировать» (#1474: the card's row of pills moved here) */
export interface InvoiceMoreItem {
  key: string;
  label: string;
  icon: IconKey;
  testID: string;
  onPress: () => void;
}

/**
 * The invoice's «⋯» (DS Б4, #1474): its other actions (Напомнить, SMS, email, PDF) and, the director's only, «Аннулировать…» last,
 * red. A menu at the button; «Аннулировать…» opens the sheet with the reason (В1-5, unchanged). Nothing to offer — no «⋯».
 */
export function VoidInvoiceMenu({ inv, items = [] }: { inv: Invoice; items?: InvoiceMoreItem[] }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const moreRef = useRef<ComponentRef<typeof View>>(null);
  const [reason, setReason] = useState("");
  // «Аннулировать» is the director's only; with a payment the item is there and says why not (П7: no dead ends)
  const director = store.role === "director";
  const blocked = voidRefusal(store.db, inv.id, "x", store.role);
  if (!director && !items.length) return null;
  const close = () => {
    setOpen(false);
    setReason("");
  };
  const confirm = () => {
    const why = store.voidInvoice(inv.id, reason);
    if (why) {
      toast.show(t(`inv.void.why.${why}` as DictKey));
      if (why !== "reason" && why !== "long") close();
      return;
    }
    close();
    toast.show(t("inv.void.done"));
  };
  const label = [t("inv.title"), inv.number].filter(Boolean).join(" ");
  return (
    <>
      <View ref={moreRef} collapsable={false} testID="invoice-more">
        <IconButton icon="more" label={`${t("lead.more")}: ${label}`} onPress={() => moreRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAt({ x, y, w, h }))} />
      </View>
      <Menu
        visible={!!at}
        anchor={at}
        title={label}
        items={[
          ...items.map(({ key, label: l, icon, testID }) => ({ key, label: l, icon, testID })),
          ...(director ? [{ key: "void", label: t("inv.void.menu"), icon: "close" as const, destructive: true, dim: !!blocked, testID: "invoice-void-item" }] : []),
        ]}
        onSelect={(k) => {
          setAt(null);
          if (k !== "void") return items.find((x) => x.key === k)?.onPress();
          if (blocked) return toast.show(t(`inv.void.why.${blocked}` as DictKey));
          setOpen(true);
        }}
        onClose={() => setAt(null)}
      />
      <Sheet
        visible={open}
        onClose={close}
        title={t("inv.void.title")}
        dirty={reason.trim() !== ""}
        footer={
          <View testID="invoice-void-confirm">
            <Button label={t("inv.void.confirm")} icon="close" variant="danger" full disabled={!reason.trim()} onPress={confirm} />
          </View>
        }
      >
        <View style={{ gap: space[3] }}>
          <T v="body" tone="mut">
            {t("inv.void.body")}
          </T>
          <View testID="invoice-void-reason">
            <TextField type="note" value={reason} onChangeText={(x) => setReason(x.slice(0, VOID_REASON_MAX))} label={t("inv.void.reason")} placeholder={t("inv.void.reasonPh")} autoFocus />
          </View>
        </View>
      </Sheet>
    </>
  );
}

/** a voided invoice's own screen: what it was, «Аннулирован» and why — no payment, reminder or PDF (the client never
 *  gets it: /p/ and the PDF show only live invoices) */
export function VoidInvoiceBody({ inv }: { inv: Invoice }) {
  const { db } = useStore();
  const { t, money, day } = useI18n();
  const job = findJob(db, inv.jobId);
  return (
    <>
      <RelatedBlock of={{ type: "invoice", id: inv.id }} />
      <Card status="neutral">
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="heading" style={{ flex: 1 }}>
            {inv.title || t(`inv.kind.${inv.kind ?? "final"}` as DictKey)}
          </T>
          <View testID="invoice-void-status">
            <StatusChip status="neutral" label={t("inv.void.status")} />
          </View>
        </RowView>
        {job ? (
          <T v="caption" tone="mut">
            {job.title}
          </T>
        ) : null}
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="body" tone="mut">
            {t("inv.amount")}
          </T>
          <T v="body" tabular tone="mut">
            {money(inv.totalCents)}
          </T>
        </RowView>
        {inv.voidReason ? (
          <View testID="invoice-void-reason-line">
            <T v="body">{t("inv.void.reasonLine", { reason: inv.voidReason })}</T>
          </View>
        ) : null}
        {inv.voidedAt ? (
          <T v="caption" tone="mut">
            {day(inv.voidedAt)}
          </T>
        ) : null}
      </Card>
    </>
  );
}

/** the voided invoices of a job's statement or a client's invoices: compact «Аннулирован» cards with the reason, apart
 *  from the live ones and outside every sum (decision of the director 12.11) */
export function VoidInvoiceCards({ list, testPrefix }: { list: Invoice[]; testPrefix: string }) {
  const { t, money } = useI18n();
  if (!list.length) return null;
  return (
    <>
      <SectionTitle title={t("inv.void.list")} />
      <CardGrid>
        {list.map((i) => (
          <ListCard
            key={i.id}
            density="compact"
            testID={`${testPrefix}-void-${i.id}`}
            lead={{ kind: "icon", icon: "invoice" }}
            title={i.title || t(`inv.kind.${i.kind ?? "final"}` as DictKey)}
            when={[i.number, i.voidReason].filter(Boolean).join(" · ") || undefined}
            value={money(i.totalCents)}
            status={{ tone: "neutral", label: t("inv.void.status") }}
            onPress={() => router.push(`/invoice/${i.id}`)}
          />
        ))}
      </CardGrid>
    </>
  );
}
