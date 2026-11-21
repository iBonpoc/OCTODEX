import { useMemo, useState } from "react";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { usePersistentState } from "@/data/persist";
import type { Customer } from "@/data/types";
import { canImportClients } from "@/features/client/importRun";
import { clientHistory, clientMoneyOf, clientNextVisit, clientOverdueOf, clientStatusChip, matchClient, statusOf, tagLabel, visibleClients } from "@/features/clients";
import { canSeeClientDups, clientDuplicates } from "@/features/clientDuplicates";
import { groupByLetter } from "@/features/clientGroups";
import { dayOffsetOf, isoDayKey } from "@/features/calendar";
import { telHref } from "@/features/contactLinks";
import { pickerOptions } from "@/features/statusMoves";
import { useI18n } from "@/i18n";
import { useAgo } from "@/features/client/ClientSections";
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
 * «когда · что», on the right the debt with «! N дн» or the status. A swipe right calls, left archives with «Отменить»; the same
 * two on a long press and to VoiceOver (the web has no swipe). «＋» — a new client; «⋯» — import from CSV (the office's).
 */
export default function Clients() {
  const { t, money, day, time } = useI18n();
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
  // #2014: an empty name goes to «#», never brings the list down
  const groups = groupByLetter(list).map(([letter, rows]) => ({ key: letter, title: letter, rows }));

  /** archive in one tap with «Отменить» — the same move as the status picker (do-not-service needs a reason: the client's page) */
  const archive = (c: Customer) => toast.show(`${c.name}: ${t(clientStatusChip.archived.l)}`, store.setCustomerStatus(c.id, "archived"));
  const row = (c: Customer) => {
    const st = statusOf(c);
    const m = office ? clientMoneyOf(db, c.id) : null;
    const overdue = office ? clientOverdueOf(db, c.id) : null;
    const next = clientNextVisit(db, c.id);
    const off = next ? dayOffsetOf(isoDayKey(next.start)) : -1;
    const nextDay = !next ? "" : off === 0 ? t("common.today") : off === 1 ? t("common.tomorrow") : day(next.start);
    const last = clientHistory(db, c.id, role)[0];
    const prop = db.properties.find((p) => p.customerId === c.id);
    // one line «когда · что»: the next visit, else what happened last, else the address
    const line = next
      ? [`${nextDay} ${time(next.start)}`, db.jobs.find((j) => j.id === next.jobId)?.title ?? t("plan.kind.inspection")].join(" · ")
      : last
        ? [ago(last.at), t(last.title), last.detail].filter(Boolean).join(" · ")
        : prop
          ? [prop.address, prop.city].filter(Boolean).join(", ")
          : undefined;
    const tel = telHref(c.phone);
    const toArchive = office && pickerOptions("customer", st).find((o) => o.status === "archived" && o.enabled && o.how !== "form");
    const swipeLeft: SwipeAction[] = tel ? [{ key: "call", label: t("swipe.call"), icon: "phone", onPress: () => openContact({ kind: "call", icon: "phone", url: tel, value: c.phone ?? "" }) }] : [];
    const swipeRight: SwipeAction[] = toArchive ? [{ key: "archive", label: t("swipe.archive"), icon: "box", tone: "bad", onPress: () => archive(c) }] : [];
    const status = overdue
      ? { status: "bad" as const, label: t("proto.client.lateDays", { d: overdue.days }) }
      : st !== "active"
        ? { status: clientStatusChip[st].s, label: t(clientStatusChip[st].l) }
        : dups.get(c.id)?.length
          ? { status: "warn" as const, label: t("clientDup.sign") }
          : undefined;
    return {
      key: c.id,
      testID: `client-row-${c.id}`,
      title: c.name,
      subtitle: line,
      lead: { initials: initials(c.name) },
      // one money figure: the debt; none — a call icon (BUILD-SPEC §2.3 table)
      value: m && m.owesCents > 0 ? money(m.owesCents) : undefined,
      status,
      actions: !m?.owesCents && !status && tel ? [{ icon: "phone" as const, a11y: `${t("client.call")} ${c.name}`, onPress: () => openContact({ kind: "call", icon: "phone", url: tel, value: c.phone ?? "" }), testID: `client-row-call-${c.id}` }] : undefined,
      swipe: { left: swipeLeft, right: swipeRight },
      onPress: () => router.push(`/client/${c.id}`),
    };
  };
  return (
    <ListScreen<Customer>
      testID="clients"
      title={t("clients.title")}
      count={count("all")}
      create={office ? { a11y: t("clients.new"), items: [{ key: "new", label: t("path.clientNew"), icon: "user", testID: "clients-create-new" }] } : undefined}
      onCreate={() => router.push("/client/edit")}
      search={{ placeholder: t("clients.search"), value: q, onChange: setQ }}
      chips={office ? { items: filters.map((f) => ({ key: f, label: label(f) })), value: tab, onChange: (k) => setKept(k as Filter) } : undefined}
      groups={groups}
      row={row}
      // «⋯» — import from CSV: the office's (owner, admin, office), not sales (04 §14.4)
      more={canImportClients(role) ? [{ key: "import", label: t("client.import.menu"), icon: "invoice" }, { key: "imports", label: t("client.imports.menu"), icon: "history" }] : undefined}
      onMore={(k) => router.push(k === "import" ? "/client/import" : "/client/imports")}
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
