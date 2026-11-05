import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { clientHistory, clientMoneyOf, clientStatusChip, matchClient, statusOf, tagLabel, tagsOf, visibleClients } from "@/features/clients";
import { canChangeStatus, pickerOptions } from "@/features/statusMoves";
import { invoiceSigns } from "@/features/listSigns";
import { useI18n } from "@/i18n";
import { Button, ChoiceChips, MultiChips, TextField } from "@/ui/controls";
import { CardList, Empty, Screen } from "@/ui/surfaces";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { CardGrid, ListCard, ListCardHeader, StatusPicker } from "@/ui/listCard";
import type { FactKey } from "@/ui/listCardLayout";
import { useDevice } from "@/theme/ThemeProvider";
import { space } from "@octo/design-tokens";
import type { Customer, CustomerStatus } from "@/data/types";

type Filter = "all" | "owes" | "estimate" | "prospect" | "archived";

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
/** desktop row columns (docs/specs/06-list-cards.md §5 «Клиенты») */
const COLUMNS: FactKey[] = ["phone", "addr", "last"];

/** Client list (each client a card): search by name, phone or address; filters; new client by hand. */
export default function Clients() {
  const { t, money: moneyFmt, day } = useI18n();
  const { db, role } = useStore();
  const clients = visibleClients(db, role);
  const office = role !== "tech";
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Filter>("all");
  const [tagIds, setTagIds] = useState<string[]>([]);
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
  const count = (f: Filter) => clients.filter(pass[f]).length;
  // search: name, number, any phone / email of any person, any property address, any document number
  const list = clients
    .filter(pass[tab])
    .filter((c) => matchClient(db, c, q))
    .filter((c) => tagIds.length === 0 || (c.tagIds ?? []).some((x) => tagIds.includes(x)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const { device } = useDevice();
  const toast = useToast();
  const store = useStore();
  const [picking, setPicking] = useState<Customer | null>(null);
  /** archive: one tap with «Undo»; «do not service» needs a reason → the client's page (existing form) */
  const pickStatus = (c: Customer, s: CustomerStatus) => {
    setPicking(null);
    const move = pickerOptions("customer", statusOf(c)).find((o) => o.status === s);
    if (!move?.enabled) return;
    if (move.how === "form") return router.push(`/client/${c.id}`);
    toast.show(t("client.statusSaved"), store.setCustomerStatus(c.id, s));
  };
  const groups = [...list.reduce((m, c) => m.set(c.name[0]!.toUpperCase(), [...(m.get(c.name[0]!.toUpperCase()) ?? []), c]), new Map<string, Customer[]>())];
  const card = (c: Customer) => {
    const props = db.properties.filter((p) => p.customerId === c.id);
    const money = office ? clientMoneyOf(db, c.id) : null;
    const st = statusOf(c);
    const open = db.estimates.filter((e) => e.customerId === c.id && e.status === "sent").length;
    const last = clientHistory(db, c.id, role)[0];
    // computed sign (map §5): the worst overdue invoice of the client
    const overdue = office ? db.invoices.filter((i) => i.customerId === c.id).flatMap((i) => invoiceSigns(i)).filter((x) => x.key === "card.sign.overdueDays") : [];
    const addr = props[0] ? `${props[0].address}, ${props[0].city}` : undefined;
    return (
      <ListCard
        key={c.id}
        title={c.name}
        lead={{ kind: "initials", text: initials(c.name), dashed: st === "prospect" }}
        value={money && money.owesCents > 0 ? moneyFmt(money.owesCents) : undefined}
        valueLabel={money && money.owesCents > 0 ? t("client.owes") : undefined}
        // an active client has no chip (spec 06 §5); prospects, archive, «do not service» do — tappable when it can change
        status={st !== "active" ? { tone: clientStatusChip[st].s, label: t(clientStatusChip[st].l), onPress: office && canChangeStatus("customer", st) ? () => setPicking(c) : undefined } : undefined}
        signs={overdue.length ? [{ tone: "bad", label: t("card.sign.overdueDays", { d: Math.max(...overdue.map((x) => x.params?.d ?? 0)) }) }] : undefined}
        tags={[...tagsOf(db, c).slice(0, 3).map((x) => tagLabel(x, t)), ...(open > 0 ? [`${t("st.sent")} · ${open}`] : [])]}
        facts={{
          num: c.number,
          phone: c.phone,
          email: c.email,
          addr: addr && props.length > 1 ? `${addr} · ${t("clients.properties", { n: props.length })}` : addr,
          last: last ? [t(last.title), last.detail, day(last.at)].filter(Boolean).join(" · ") : undefined,
        }}
        figures={money ? [{ label: t("client.paidTotal"), value: moneyFmt(money.paidTotalCents) }] : undefined}
        contact={{ phone: c.phone, email: c.email, addr }}
        density={device === "desktop" ? "row" : "rich"}
        columns={COLUMNS}
        onPress={() => router.push(`/client/${c.id}`)}
      />
    );
  };
  return (
    <Screen
      title={t("clients.title")}
      help={t("help.clients")}
      hintKey="clients"
      subtitle={t("clients.count", { n: count("all") })}
      right={office ? <Button label={t("clients.new")} icon="plus" size="sm" onPress={() => router.push("/client/edit")} /> : undefined}
    >
      <TextField type="search" value={q} onChangeText={setQ} placeholder={t("clients.search")} icon="search" />
      <ChoiceChips<Filter>
        value={tab}
        onChange={setTab}
        items={filters.map((f) => ({ key: f, label: `${t(`clients.f.${f}`)} · ${count(f)}` }))}
      />
      {db.tags.some((x) => x.active) ? (
        <MultiChips<string>
          value={tagIds}
          onChange={setTagIds}
          items={db.tags.filter((x) => x.active).sort((a, b) => a.position - b.position).map((x) => ({ key: x.id, label: tagLabel(x, t) }))}
        />
      ) : null}
      {list.length === 0 ? (
        <Empty
          icon="search"
          title={t("clients.empty")}
          hint={t("clients.emptyHint")}
          action={office ? <Button label={t("clients.new")} icon="plus" onPress={() => router.push("/client/edit")} /> : undefined}
        />
      ) : device === "tablet" ? (
        <CardGrid>{list.map(card)}</CardGrid>
      ) : (
        <>
          {device === "desktop" ? <ListCardHeader title={t("card.fact.client")} columns={COLUMNS} value={office ? t("client.owes") : undefined} /> : null}
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
            return { key: o.status, tone: chip.s, label: t(chip.l), current: o.current, enabled: o.enabled, form: o.how === "form" };
          })}
          onPick={(k) => pickStatus(picking, k as CustomerStatus)}
        />
      ) : null}
    </Screen>
  );
}
