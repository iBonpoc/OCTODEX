import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Avatar, StatusChip, TextField } from "@/ui/controls";
import { Card, Divider, Empty, ListRow, Screen } from "@/ui/surfaces";

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

/** Client list with search by name, phone or address. */
export default function Clients() {
  const { t, money } = useI18n();
  const { db } = useStore();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const list = db.customers
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
    <Screen title={t("clients.title")} help={t("help.clients")} subtitle={t("clients.count", { n: db.customers.length })}>
      <TextField value={q} onChangeText={setQ} placeholder={t("clients.search")} icon="search" />
      {list.length === 0 ? (
        <Empty icon="search" title={t("clients.empty")} hint={t("clients.emptyHint")} />
      ) : (
        <Card>
          {list.map((c, i) => {
            const props = db.properties.filter((p) => p.customerId === c.id);
            return (
              <View key={c.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={c.name}
                  subtitle={`${props[0]?.address ?? ""}${props.length > 1 ? ` · ${t("clients.properties", { n: props.length })}` : ""}`}
                  left={<Avatar initials={initials(c.name)} />}
                  right={c.balanceCents > 0 ? <StatusChip status="warn" label={money(c.balanceCents)} /> : undefined}
                  onPress={() => router.push(`/client/${c.id}`)}
                />
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
