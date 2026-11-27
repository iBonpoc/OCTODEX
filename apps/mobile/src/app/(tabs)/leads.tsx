import { useState } from "react";
import { Linking } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useListPanel } from "@/nav/listPanel";
import { ListPanel } from "@/ui/listPanel";
import { LeadObject, leadSectionOf, type LeadSectionKey } from "@/features/lead/LeadCard";
import { shortAddress } from "@/features/shortAddress";
import { useStore } from "@/data/store";
import { usePersistentState } from "@/data/persist";
import type { Lead } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { canSeeLead, canSeeLeadCost, filterLeads, isClosedLead, isOpenLead, leadStatusView, leadTurn, sourceName } from "@/features/leads";
import { leadSettingsOf } from "@/features/leadSettings";
import { cleanPhone, smsHref } from "@/features/contactLinks";
import { useDialThenAsk } from "@/features/comms/dial";
import { CloseSheet } from "@/features/lead/LeadParts";
import { CallResultSheet } from "@/features/lead/LeadSheets";
import { leadRowLine, leadWaitLabel, leadWaitPlace } from "@/features/lead/leadRows";
import { ReplySheet, useTick } from "@/features/sheets";
import { Button } from "@/ui/controls";
import { filterStoreKey } from "@/ui/filterBarRules";
import { useHeldSheet } from "@/ui/heldSheet";
import { useToast } from "@/ui/overlays";
import { Empty } from "@/ui/surfaces";
import type { SwipeAction } from "@/ui/swipeRow";
import { ListScreen } from "@/ui/templates";

/** one strip (wireframes-v2 «Лиды»): the open ones, then by the funnel, the snoozed, the archive; «Мои» only for a team */
type Chip = "open" | "mine" | "new" | "replied" | "booked" | "estimate" | "snoozed" | "archive";
const CHIP_LABEL: Record<Chip, DictKey> = {
  open: "proto.leads.f.open",
  mine: "lead.f.mine",
  new: "proto.leads.f.new",
  replied: "proto.leads.f.replied",
  booked: "proto.leads.f.booked",
  estimate: "proto.leads.f.estimate",
  snoozed: "lead.f.snoozed",
  archive: "proto.leads.f.archive",
};
/** an old kept value of the lane (spec 31 §7) lands on its chip */
const OLD: Record<string, Chip> = { waiting: "new", won: "archive", closed: "archive" };

const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "#";

/**
 * Лиды — шаблон «Список» (prototype v2, wireframes-v2 №16, BUILD-SPEC §2.11, object-cards «Лид»): the title with the count,
 * search an icon of the header, the funnel one strip «Все · Новые · Ответили · Записаны · Смета · Отложенные · Архив», rows 56
 * in two groups «Нужно действие» / «В работе»: initials, the name, «что · город» (or where it stands), on the right how long the
 * client waits (StatusPill «! 12 мин») and a call or SMS icon (SMS for whoever asked for SMS). A swipe right calls (then «Чем кончился?»),
 * left «В архив» — the close sheet with its reason (or «Вернуть» a closed one, with «Отменить»); the same on a long press and to
 * VoiceOver. «＋» — a new lead; «⋯» — the lead settings (the director). The phone has no board (founder #2350).
 * Old addresses: `?tab=estimates|invoices` go to their sections (07.11), `?open=<id>` is the 1280 panel beside the list (the lead's own content; 390/820 — its screen).
 */
export default function Leads() {
  const { tab: want } = useLocalSearchParams<{ tab?: string }>();
  // #2273: the section at once — the leads list never mounts (it used to show a frame, then replace itself)
  if (want === "estimates") return <Redirect href="/estimates" />;
  if (want === "invoices") return <Redirect href="/invoice" />;
  return <LeadsList />;
}

function LeadsList() {
  useTick();
  const { t, day } = useI18n();
  const store = useStore();
  const { db, role } = store;
  const toast = useToast();
  const dial = useDialThenAsk();
  const settings = leadSettingsOf(db.company);
  const [q, setQ] = useState("");
  // spec 31 §6 п.7: the chosen chip is kept on this device for this list; the search is not
  const [kept, setKept] = usePersistentState<string>(`${filterStoreKey("leads")}.status`, "open");
  const [reply, setReply] = useState<string | null>(null);
  const [calling, setCalling] = useState<Lead | null>(null);
  const callHeld = useHeldSheet(calling); // the sheet goes out before it is unmounted (#1163)
  const [closing, setClosing] = useState<Lead | null>(null);
  const closeHeld = useHeldSheet(closing);
  const office = role !== "tech";
  const team = office && db.members.filter((m) => !m.pending).length > 1;

  const open = filterLeads(db, role, { filter: "open", q });
  const pass: Record<Chip, () => Lead[]> = {
    open: () => open,
    mine: () => filterLeads(db, role, { filter: "mine", q }),
    new: () => open.filter((l) => l.status === "new"),
    replied: () => open.filter((l) => l.status === "replied"),
    booked: () => open.filter((l) => l.status === "booked"),
    estimate: () => open.filter((l) => l.status === "estimate_sent"),
    snoozed: () => filterLeads(db, role, { filter: "snoozed", q }),
    archive: () => [...filterLeads(db, role, { filter: "won", q }), ...filterLeads(db, role, { filter: "closed", q })],
  };
  const chips: Chip[] = ["open", ...(team ? (["mine"] as const) : []), "new", "replied", "booked", "estimate", "snoozed", "archive"];
  const wanted = (OLD[kept] ?? kept) as Chip;
  const chip: Chip = chips.includes(wanted) ? wanted : "open";
  const label = (c: Chip) => {
    // «Все N» (DS §12.13 «Шапка», ревью design/crm #2841): the title has no number — the first chip says how many, as «Клиенты»
    const n = c === "archive" ? 0 : pass[c]().length;
    return n ? `${t(CHIP_LABEL[c])} ${n}` : t(CHIP_LABEL[c]);
  };
  const list = pass[chip]().sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  // «Нужно действие»: our turn (the client waits, a step is overdue, no step, time to remind); the rest — «В работе»
  const urgent = (l: Lead) => {
    const turn = leadTurn(db, l, settings);
    return turn.kind === "reply" || turn.kind === "noStep" || (turn.kind === "step" && turn.status === "bad") || (turn.kind === "wait" && turn.action !== "none");
  };
  const groups =
    chip === "archive" || chip === "snoozed"
      ? [{ key: chip, rows: list }]
      : [
          { key: "action", title: t("card.group.action"), rows: list.filter(urgent) },
          { key: "work", title: t("card.group.inWork"), rows: list.filter((l) => !urgent(l)) },
        ];

  const call = (l: Lead) => dial(cleanPhone(l.phone), () => setCalling(l));
  const sms = (l: Lead) => {
    const href = smsHref(l.phone);
    if (href) Linking.openURL(href).catch(() => {});
    store.touchLead(l.id, "sms");
  };
  const row = (l: Lead) => {
    const turn = leadTurn(db, l, settings);
    const wait = leadWaitLabel(turn, t);
    const place = leadWaitPlace(turn);
    const tel = cleanPhone(l.phone);
    const bySms = l.preferredContact === "sms";
    const swipeLeft: SwipeAction[] = tel ? [{ key: "call", label: t("swipe.call"), icon: "phone", onPress: () => call(l), testID: `lead-row-call-${l.id}` }] : [];
    const swipeRight: SwipeAction[] = isOpenLead(l)
      ? [{ key: "archive", label: t("swipe.archive"), icon: "box", tone: "bad", onPress: () => setClosing(l), testID: `lead-row-archive-${l.id}` }]
      : isClosedLead(l)
        ? [{ key: "reopen", label: t("swipe.reopen"), icon: "undo", onPress: () => toast.show(t("lead.reopened", { name: l.name }), store.reopenLead(l.id)), testID: `lead-row-reopen-${l.id}` }]
        : [];
    const sv = leadStatusView[l.status];
    return {
      key: l.id,
      testID: `lead-row-${l.id}`,
      title: l.name || "—",
      // #3017 (founder 27.11): line 1 — the name and the phone; line 2 — the address; line 3 — what is going on (how long the client
      // waits first, wireframes №16; late — the pill on the right, leadWaitPlace). No line for what is not there (no «—»)
      // #3038 (founder 27.11: «так же, как клиенты»): 1 — the name, on the right how long the client waits with its icon (no word —
      // said to VoiceOver); 2 — the address of the work (none — no line); 3 — what is needed; no phone — the call is on the right
      value: wait || undefined,
      valueTop: true,
      subtitle: shortAddress(l.address, l.city),
      addressLine: true,
      extra: leadRowLine({ ...l, city: "" }, turn, { t, day, source: sourceName(db, l.sourceId) }) || undefined,
      refNo: l.number || undefined,
      lead: { initials: initials(l.name) },
      // a closed or won lead says its status
      // the word with the figure (rule 2, design-review 27.11): «Без ответа 22 мин», not a bare «22 мин»
      status: wait ? { status: turn.status, label: t("lead.waiting", { time: wait }), iconOnly: true } : !isOpenLead(l) ? { status: sv.status, label: t(sv.label), iconOnly: true } : undefined,
      actions:
        isOpenLead(l) && tel
          ? [
              bySms
                ? { icon: "sms" as const, a11y: `${t("cc.sms")} ${l.name}`, onPress: () => sms(l), testID: `lead-row-sms-${l.id}` }
                : { icon: "phone" as const, a11y: `${t("client.call")} ${l.name}`, onPress: () => call(l), testID: `lead-row-tel-${l.id}` },
            ]
          : undefined,
      swipe: { left: swipeLeft, right: swipeRight },
      onPress: () => panel.open(l.id),
      selected: l.id === panel.openId,
    };
  };
  // 1280: the open lead beside the list, `/leads?open=<id>` (spec 06 «Панель 1280»); the rows in the groups' order; 390/820 — its screen
  const panel = useListPanel(groups.flatMap((g) => g.rows.map((l) => l.id)), (id) => `/lead/${id}`, (id) => db.leads.some((x) => x.id === id && canSeeLead(role, db.me, x)));
  const openL = panel.openId ? db.leads.find((x) => x.id === panel.openId && canSeeLead(role, db.me, x)) : undefined;
  const newLead = () => router.push("/lead/new");
  const visible = db.leads.filter((l) => canSeeLead(role, db.me, l));
  return (
    <>
      <ListScreen<Lead>
        testID="leads"
        title={t("sales.leads")}
        // #3017 (founder 27.11, on the stand): each lead its own card
        separate
        // #2763 (DS §12 «Список»): the title counts what is shown — the chip and the search, not all open leads
        create={{ a11y: t("quick.lead"), items: [{ key: "new", label: t("quick.lead"), icon: "leads", testID: "leads-create-new" }] }}
        onCreate={newLead}
        search={{ placeholder: t("lead.search"), value: q, onChange: setQ }}
        chips={{ items: chips.map((c) => ({ key: c, label: label(c) })), value: chip, onChange: setKept }}
        groups={groups}
        aside={openL ? <LeadAside key={openL.id} id={openL.id} outside={panel.outside} onOpen={panel.full} onClose={panel.close} /> : undefined}
        row={row}
        more={role === "director" ? [{ key: "settings", label: t("co.leads.title"), icon: "settings", testID: "leads-more-settings" }] : undefined}
        onMore={() => router.push("/company/leads")}
        empty={
          <Empty
            icon="leads"
            title={q.trim() ? t("proto.leads.emptySearch") : visible.length ? t("proto.leads.emptyChip") : t("inbox.empty")}
            // the tech sees only his own (13 §2.3): say which, not «from Thumbtack and the website»
            hint={q.trim() ? undefined : t(office ? "inbox.emptyHint" : "leads.empty.tech")}
            action={<Button testID="leads-empty-new" label={t("quick.lead")} icon="plus" variant="secondary" onPress={newLead} />}
          />
        }
      />
      <ReplySheet leadId={reply} onClose={() => setReply(null)} />
      {callHeld.value ? (
        <CallResultSheet
          key={`${callHeld.value.id}-${callHeld.opening}`}
          l={callHeld.value}
          visible={callHeld.visible}
          onExited={callHeld.onExited}
          onClose={() => setCalling(null)}
          onAnswered={() => router.push(`/lead/${callHeld.value!.id}`)}
        />
      ) : null}
      {closeHeld.value ? <CloseSheet key={`close-${closeHeld.value.id}-${closeHeld.opening}`} l={closeHeld.value} visible={closeHeld.visible} onClose={() => setClosing(null)} /> : null}
    </>
  );
}

/** the lead beside the list on 1280: the panel's head (name, «⤢ Открыть», «✕», «⋯») and the lead's own content with its sections */
function LeadAside({ id, outside, onOpen, onClose }: { id: string; outside: boolean; onOpen: () => void; onClose: () => void }) {
  const { db, role } = useStore();
  const { day, money } = useI18n();
  const [section, setSection] = useState<LeadSectionKey>(leadSectionOf());
  const l = db.leads.find((x) => x.id === id);
  if (!l) return null;
  return (
    <LeadObject
      l={l}
      section={section}
      onSection={setSection}
      back={onClose}
      frame={({ more, now, tabs, body }) => (
        <ListPanel
          title={l.name || "—"}
          subtitle={[l.number, sourceName(db, l.sourceId), canSeeLeadCost(role) && l.costCents ? money(l.costCents) : null, day(l.receivedAt)].filter(Boolean).join(" · ")}
          outside={outside}
          more={more}
          onOpen={onOpen}
          onClose={onClose}
        >
          {now}
          {tabs}
          {body}
        </ListPanel>
      )}
    />
  );
}
