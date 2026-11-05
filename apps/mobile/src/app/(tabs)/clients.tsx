import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { customerBalance, useStore } from "@/data/store";
import { clientStatusChip, matchClient, statusOf, tagLabel, tagsOf, visibleClients } from "@/features/clients";
import { useI18n } from "@/i18n";
import { Avatar, Button, ChoiceChips, StatusChip, TagChip, TextField } from "@/ui/controls";
import { Card, CardList, Empty, RowView, Screen } from "@/ui/surfaces";
import { Icon, T } from "@/ui/primitives";
import { size, space } from "@octo/design-tokens";

type Filter = "all" | "owes" | "estimate" | "prospect" | "archived";

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

/** Client list (each client a card): search by name, phone or address; filters; new client by hand. */
export default function Clients() {
  const { t, money } = useI18n();
  const { db, role } = useStore();
  const clients = visibleClients(db, role);
  const office = role !== "tech";
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Filter>("all");
  const owes = (id: string) => customerBalance(db, id) > 0;
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
    .sort((a, b) => a.name.localeCompare(b.name));
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
      {list.length === 0 ? (
        <Empty
          icon="search"
          title={t("clients.empty")}
          hint={t("clients.emptyHint")}
          action={office ? <Button label={t("clients.new")} icon="plus" onPress={() => router.push("/client/edit")} /> : undefined}
        />
      ) : (
        <CardList>
          {list.map((c) => {
            const props = db.properties.filter((p) => p.customerId === c.id);
            const balance = office ? customerBalance(db, c.id) : 0;
            const st = statusOf(c);
            const tags = tagsOf(db, c);
            const open = db.estimates.filter((e) => e.customerId === c.id && e.status === "sent").length;
            return (
              <Card key={c.id} onPress={() => router.push(`/client/${c.id}`)} accessibilityLabel={c.name}>
                <RowView style={{ alignItems: "flex-start" }}>
                  <Avatar initials={initials(c.name)} />
                  <View style={{ flex: 1, gap: space[1] }}>
                    <T v="heading">{c.name}</T>
                    {c.number ? (
                      <T v="micro" tone="mut">
                        {c.number}
                      </T>
                    ) : null}
                    {props[0] ? (
                      <RowView gap={space[1]}>
                        <Icon name="pin" s={size.iconSm} />
                        <T v="caption" tone="mut" numberOfLines={1} style={{ flex: 1 }}>
                          {props[0].address}, {props[0].city}
                          {props.length > 1 ? ` · ${t("clients.properties", { n: props.length })}` : ""}
                        </T>
                      </RowView>
                    ) : null}
                    {c.phone ? (
                      <RowView gap={space[1]}>
                        <Icon name="phone" s={size.iconSm} />
                        <T v="caption" tone="mut" tabular>
                          {c.phone}
                        </T>
                      </RowView>
                    ) : null}
                    {balance > 0 || open > 0 || st !== "active" || tags.length ? (
                      <RowView style={{ flexWrap: "wrap" }}>
                        {st !== "active" ? <StatusChip status={clientStatusChip[st].s} label={t(clientStatusChip[st].l)} /> : null}
                        {tags.slice(0, 3).map((x) => (
                          <TagChip key={x.id} label={tagLabel(x, t)} />
                        ))}
                        {balance > 0 ? <StatusChip status="warn" label={`${t("money.awaiting")} ${money(balance)}`} /> : null}
                        {open > 0 ? <StatusChip status="info" label={`${t("st.sent")} · ${open}`} /> : null}
                      </RowView>
                    ) : null}
                  </View>
                  <Icon name="chevronRight" s={size.iconSm} />
                </RowView>
              </Card>
            );
          })}
        </CardList>
      )}
    </Screen>
  );
}
