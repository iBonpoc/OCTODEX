/**
 * The measurement's card on its own screen in the open cards' one frame (#2995, ObjectScreen; proposed by «Открытые карточки» after
 * design + crm + layout review 27.11, taken by the director of shift 9): «‹ · ⋯», the name (the client, the lead, else the address or
 * «Без клиента») | what it is and its state in ONE line; «изменён» / «движок» — in «⌄» (no row of chips, founder 27.11 #2978); the row of
 * actions «Позвонить · SMS · Маршрут» (the person first); the one step under it («Сделать / Обновить смету», «Привязать…»); «Править чертёж»,
 * «Привязать к другому», «Отвязать», «Документы бригады», «Дублировать», «Удалить» — in «⋯» (rule 29: no menu of its own on the name).
 * The 1280 panel of «Замеры» keeps `CardHead` (a panel has no frame of its own).
 */
import type { ReactNode } from "react";
import { Linking, Platform, View } from "react-native";
import { router, type Href } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { cleanPhone, smsHref } from "@/features/contactLinks";
import { estimateStatusView } from "@/features/estimateStatus";
import { StatusChip } from "@/ui/controls";
import type { IconRowItem } from "@/ui/iconRow";
import { mapsUrl, type OS } from "@/ui/listCardLayout";
import { ObjectScreen } from "@/ui/templates/ObjectScreen";
import type { MainAction } from "@/ui/templates/types";
import type { MeasurementRow } from "../canvas/model";
import { otherEstimates } from "../estimateLink";
import { measurementState } from "../measurements";
import { useMeasurementActions } from "./CardHead";

export function MeasurementObject({ m, drawn, back, onGone, onEdit, onCrewDocs, main, second, children }: {
  m: MeasurementRow;
  drawn: boolean;
  back: () => void;
  onGone: () => void;
  onEdit: () => void;
  onCrewDocs?: () => void;
  main?: MainAction;
  second?: MainAction;
  children: ReactNode;
}) {
  const store = useStore();
  const { t } = useI18n();
  const db = store.db;
  const lead = m.leadId ? db.leads.find((l) => l.id === m.leadId) : undefined;
  const prop = m.propertyId ? db.properties.find((p) => p.id === m.propertyId) : undefined;
  const client = prop ? db.customers.find((c) => c.id === prop.customerId) : undefined;
  const where = prop ? [prop.address, prop.city].filter(Boolean).join(", ") : lead?.address || undefined;
  const title = client?.name ?? lead?.name ?? where ?? t("mod.gutters.list.noClient");
  const kindWord = client ? t("mod.gutters.card.kindClient") : lead ? t("mod.gutters.card.kindLead") : undefined; // a draft: its state says «Черновик» once
  const v = measurementState(db, m, drawn);
  const est = v.estimate ? estimateStatusView(v.estimate.status) : null;
  const status =
    v.state === "signed" ? { name: "ok" as const, label: t("mod.gutters.list.s.signed") }
    : est ? { name: est.s, label: t(est.l), ...(est.d ? { draft: true } : {}) }
    : { name: "neutral" as const, label: t(v.state === "unlinked" ? "mod.gutters.list.draft" : otherEstimates(db, m).length ? "mod.gutters.card.noEstHere" : "mod.gutters.list.s.noEstimate"), ...(v.state === "unlinked" ? { draft: true } : {}) };
  // what changed since the estimate — in «⌄» (one line of state on top, not a row of chips)
  const flags = [
    ...(v.changed ? [<View key="c" testID="view-changed"><StatusChip status="warn" label={t(v.state === "signed" ? "mod.gutters.list.s.changedSigned" : "mod.gutters.list.s.changed")} /></View>] : []),
    ...(v.engineChanged ? [<View key="e" testID={v.state === "signed" ? "view-engine-signed" : "view-engine-changed"}><StatusChip status="warn" label={t(v.state === "signed" ? "mod.gutters.list.s.engineSigned" : "mod.gutters.list.s.engine")} /></View>] : []),
  ];
  const acts = useMeasurementActions(m, onGone, onCrewDocs);
  const phone = cleanPhone(client?.phone ?? lead?.phone ?? "");
  const actions: IconRowItem[] = [
    { icon: "phone", label: t("client.call"), a11y: `${t("client.call")} ${title}`, onPress: () => void Linking.openURL(`tel:${phone}`).catch(() => {}), disabled: !phone, reason: t("proto.leads.noPhone"), testID: "view-call" },
    { icon: "sms", label: t("cc.sms"), a11y: `${t("cc.sms")} ${title}`, onPress: () => void Linking.openURL(smsHref(client?.phone ?? lead?.phone ?? "") ?? "").catch(() => {}), disabled: !phone, reason: t("proto.leads.noPhone"), testID: "view-sms" },
    ...(where ? [{ icon: "navigate" as const, label: t("client.route"), a11y: `${t("client.route")}: ${where}`, onPress: () => void Linking.openURL(mapsUrl(where, Platform.OS as OS)).catch(() => {}), testID: "view-route" }] : []),
  ];
  const more = [
    { key: "edit", label: t("mod.gutters.view.edit"), testID: "view-more-edit" },
    ...acts.whoItems,
    // «Удалить замер» asks its own question (which estimates stand on it, #2013) or gives «Отменить»: not the frame's yes / no as well
    ...acts.moreItems.map((i) => (i.key === "delete" ? { key: i.key, label: i.label, testID: i.testID } : i)),
  ];
  const onMore = (k: string) => (k === "edit" ? onEdit() : acts.onAction(k));
  const parent = client ? { label: t("mod.gutters.card.openClient"), href: `/client/${client.id}` } : lead ? { label: t("mod.gutters.card.openLead"), href: `/lead/${lead.id}` } : null;
  return (
    <>
      <ObjectScreen<"none">
        testID="view"
        back={back}
        header={{
          testID: "view-head",
          title,
          ...(kindWord ? { kindWord } : {}),
          status,
          ...(where ? { address: { text: where, onPress: () => void Linking.openURL(mapsUrl(where, Platform.OS as OS)).catch(() => {}) } } : {}),
          ...(parent ? { link: { label: parent.label, onPress: () => router.push(parent.href as Href) } } : {}),
          ...(flags.length ? { details: <View style={{ gap: space[2] }}>{flags}</View>, defaultOpen: false } : {}),
          labels: { expand: t("proto.client.expand"), collapse: t("proto.client.collapse"), more: (n) => t("cw4.moreTags", { n }) },
        }}
        // a draft without anyone: no one to call — no row (its one step is «Привязать…»)
        actions={lead || client ? actions : undefined}
        main={main}
        second={second}
        sections={[]}
        section="none"
        onSection={() => {}}
        sectionsLabel={t("mod.gutters.view.title")}
        more={more}
        onMore={onMore}
      >
        {children}
      </ObjectScreen>
      {acts.sheets}
    </>
  );
}
