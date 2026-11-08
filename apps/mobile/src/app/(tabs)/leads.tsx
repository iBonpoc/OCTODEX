import { useEffect, useState } from "react";
import { useStore } from "@/data/store";
import type { Lead, LeadStatus } from "@/data/types";
import { canSeeLead, canSeeLeadCost, filterLeads, isOpenLead, leadStatusView as statusOf, needsNextStep, openTasks, sourceName, waitingMinutes, waitStatus, type LeadFilter } from "@/features/leads";
import { leadSigns } from "@/features/listSigns";
import { canChangeStatus, pickerOptions } from "@/features/statusMoves";
import { CallResultSheet } from "@/features/lead/LeadSheets";
import { CardGrid, ListCardHeader, StatusPicker, openContact } from "@/ui/listCard";
import { LEAD_COLUMNS, LEAD_COLUMNS_PANEL, LeadListCard, leadCardSign } from "@/features/listCards";
import type { ContactAction } from "@/ui/listCardLayout";
import { useDevice } from "@/theme/ThemeProvider";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { usePersistentState } from "@/data/persist";
import { router, useLocalSearchParams } from "expo-router";
import { useI18n, type DictKey } from "@/i18n";
import { ReplySheet, useTick } from "@/features/sheets";
import { Button } from "@/ui/controls";
import { FilterBar } from "@/ui/filterBar";
import { filterStoreKey } from "@/ui/filterBarRules";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { CardList, Empty, Screen } from "@/ui/surfaces";
import { ListPanel } from "@/ui/listPanel";
import { useListPanel } from "@/nav/listPanel";
import { LeadCardBody } from "@/features/lead/LeadCard";



const COLUMNS = LEAD_COLUMNS;

/** the lane of «Лиды» (spec 31 §7): the broad default first, then in the order of the work; «Мои» is in the sheet */
const LANE: readonly LeadFilter[] = ["open", "waiting", "snoozed", "won", "closed"];

/** All requests in one place, with a "waiting N min" timer: whoever replies first wins the job. */
/**
 * «Лиды» (☰ «Работа»): the leads only. Estimates and invoices are sections of their own, each its own screen
 * (founder 07.11, spec 31 §7а): an old address /leads?tab=estimates|invoices goes there.
 */
export default function Leads() {
  const want = useLocalSearchParams<{ tab?: string }>().tab;
  useEffect(() => {
    if (want === "estimates") router.replace("/estimates");
    else if (want === "invoices") router.replace("/invoice");
  }, [want]);
  return <LeadsBoard />;
}

function LeadsBoard() {
  useTick();
  const { t, day, money } = useI18n();
  const store = useStore();
  const { db, role } = store;
  const toast = useToast();
  const { device } = useDevice();
  const [reply, setReply] = useState<string | null>(null);
  // spec 31 §6 п.7: the status, the sources and the people are kept on this device for this list; the search is not.
  // «Мои» is not a status any more: it is in the sheet («Ответственный»).
  const key = filterStoreKey("leads");
  const [keptF, setF] = usePersistentState<LeadFilter>(`${key}.status`, "open");
  const [srcIds, setSrcIds] = usePersistentState<string[]>(`${key}.sources`, []);
  const [whoIds, setWhoIds] = usePersistentState<string[]>(`${key}.people`, []);
  const [q, setQ] = useState("");
  const f: LeadFilter = LANE.includes(keptF) ? keptF : "open";
  const base = filterLeads(db, role, { filter: f });
  const usedSources = db.sources.filter((s) => db.leads.some((l) => l.sourceId === s.id));
  // only people at work make a team (invitations and switched-off people do not, 7-2)
  const people = db.members.filter((m) => !m.pending);
  const sources = srcIds.filter((id) => usedSources.some((s) => s.id === id));
  const who = whoIds.filter((id) => people.some((m) => m.id === id));
  const leads = filterLeads(db, role, { filter: f, q }).filter((l) => (!sources.length || sources.includes(l.sourceId ?? "")) && (!who.length || who.includes(l.assigneeId ?? "")));
  const count = (x: LeadFilter) => filterLeads(db, role, { filter: x }).length;
  const office = role !== "tech";
  const team = people.length > 1 && !(who.length === 1 && who[0] === db.me);
  const toggle = (ids: string[], set: (v: string[]) => void) => (id: string) => set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const [picking, setPicking] = useState<Lead | null>(null);
  const [calling, setCalling] = useState<Lead | null>(null);
  /** the same records as the lead page (ContactActions): a call asks «did you get through?», SMS / email count as a reply */
  const contact = (l: Lead) => (a: ContactAction) => {
    openContact(a);
    // a call always asks «Чем кончился?»: the server counts a call without an outcome as answered (20 §3)
    if (a.kind === "call") return setCalling(l);
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
  // urgent first (a sign or a new lead), then the rest in work
  const urgent = leads.filter((l) => signOf(l) || l.status === "new");
  const rest = leads.filter((l) => !urgent.includes(l));
  // 1280: the open lead beside the list, `/leads?open=<id>` (spec 06 «Панель 1280», nav/listPanel.ts); ↑/↓ in the order on screen
  const panel = useListPanel([...urgent, ...rest].map((l) => l.id), (id) => `/lead/${id}`, (id) => db.leads.some((l) => l.id === id && canSeeLead(role, db.me, l)));
  const { openId } = panel;
  const openL = openId ? db.leads.find((l) => l.id === openId) : undefined;
  const card = (l: Lead) => (
    <LeadListCard
      panel={{ selected: l.id === openId, open: () => panel.open(l.id), narrow: !!openId }}
      key={l.id}
      l={l}
      density={device === "desktop" ? "row" : "rich"}
      showResp={team}
      onStatus={office && canChangeStatus("lead", l.status) ? () => setPicking(l) : undefined}
      onContact={contact(l)}
      onReply={() => setReply(l.id)}
    />
  );
  const section = (title: string, ls: Lead[]) =>
    ls.length ? (
      <View key={title} style={{ gap: space[2] }}>
        <T v="caption" w="semibold" tone="mut">{`${title} · ${ls.length}`}</T>
        {device === "tablet" ? <CardGrid>{ls.map(card)}</CardGrid> : <CardList>{ls.map(card)}</CardList>}
      </View>
    ) : null;
  return (
    <Screen
      title={t("sales.leads")}
      help={t("help.inbox")}
      hintKey="inbox"
      // sales: this is «Главная» (13а §2) — the bell, the sync badge and the profile on the right
      home={role === "sales"}
      right={<Button label={t("quick.lead")} icon="plus" size="sm" variant="secondary" onPress={() => router.push("/lead/new")} />}
      aside={
        openL ? (
          <ListPanel title={openL.name} subtitle={[openL.number, sourceName(db, openL.sourceId), canSeeLeadCost(role) && openL.costCents ? money(openL.costCents) : null, day(openL.receivedAt)].filter(Boolean).join(" · ")} onOpen={panel.full} onClose={panel.close}>
            <LeadCardBody key={openL.id} l={openL} />
          </ListPanel>
        ) : undefined
      }
    >
      {/* spec 31 (variant Б): the search and «Фильтр» in one row, one lane of statuses; sources and people in the sheet */}
      <FilterBar<LeadFilter>
        search={{ value: q, onChange: setQ, placeholder: t("lead.search") }}
        value={f}
        onChange={setF}
        items={LANE.map((k) => ({ key: k, label: t(`lead.f.${k}` as DictKey), count: count(k) }))}
        groups={[
          // the office's groups (a tech sees only his own leads; who brought a lead and its price are the office's — canSeeLeadCost)
          ...(office && people.length > 1
            ? [{
                key: "people",
                title: t("card.filter.people"),
                // «Мои» first, then the others by name
                options: [...people].sort((a, b) => (a.id === db.me ? -1 : b.id === db.me ? 1 : a.name.localeCompare(b.name))).map((m) => ({
                  key: m.id,
                  label: m.id === db.me ? t("lead.f.mine") : m.name,
                  count: base.filter((l) => l.assigneeId === m.id).length,
                  on: who.includes(m.id),
                })),
                onToggle: toggle(who, setWhoIds),
              }]
            : []),
          ...(office && usedSources.length > 1
            ? [{
                key: "sources",
                title: t("card.filter.sources"),
                options: usedSources.map((x) => ({ key: x.id, label: x.name, count: base.filter((l) => l.sourceId === x.id).length, on: sources.includes(x.id) })),
                onToggle: toggle(sources, setSrcIds),
              }]
            : []),
        ]}
        onReset={() => { setSrcIds([]); setWhoIds([]); }}
      />
      {leads.length === 0 ? (
        <View testID="leads-empty">
          {/* the tech sees only his own (13 §2.3): say which, not «from Thumbtack and the website» */}
          <Empty icon="inbox" title={t("inbox.empty")} hint={t(office ? "inbox.emptyHint" : "leads.empty.tech")} />
        </View>
      ) : (
        <>
          {device === "desktop" ? <ListCardHeader title={t("card.fact.client")} columns={openId ? LEAD_COLUMNS_PANEL : COLUMNS} /> : null}
          {section(t("card.group.action"), urgent)}
          {section(t("card.group.inWork"), rest)}
        </>
      )}
      <ReplySheet leadId={reply} onClose={() => setReply(null)} />
      {calling ? <CallResultSheet key={calling.id} l={calling} visible onClose={() => setCalling(null)} onAnswered={() => panel.open(calling.id)} /> : null}
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
    </Screen>
  );
}
