import { useEffect, useState } from "react";
import { useStore } from "@/data/store";
import type { Lead, LeadStatus } from "@/data/types";
import { filterLeads, isOpenLead, leadStatusView as statusOf, needsNextStep, openTasks, sourceName, waitingMinutes, waitStatus, type LeadFilter } from "@/features/leads";
import { leadSigns } from "@/features/listSigns";
import { canChangeStatus, pickerOptions } from "@/features/statusMoves";
import { CallResultSheet } from "@/features/lead/LeadSheets";
import { CardGrid, ListCard, ListCardHeader, StatusPicker, openContact, type CardSign } from "@/ui/listCard";
import type { ContactAction, FactKey } from "@/ui/listCardLayout";
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



const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
/** desktop row columns (docs/specs/06-list-cards.md, leads) */
const COLUMNS: FactKey[] = ["phone", "src", "svc", "next"];

/** All requests in one place, with a "waiting N min" timer: whoever replies first wins the job. */
/** "Sales" tab: leads → estimates → invoices, each list as cards with filters. */
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
      title={t("sales.title")}
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
        onChange={setTab}
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
  /** one sign per card, most urgent first: waiting for a reply → no answer ×N → no next step */
  const signOf = (l: Lead): CardSign | undefined => {
    const w = waitingMinutes(l);
    if (w !== null) {
      const tone = waitStatus(w);
      if (tone === "warn" || tone === "bad") return { tone, label: t("inbox.waiting", { m: w }) };
    }
    const missed = leadSigns(l)[0];
    if (missed) return { tone: missed.tone, label: t(missed.key, missed.params) };
    if (needsNextStep(db, l)) return { tone: "warn", label: t("card.sign.noNextStep") };
    return undefined;
  };
  const card = (l: Lead) => {
    const sv = statusOf[l.status];
    const sign = signOf(l);
    const task = openTasks(db, l.id)[0];
    const addr = [l.address, [l.city, [l.state, l.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ");
    const cost = office && (l.costCents ?? 0) > 0 ? ` — ${money(l.costCents ?? 0)}` : "";
    const waiting = waitingMinutes(l) !== null;
    return (
      <ListCard
        key={l.id}
        title={l.name}
        when={waiting ? undefined : day(l.receivedAt)}
        lead={{ kind: "initials", text: initials(l.name) }}
        status={{ tone: sv.status, label: t(sv.label), onPress: office && canChangeStatus("lead", l.status) ? () => setPicking(l) : undefined }}
        signs={sign ? [sign] : undefined}
        facts={{
          num: l.number,
          phone: l.phone,
          email: l.phone ? undefined : l.email,
          addr,
          src: `${sourceName(db, l.sourceId)}${cost}`,
          svc: l.service ?? l.message,
          resp: team ? db.members.find((m) => m.id === l.assigneeId)?.name : undefined,
          next: task ? [task.title, task.dueAt ? day(task.dueAt) : ""].filter(Boolean).join(" · ") : undefined,
        }}
        contact={{ phone: l.phone, email: l.email, addr }}
        onContact={contact(l)}
        action={l.status === "new" ? { label: t("inbox.reply"), onPress: () => setReply(l.id) } : undefined}
        density={device === "desktop" ? "row" : "rich"}
        columns={COLUMNS}
        onPress={() => router.push(`/lead/${l.id}`)}
      />
    );
  };
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
