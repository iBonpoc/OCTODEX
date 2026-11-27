import { useDayWord } from "@/features/useDayWord";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { usePersistentState } from "@/data/persist";
import type { Customer } from "@/data/types";
import { canImportClients } from "@/features/client/importRun";
import { clientHistory, clientMoneyOf, clientNextVisit, clientOverdueOf, clientStatusChip, matchClient, statusOf, tagLabel, visibleClients } from "@/features/clients";
import { canSeeClientDups, clientDuplicates } from "@/features/clientDuplicates";
import { clientListGroups } from "@/features/clientGroups";
import { dayOffsetOf, isoDayKey } from "@/features/calendar";
import { smsHref, telHref } from "@/features/contactLinks";
import { shortAddress } from "@/features/shortAddress";
import { pickerOptions } from "@/features/statusMoves";
import { useI18n } from "@/i18n";
import { ClientOverview, useAgo, useClientFacts } from "@/features/client/ClientSections";
import { useListPanel } from "@/nav/listPanel";
import { ListPanel } from "@/ui/listPanel";
import { Button } from "@/ui/controls";
import { filterStoreKey } from "@/ui/filterBarRules";
import { openContact } from "@/ui/listCard";
import { useToast } from "@/ui/overlays";
import { Empty } from "@/ui/surfaces";
import type { SwipeAction } from "@/ui/swipeRow";
import { ListScreen } from "@/ui/templates";

/** «Все · Должны · Смета у клиента · Новые · Архив» and the company's tags (`tag:<id>`) — one strip that scrolls sideways */
type Filter = "all" | "owes" | "estimate" | "prospect" | "archived" | `tag:${string}`;

const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "#";

/**
 * Клиенты — шаблон «Список» (prototype v2, wireframes-v2 «Клиенты», BUILD-SPEC §2.3, LAYOUT-RULES §3): the title with the count,
 * search as an icon of the header, filters one strip (statuses and tags), rows 56 grouped by letter: initials, the name, one line
 * «когда · что», on the right the debt with «! N дн» or the status; one card of rows under 50 clients, the letters from 50. A swipe
 * right calls, left shows «SMS» and «В архив» (with «Отменить»); the same
 * two on a long press and to VoiceOver (the web has no swipe). «＋» — a new client; «⋯» — import from CSV (the office's).
 */
export default function Clients() {
  const { t, money, day, time } = useI18n();
  const dw = useDayWord();
  const store = useStore();
  const { db, role } = store;
  const toast = useToast();
  const ago = useAgo();
  const clients = visibleClients(db, role);
  const office = role !== "tech";
  const [q, setQ] = useState("");
  // spec 31 §6 п.7: the chosen filter is kept on this device for this list; the search is not
  const [kept, setKept] = usePersistentState<Filter>(`${filterStoreKey("clients")}.status`, "all");
  const owes = (id: string) => clientMoneyOf(db, id).owesCents > 0;
  const dups = useMemo(
    () => (canSeeClientDups(role) ? clientDuplicates(db) : new Map<string, unknown[]>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the clients and their properties decide
    [role, db.customers, db.properties],
  );
  const openEst = (id: string) => db.estimates.some((e) => e.customerId === id && e.status === "sent");
  const tags = db.tags.filter((x) => x.active).sort((a, b) => a.position - b.position);
  const pass = (f: Filter) => (c: Customer) => {
    const st = statusOf(c);
    if (f === "all") return st === "active" || st === "do_not_service";
    if (f === "owes") return st !== "prospect" && owes(c.id);
    if (f === "estimate") return openEst(c.id);
    if (f === "prospect") return st === "prospect";
    if (f === "archived") return st === "archived";
    return st !== "archived" && (c.tagIds ?? []).includes(f.slice(4));
  };
  const count = (f: Filter) => clients.filter(pass(f)).length;
  const filters: Filter[] = office ? ["all", "owes", "estimate", "prospect", ...tags.map((x) => `tag:${x.id}` as Filter), "archived"] : ["all"];
  const tab: Filter = filters.includes(kept) ? kept : "all";
  const label = (f: Filter) => {
    if (f.startsWith("tag:")) {
      const tag = tags.find((x) => `tag:${x.id}` === f);
      return tag ? tagLabel(tag, t) : f;
    }
    const n = count(f);
    const word = t(`clients.f.${f as "all" | "owes" | "estimate" | "prospect" | "archived"}`);
    return f === "archived" || !n ? word : `${word} ${n}`;
  };
  const list = clients
    .filter(pass(tab))
    .filter((c) => matchClient(db, c, q))
    .sort((a, b) => a.name.localeCompare(b.name));
  // one card of rows 56 under 50 clients, the letters from 50 (wireframes-v2; #2014: an empty name goes to «#», never brings the list down)
  const groups = clientListGroups(list);
  // 1280: the client opens beside the list (ListScreen `aside`, ListPanel — «Сейчас» and the client's Обзор); 390/820 — his screen
  const panel = useListPanel(list.map((c) => c.id), (id) => `/client/${id}`, (id) => clients.some((c) => c.id === id));
  const openC = panel.openId ? clients.find((c) => c.id === panel.openId) : undefined;

  /** archive in one tap with «Отменить» — the same move as the status picker (do-not-service needs a reason: the client's page) */
  const archive = (c: Customer) => toast.show(`${c.name}: ${t(clientStatusChip.archived.l)}`, store.setCustomerStatus(c.id, "archived"));
  const row = (c: Customer) => {
    const st = statusOf(c);
    const m = office ? clientMoneyOf(db, c.id) : null;
    const overdue = office ? clientOverdueOf(db, c.id) : null;
    const next = clientNextVisit(db, c.id);
    const off = next ? dayOffsetOf(isoDayKey(next.start)) : -1;
    const nextDay = !next ? "" : dw(next.start); // #2363 F46: the one rule (features/dayWords.ts)
    const last = clientHistory(db, c.id, role)[0];
    const prop = db.properties.find((p) => p.customerId === c.id);
    // #3017 (founder 27.11: «я знаю его по адресу»): line 2 — the address; line 3 — what is going on: the next visit, else what
    // happened last; no line for what is not there (no «—»)
    const addr = prop ? shortAddress(prop.address, prop.city) : undefined;
    const line = next
      ? [`${nextDay} ${time(next.start)}`, db.jobs.find((j) => j.id === next.jobId)?.title ?? t("plan.kind.inspection")].join(" · ")
      : last
        // what happened first, then when: «Оплата · RCT-0104 · сегодня» never reads as a deed for today (crm-review 27.11)
        ? [t(last.title), last.detail, ago(last.at).toLowerCase()].filter(Boolean).join(" · ")
        : undefined;
    const tel = telHref(c.phone);
    const toArchive = office && pickerOptions("customer", st).find((o) => o.status === "archived" && o.enabled && o.how !== "form");
    const sms = smsHref(c.phone);
    // a swipe right — «Позвонить»; left — «SMS» and «В архив» (#2350 «смахивание: позвонить / SMS»); the same on a long press and to VoiceOver
    const swipeLeft: SwipeAction[] = tel ? [{ key: "call", label: t("swipe.call"), icon: "phone", testID: `client-row-swipe-call-${c.id}`, onPress: () => openContact({ kind: "call", icon: "phone", url: tel, value: c.phone ?? "" }) }] : [];
    const swipeRight: SwipeAction[] = [
      ...(sms ? [{ key: "sms", label: t("cc.sms"), icon: "sms" as const, testID: `client-row-swipe-sms-${c.id}`, onPress: () => openContact({ kind: "sms", icon: "sms", url: sms, value: c.phone ?? "" }) }] : []),
      ...(toArchive ? [{ key: "archive", label: t("swipe.archive"), icon: "box" as const, tone: "bad" as const, testID: `client-row-swipe-archive-${c.id}`, onPress: () => archive(c) }] : []),
    ];
    const status = overdue
      // the word with the figure (rule 2, design-review 27.11): «Просрочен 9 дн», not a bare «9 дн»
      ? { status: "bad" as const, label: t("w2m.due.late", { d: overdue.days }) }
      : st !== "active"
        ? { status: clientStatusChip[st].s, label: t(clientStatusChip[st].l) }
        : dups.get(c.id)?.length
          ? { status: "warn" as const, label: t("clientDup.sign") }
          : undefined;
    return {
      key: c.id,
      testID: `client-row-${c.id}`,
      title: c.name,
      // #3017: the phone in the name's own line
      titleNote: c.phone || undefined,
      subtitle: addr ?? line,
      extra: addr ? line : undefined,
      lead: { initials: initials(c.name) },
      // one money figure: the debt; none — a call icon (BUILD-SPEC §2.3 table)
      value: m && m.owesCents > 0 ? money(m.owesCents) : undefined,
      status,
      // #3017: the call stays for a debtor too — they are called most (crm-review 27.11)
      actions: tel ? [{ icon: "phone" as const, a11y: `${t("client.call")} ${c.name}`, onPress: () => openContact({ kind: "call", icon: "phone", url: tel, value: c.phone ?? "" }), testID: `client-row-call-${c.id}` }] : undefined,
      swipe: { left: swipeLeft, right: swipeRight },
      onPress: () => panel.open(c.id),
      selected: panel.openId === c.id,
    };
  };
  return (
    <ListScreen<Customer>
      testID="clients"
      title={t("clients.title")}
      // #3017 (founder 27.11, on the stand): each client its own card
      separate
      // #2763 (DS §12 «Список»): the title counts what is shown — the chip and the search, not all of the kind
      create={office ? { a11y: t("clients.new"), items: [{ key: "new", label: t("path.clientNew"), icon: "user", testID: "clients-create-new" }] } : undefined}
      onCreate={() => router.push("/client/edit")}
      search={{ placeholder: t("clients.search"), value: q, onChange: setQ }}
      chips={office ? { items: filters.map((f) => ({ key: f, label: label(f) })), value: tab, onChange: (k) => setKept(k as Filter) } : undefined}
      groups={groups}
      row={row}
      // «⋯» — import from CSV: the office's (owner, admin, office), not sales (04 §14.4)
      more={canImportClients(role) ? [{ key: "import", label: t("client.import.menu"), icon: "invoice", testID: "clients-more-import" }, { key: "imports", label: t("client.imports.menu"), icon: "history", testID: "clients-more-imports" }] : undefined}
      onMore={(k) => router.push(k === "import" ? "/client/import" : "/client/imports")}
      aside={openC ? <ClientAside key={openC.id} c={openC} outside={panel.outside} onOpen={panel.full} onClose={panel.close} /> : undefined}
      empty={
        <Empty
          icon="search"
          title={t("clients.empty")}
          hint={q.trim() ? t("clients.emptyHint") : t("card.emptyFilter")}
          action={office ? <Button testID="clients-empty-new" label={t("clients.new")} icon="plus" variant="secondary" onPress={() => router.push("/client/edit")} /> : undefined}
        />
      }
    />
  );
}

/** the client beside the list on 1280: the panel's head (name, «⤢ Открыть», «✕») and his Обзор; a section opens his screen */
function ClientAside({ c, outside, onOpen, onClose }: { c: Customer; outside: boolean; onOpen: () => void; onClose: () => void }) {
  const f = useClientFacts(c);
  const { t } = useI18n();
  const { role } = useStore();
  // as the client's screen: «Изменить» for the office, no «＋» (prototype v6, #1343)
  const actions =
    role !== "tech" ? (
      <View testID="list-panel-edit">
        <Button label={t("ue.edit")} icon="pencil" variant="ghost" size="sm" onPress={() => router.push(`/client/edit?id=${c.id}`)} />
      </View>
    ) : undefined;
  return (
    <ListPanel title={c.name || "—"} outside={outside} actions={actions} onOpen={onOpen} onClose={onClose}>
      <ClientOverview c={c} f={f} onSection={onOpen} />
    </ListPanel>
  );
}
