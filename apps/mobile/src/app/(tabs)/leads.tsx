import { useEffect, useState } from "react";
import { useStore } from "@/data/store";
import type { Lead, LeadStatus } from "@/data/types";
import { filterLeads, isOpenLead, leadStatusView as statusOf, needsNextStep, openTasks, sourceName, waitingMinutes, waitStatus, type LeadFilter } from "@/features/leads";
import { leadSigns } from "@/features/listSigns";
import { canChangeStatus, pickerOptions } from "@/features/statusMoves";
import { CallResultSheet } from "@/features/lead/LeadSheets";
import { CardGrid, ListCardHeader, StatusPicker, openContact } from "@/ui/listCard";
import { LEAD_COLUMNS, LeadListCard, leadCardSign } from "@/features/listCards";
import type { ContactAction } from "@/ui/listCardLayout";
import { useDevice } from "@/theme/ThemeProvider";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { EstimatesBoard, InvoicesBoard } from "@/features/boards";
import { usePersistentState } from "@/data/persist";
import { router, useLocalSearchParams } from "expo-router";
import { useI18n, type DictKey } from "@/i18n";
import { ReplySheet, useTick } from "@/features/sheets";
import { Button, ChoiceChips, Segmented, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { CardList, Empty, Screen } from "@/ui/surfaces";



const COLUMNS = LEAD_COLUMNS;

/** All requests in one place, with a "waiting N min" timer: whoever replies first wins the job. */
/** Leads · Estimates · Invoices (☰ «Работа» and «Документы», docs/specs/13 §2.3): each list as cards with filters. Was the «Sales» tab (/inbox). */
export default function Sales() {
  const { t } = useI18n();
  const [tab, setTab] = usePersistentState<"leads" | "estimates" | "invoices">("octo.salesTab.v1", "leads");
  // "‹ Leads" / "‹ Estimates" from a card opens Sales on that list
  const want = useLocalSearchParams<{ tab?: string }>().tab;
  useEffect(() => {
    if (want === "leads" || want === "estimates" || want === "invoices") setTab(want);
  }, [want]);
  const { db } = useStore();
  const newLeads = db.leads.filter((l) => l.status === "new").length;
  return (
    <Screen
      title={t(tab === "estimates" ? "sales.estimates" : tab === "invoices" ? "sales.invoices" : "sales.leads")}
      help={t("help.inbox")}
      hintKey="inbox"
      right={
        tab === "leads" ? (
          <Button label={t("quick.lead")} icon="plus" size="sm" variant="secondary" onPress={() => router.push("/lead/new")} />
        ) : tab === "estimates" ? (
          <Button label={t("est.new")} icon="plus" size="sm" onPress={() => router.push("/estimate/new")} />
        ) : undefined
      }
    >
      <Segmented
        full
        value={tab}
        onChange={(k) => {
          setTab(k);
          // the address follows the list on screen, so ☰ «Сметы» / «Счета» always switch it (review of #144)
          router.setParams({ tab: k });
        }}
        items={[
          { key: "leads", label: newLeads ? `${t("sales.leads")} · ${newLeads}` : t("sales.leads") },
          { key: "estimates", label: t("sales.estimates") },
          { key: "invoices", label: t("sales.invoices") },
        ]}
      />
      {tab === "leads" ? <LeadsBoard /> : tab === "estimates" ? <EstimatesBoard /> : <InvoicesBoard />}
    </Screen>
  );
}

function LeadsBoard() {
  useTick();
  const { t, day, money } = useI18n();
  const store = useStore();
  const { db, role } = store;
  const toast = useToast();
  const { device } = useDevice();
  const [reply, setReply] = useState<string | null>(null);
  const [f, setF] = usePersistentState<LeadFilter>("octo.leadFilter.v1", "open");
  const [src, setSrc] = useState("");
  const [q, setQ] = useState("");
  const leads = filterLeads(db, role, { filter: f, sourceId: src || undefined, q });
  const count = (x: LeadFilter) => filterLeads(db, role, { filter: x }).length;
  const usedSources = db.sources.filter((s) => db.leads.some((l) => l.sourceId === s.id));
  const office = role !== "tech";
  const team = db.members.length > 1 && f !== "mine";
  const [picking, setPicking] = useState<Lead | null>(null);
  const [calling, setCalling] = useState<Lead | null>(null);
  /** the same records as the lead page (ContactActions): a call asks «did you get through?», SMS / email count as a reply */
  const contact = (l: Lead) => (a: ContactAction) => {
    openContact(a);
    if (a.kind === "call") return isOpenLead(l) ? setCalling(l) : store.touchLead(l.id, "call");
    if (a.kind === "sms" || a.kind === "email") store.touchLead(l.id, a.kind);
  };
  /** reopen: one tap with «Undo»; close / won / book need a reason or a date → the lead page with its existing forms */
  const pickStatus = (l: Lead, s: string) => {
    setPicking(null);
    const move = pickerOptions("lead", l.status).find((o) => o.status === s);
    if (!move?.enabled) return;
    if (move.how === "form") return router.push(`/lead/${l.id}`);
    toast.show(`${l.name}: ${t(statusOf[s as LeadStatus].label)}`, store.reopenLead(l.id));
  };
  // the one lead card (features/listCards.tsx), shared with the «Today» figures; this list adds its own actions
  const signOf = (l: Lead) => leadCardSign(db, l, t);
  const card = (l: Lead) => (
    <LeadListCard
      key={l.id}
      l={l}
      density={device === "desktop" ? "row" : "rich"}
      showResp={team}
      onStatus={office && canChangeStatus("lead", l.status) ? () => setPicking(l) : undefined}
      onContact={contact(l)}
      onReply={() => setReply(l.id)}
    />
  );
  // urgent first (a sign or a new lead), then the rest in work
  const urgent = leads.filter((l) => signOf(l) || l.status === "new");
  const rest = leads.filter((l) => !urgent.includes(l));
  const section = (title: string, ls: Lead[]) =>
    ls.length ? (
      <View key={title} style={{ gap: space[2] }}>
        <T v="caption" w="semibold" tone="mut">{`${title} · ${ls.length}`}</T>
        {device === "tablet" ? <CardGrid>{ls.map(card)}</CardGrid> : <CardList>{ls.map(card)}</CardList>}
      </View>
    ) : null;
  return (
    <>
      <TextField type="search" value={q} onChangeText={setQ} placeholder={t("lead.search")} icon="search" />
      <ChoiceChips<LeadFilter>
        value={f}
        onChange={setF}
        items={(["open", "mine", "waiting", "snoozed", "won", "closed"] as const).map((k) => ({ key: k, label: `${t(`lead.f.${k}` as DictKey)} · ${count(k)}` }))}
      />
      {usedSources.length > 1 ? (
        <ChoiceChips<string> value={src} onChange={setSrc} items={[{ key: "", label: t("lead.allSources") }, ...usedSources.map((x) => ({ key: x.id, label: x.name }))]} />
      ) : null}
      {leads.length === 0 ? (
        <Empty icon="inbox" title={t("inbox.empty")} hint={t("inbox.emptyHint")} />
      ) : (
        <>
          {device === "desktop" ? <ListCardHeader title={t("card.fact.client")} columns={COLUMNS} /> : null}
          {section(t("card.group.action"), urgent)}
          {section(t("card.group.inWork"), rest)}
        </>
      )}
      <ReplySheet leadId={reply} onClose={() => setReply(null)} />
      {calling ? <CallResultSheet key={calling.id} l={calling} visible onClose={() => setCalling(null)} onAnswered={() => router.push(`/lead/${calling.id}`)} /> : null}
      {picking ? (
        <StatusPicker
          visible
          onClose={() => setPicking(null)}
          title={`${t("card.statusTitle")} · ${picking.name}`}
          options={pickerOptions("lead", picking.status).map((o) => {
            const v = statusOf[o.status as LeadStatus];
            return { key: o.status, tone: v.status, label: t(v.label), current: o.current, enabled: o.enabled, form: o.how === "form" };
          })}
          onPick={(k) => pickStatus(picking, k)}
        />
      ) : null}
    </>
  );
}
