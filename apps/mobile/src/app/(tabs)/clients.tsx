import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { customerBalance, useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Avatar, Button, ChoiceChips, StatusChip, TextField } from "@/ui/controls";
import { Card, CardList, Empty, RowView, Screen } from "@/ui/surfaces";
import { Icon, T } from "@/ui/primitives";
import { size, space } from "@octo/design-tokens";

type Filter = "all" | "owes" | "estimate" | "prospect";

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

/** Client list (each client a card): search by name, phone or address; filters; new client by hand. */
export default function Clients() {
  const { t, money } = useI18n();
  const { db } = useStore();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Filter>("all");
  const owes = (id: string) => customerBalance(db, id) > 0;
  const openEst = (id: string) => db.estimates.some((e) => e.customerId === id && e.status === "sent");
  const pass: Record<Filter, (c: (typeof db.customers)[number]) => boolean> = {
    all: (c) => c.status !== "prospect",
    owes: (c) => c.status !== "prospect" && owes(c.id),
    estimate: (c) => openEst(c.id),
    prospect: (c) => c.status === "prospect",
  };
  const count = (f: Filter) => db.customers.filter(pass[f]).length;
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const list = db.customers
    .filter(pass[tab])
    .filter((c) => {
      if (!needle) return true;
      const props = db.properties.filter((p) => p.customerId === c.id);
      return (
        c.name.toLowerCase().includes(needle) ||
        (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits)) ||
        props.some((p) => `${p.address} ${p.city}`.toLowerCase().includes(needle))
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Screen
      title={t("clients.title")}
      help={t("help.clients")}
      hintKey="clients"
      subtitle={t("clients.count", { n: count("all") })}
      right={<Button label={t("clients.new")} icon="plus" size="sm" onPress={() => router.push("/client/edit")} />}
    >
      <TextField value={q} onChangeText={setQ} placeholder={t("clients.search")} icon="search" />
      <ChoiceChips<Filter>
        value={tab}
        onChange={setTab}
        items={(["all", "owes", "estimate", "prospect"] as const).map((f) => ({ key: f, label: `${t(`clients.f.${f}`)} · ${count(f)}` }))}
      />
      {list.length === 0 ? (
        <Empty
          icon="search"
          title={t("clients.empty")}
          hint={t("clients.emptyHint")}
          action={<Button label={t("clients.new")} icon="plus" onPress={() => router.push("/client/edit")} />}
        />
      ) : (
        <CardList>
          {list.map((c) => {
            const props = db.properties.filter((p) => p.customerId === c.id);
            const balance = customerBalance(db, c.id);
            const open = db.estimates.filter((e) => e.customerId === c.id && e.status === "sent").length;
            return (
              <Card key={c.id} onPress={() => router.push(`/client/${c.id}`)} accessibilityLabel={c.name}>
                <RowView style={{ alignItems: "flex-start" }}>
                  <Avatar initials={initials(c.name)} />
                  <View style={{ flex: 1, gap: space[1] }}>
                    <T v="heading">{c.name}</T>
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
                    {balance > 0 || open > 0 ? (
                      <RowView style={{ flexWrap: "wrap" }}>
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
