import { useEffect, useState } from "react";
import { Linking } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { usePersistentState } from "@/data/persist";
import type { Lead } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { canSeeLead, filterLeads, isClosedLead, isOpenLead, leadStatusView, leadTurn, sourceName } from "@/features/leads";
import { leadSettingsOf } from "@/features/leadSettings";
import { cleanPhone, smsHref } from "@/features/contactLinks";
import { useDialThenAsk } from "@/features/comms/dial";
import { CloseSheet } from "@/features/lead/LeadParts";
import { CallResultSheet } from "@/features/lead/LeadSheets";
import { leadRowLine, leadWaitLabel } from "@/features/lead/leadRows";
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
 * Old addresses: `?tab=estimates|invoices` go to their sections (07.11), `?open=<id>` (the 1280 panel) opens the lead's screen.
 */
export default function Leads() {
  const { tab: want, open } = useLocalSearchParams<{ tab?: string; open?: string }>();
  useEffect(() => {
    if (want === "estimates") router.replace("/estimates");
    else if (want === "invoices") router.replace("/invoice");
    else if (open) {
      router.setParams({ open: undefined });
      router.push(`/lead/${open}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the address came
  }, []);
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
    const n = c === "archive" || c === "open" ? 0 : pass[c]().length;
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
      subtitle: leadRowLine(l, turn, { t, day, source: sourceName(db, l.sourceId) }),
      lead: { initials: initials(l.name) },
      // how long the client waits — first (wireframes №16); a closed or won lead says its status
      status: wait ? { status: turn.status, label: wait } : !isOpenLead(l) ? { status: sv.status, label: t(sv.label) } : undefined,
      actions:
        isOpenLead(l) && tel
          ? [
              bySms
                ? { icon: "sms" as const, a11y: `${t("cc.sms")} ${l.name}`, onPress: () => sms(l), testID: `lead-row-sms-${l.id}` }
                : { icon: "phone" as const, a11y: `${t("client.call")} ${l.name}`, onPress: () => call(l), testID: `lead-row-tel-${l.id}` },
            ]
          : undefined,
      swipe: { left: swipeLeft, right: swipeRight },
      onPress: () => router.push(`/lead/${l.id}`),
    };
  };
  const newLead = () => router.push("/lead/new");
  const visible = db.leads.filter((l) => canSeeLead(role, db.me, l));
  return (
    <>
      <ListScreen<Lead>
        testID="leads"
        title={t("sales.leads")}
        count={open.length}
        create={{ a11y: t("quick.lead"), items: [{ key: "new", label: t("quick.lead"), icon: "inbox", testID: "leads-create-new" }] }}
        onCreate={newLead}
        search={{ placeholder: t("lead.search"), value: q, onChange: setQ }}
        chips={{ items: chips.map((c) => ({ key: c, label: label(c) })), value: chip, onChange: setKept }}
        groups={groups}
        row={row}
        more={role === "director" ? [{ key: "settings", label: t("co.leads.title"), icon: "sliders", testID: "leads-more-settings" }] : undefined}
        onMore={() => router.push("/company/leads")}
        empty={
          <Empty
            icon="inbox"
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
