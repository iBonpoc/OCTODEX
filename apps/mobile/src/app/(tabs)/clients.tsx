import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { canMarkNoService, clientHistory, clientMoneyOf, clientOverdueOf, clientStatusChip, matchClient, statusOf, tagLabel, tagsOf, visibleClients } from "@/features/clients";
import { canChangeStatus, pickerOptions } from "@/features/statusMoves";
import { useI18n } from "@/i18n";
import { Button, IconButton } from "@/ui/controls";
import { FilterBar } from "@/ui/filterBar";
import { filterStoreKey } from "@/ui/filterBarRules";
import { usePersistentState } from "@/data/persist";
import { CardList, Empty, ListRow, Screen } from "@/ui/surfaces";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { CardGrid, ListCard, ListCardHeader, StatusPicker } from "@/ui/listCard";
import type { FactKey } from "@/ui/listCardLayout";
import { useDevice } from "@/theme/ThemeProvider";
import { ListPanel } from "@/ui/listPanel";
import { useListPanel } from "@/nav/listPanel";
import { ClientCardBody } from "@/features/client/ClientCard";
import { space } from "@octo/design-tokens";
import type { Customer, CustomerStatus } from "@/data/types";

type Filter = "all" | "owes" | "estimate" | "prospect" | "archived";

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
/** desktop row columns (docs/specs/06-list-cards.md §5 «Клиенты») */
const COLUMNS: FactKey[] = ["phone", "addr", "last"];
/** with the panel open the row keeps one column of details (06 §4) */
const COLUMNS_PANEL: FactKey[] = ["phone"];

/** Client list (each client a card): search by name, phone or address; filters; new client by hand. */
export default function Clients() {
  const { t, money: moneyFmt, day } = useI18n();
  const { db, role } = useStore();
  const clients = visibleClients(db, role);
  const office = role !== "tech";
  const [q, setQ] = useState("");
  // spec 31 §6 п.7: the status and the tags are kept on this device for this list, until «Сбросить»; the search is not
  const [kept, setTab] = usePersistentState<Filter>(`${filterStoreKey("clients")}.status`, "all");
  const [keptTags, setTagIds] = usePersistentState<string[]>(`${filterStoreKey("clients")}.tags`, []);
  // what was kept may not fit any more: a role without that filter, a tag switched off or deleted
  const tagIds = keptTags.filter((id) => db.tags.some((x) => x.id === id && x.active));
  const owes = (id: string) => clientMoneyOf(db, id).owesCents > 0;
  const openEst = (id: string) => db.estimates.some((e) => e.customerId === id && e.status === "sent");
  const pass: Record<Filter, (c: (typeof db.customers)[number]) => boolean> = {
    all: (c) => statusOf(c) === "active" || statusOf(c) === "do_not_service",
    owes: (c) => statusOf(c) !== "prospect" && owes(c.id),
    estimate: (c) => openEst(c.id),
    prospect: (c) => statusOf(c) === "prospect",
    archived: (c) => statusOf(c) === "archived",
  };
  const filters: Filter[] = office ? ["all", "owes", "estimate", "prospect", "archived"] : ["all"];
  const tab: Filter = filters.includes(kept) ? kept : "all";
  const count = (f: Filter) => clients.filter(pass[f]).length;
  // search: name, number, any phone / email of any person, any property address, any document number
  const list = clients
    .filter(pass[tab])
    .filter((c) => matchClient(db, c, q))
    .filter((c) => tagIds.length === 0 || (c.tagIds ?? []).some((x) => tagIds.includes(x)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const { device } = useDevice();
  // 1280: the open card beside the list, `/clients?open=<id>` (spec 06 «Панель 1280», nav/listPanel.ts)
  const panel = useListPanel(list.map((c) => c.id), (id) => `/client/${id}`, (id) => clients.some((c) => c.id === id));
  const { desktop, openId } = panel;
  const openC = openId ? clients.find((c) => c.id === openId) : undefined;
  const toast = useToast();
  const store = useStore();
  const [picking, setPicking] = useState<Customer | null>(null);
  /** «…» of the list (13 §3.3): «Импорт из CSV» — the office's */
  const [more, setMore] = useState(false);
  /** archive: one tap with «Undo»; «do not service» needs a reason → the client's page (existing form) */
  const pickStatus = (c: Customer, s: CustomerStatus) => {
    setPicking(null);
    const move = pickerOptions("customer", statusOf(c)).find((o) => o.status === s);
    if (!move?.enabled) return;
    if (move.how === "form") return router.push(`/client/${c.id}`);
    toast.show(`${c.name}: ${t(clientStatusChip[s].l)}`, store.setCustomerStatus(c.id, s));
  };
  const groups = [...list.reduce((m, c) => m.set(c.name[0]!.toUpperCase(), [...(m.get(c.name[0]!.toUpperCase()) ?? []), c]), new Map<string, Customer[]>())];
  const card = (c: Customer) => {
    const props = db.properties.filter((p) => p.customerId === c.id);
    const money = office ? clientMoneyOf(db, c.id) : null;
    const figure = !money ? null : money.owesCents > 0 ? { cents: money.owesCents, label: "client.owes" as const } : money.paidTotalCents > 0 ? { cents: money.paidTotalCents, label: "client.paidTotal" as const } : null;
    const st = statusOf(c);
    const open = db.estimates.filter((e) => e.customerId === c.id && e.status === "sent").length;
    const last = clientHistory(db, c.id, role)[0];
    // computed sign: how much is overdue and how long — the oldest invoice (founder 07.11)
    const overdue = office ? clientOverdueOf(db, c.id) : null;
    const addr = props[0] ? `${props[0].address}, ${props[0].city}` : undefined;
    return (
      <ListCard
        key={c.id}
        title={c.name}
        lead={{ kind: "initials", text: initials(c.name), dashed: st === "prospect" }}
        // founder 07.11: one money figure in one place — the debt if any, otherwise the paid total
        value={figure ? moneyFmt(figure.cents) : undefined}
        valueLabel={figure ? t(figure.label) : undefined}
        // an active client has no chip (spec 06 §5); prospects, archive, «do not service» do — tappable when it can change
        status={st !== "active" ? { tone: clientStatusChip[st].s, label: t(clientStatusChip[st].l), onPress: office && canChangeStatus("customer", st) ? () => setPicking(c) : undefined } : undefined}
        signs={overdue ? [{ tone: "bad", label: t("fix.client.overdue", { amount: moneyFmt(overdue.cents), d: overdue.days }) }] : undefined}
        tags={[...tagsOf(db, c).slice(0, 3).map((x) => tagLabel(x, t)), ...(open > 0 ? [t("card.tag.estimateSent", { n: open })] : [])]}
        facts={{
          num: c.number,
          phone: c.phone,
          email: c.email,
          addr: addr && props.length > 1 ? `${addr} · ${t("clients.properties", { n: props.length })}` : addr,
          last: last ? [t(last.title), last.detail, day(last.at)].filter(Boolean).join(" · ") : undefined,
        }}
        contact={{ phone: c.phone, email: c.email, addr }}
        density={desktop ? "row" : "rich"}
        columns={openId ? COLUMNS_PANEL : COLUMNS}
        selected={c.id === openId}
        onPress={() => panel.open(c.id)}
      />
    );
  };
  return (
    <Screen
      title={t("clients.title")}
      help={t("help.clients")}
      hintKey="clients"
      subtitle={t("clients.count", { n: count("all") })}
      fab="clients"
      right={office ? <IconButton icon="more" label={t("lead.more")} onPress={() => setMore(true)} /> : undefined}
      aside={
        openC ? (
          <ListPanel title={openC.name} onOpen={panel.full} onClose={panel.close}>
            <ClientCardBody key={openC.id} c={openC} />
          </ListPanel>
        ) : undefined
      }
    >
      {/* spec 31 (variant Б): the search and «Фильтр» in one row, one lane of statuses, the tags in the sheet */}
      <FilterBar<Filter>
        search={{ value: q, onChange: setQ, placeholder: t("clients.search") }}
        value={tab}
        onChange={setTab}
        items={filters.map((f) => ({ key: f, label: t(`clients.f.${f}`), count: count(f) }))}
        groups={[
          {
            key: "tags",
            title: t("fix.filters.tags"),
            options: db.tags
              .filter((x) => x.active)
              .sort((a, b) => a.position - b.position)
              .map((x) => ({ key: x.id, label: tagLabel(x, t), count: clients.filter(pass[tab]).filter((c) => (c.tagIds ?? []).includes(x.id)).length, on: tagIds.includes(x.id) })),
            onToggle: (id) => setTagIds(tagIds.includes(id) ? tagIds.filter((y) => y !== id) : [...tagIds, id]),
          },
        ]}
        onReset={() => setTagIds([])}
      />
      {list.length === 0 ? (
        <Empty
          icon="search"
          title={t("clients.empty")}
          hint={q.trim() ? t("clients.emptyHint") : t("card.emptyFilter")}
          action={office && q.trim() ? <Button label={t("clients.new")} icon="plus" variant="secondary" onPress={() => router.push("/client/edit")} /> : undefined}
        />
      ) : device === "tablet" ? (
        <CardGrid>{list.map(card)}</CardGrid>
      ) : (
        <>
          {desktop ? <ListCardHeader title={t("card.fact.client")} columns={openId ? COLUMNS_PANEL : COLUMNS} value={office ? t("fix.client.balance") : undefined} /> : null}
          {groups.map(([letter, cs]) => (
          <View key={letter} style={{ gap: space[2] }}>
            <T v="caption" w="semibold" tone="mut">{letter}</T>
            <CardList>{cs.map(card)}</CardList>
          </View>
          ))}
        </>
      )}
      {picking ? (
        <StatusPicker
          visible
          onClose={() => setPicking(null)}
          title={`${t("card.statusTitle")} · ${picking.name}`}
          options={pickerOptions("customer", statusOf(picking)).map((o) => {
            const chip = clientStatusChip[o.status as CustomerStatus];
            // «Не обслуживаем» — the director's and the office's only (04 §12.8)
            return { key: o.status, tone: chip.s, label: t(chip.l), current: o.current, enabled: o.enabled && (o.status !== "do_not_service" || canMarkNoService(role)), form: o.how === "form" };
          })}
          onPick={(k) => pickStatus(picking, k as CustomerStatus)}
        />
      ) : null}
      <Sheet visible={more} onClose={() => setMore(false)} title={t("clients.title")}>
        <ListRow title={t("client.import.menu")} onPress={() => { setMore(false); router.push("/client/import"); }} />
      </Sheet>
    </Screen>
  );
}
