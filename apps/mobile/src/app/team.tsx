import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Role } from "@/data/types";
import { useI18n } from "@/i18n";
import { Avatar, Button, ChoiceChips, MultiChips, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { CardList, ItemCard, Screen } from "@/ui/surfaces";

const ROLES: Role[] = ["tech", "dispatcher", "director"];

/** Team: who works in the company (roles), subcontractors, invite a person. */
export default function Team() {
  const store = useStore();
  const { db } = store;
  const { t } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roles, setRoles] = useState<Role[]>(["tech"]);
  const [kind, setKind] = useState<"employee" | "sub">("employee");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  const ok = name.trim().length > 1 && (email.includes("@") || phone.replace(/\D/g, "").length >= 7) && roles.length > 0;
  const invite = () => {
    const undo = store.inviteMember({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined, roles, kind });
    toast.show(store.mode === "demo" ? t("team.invited", { name: name.trim() }) : t("team.inviteSoon"), store.mode === "demo" ? undo : undefined);
    setOpen(false);
    setName("");
    setEmail("");
    setPhone("");
  };
  return (
    <Screen
      title={t("team.title")}
      back={back}
      help={t("team.help")}
      hintKey="team"
      right={store.role === "director" ? <Button label={t("team.invite")} icon="plus" size="sm" onPress={() => setOpen(true)} /> : undefined}
    >
      <CardList>
        {db.members.map((m) => (
          <ItemCard
            key={m.id}
            title={m.name}
            subtitle={[m.roles.map((r) => t(`role.${r}`)).join(", "), m.kind === "sub" ? t("team.sub") : undefined, m.email ?? m.phone].filter(Boolean).join(" · ")}
            left={<Avatar initials={m.initials} sub={m.kind === "sub"} />}
            right={m.pending ? <StatusChip status="warn" label={t("team.pending")} /> : m.id === db.me ? <StatusChip status="ok" label={t("team.you")} /> : undefined}
          />
        ))}
      </CardList>
      <Sheet visible={open} onClose={() => setOpen(false)} title={t("team.invite")}>
        <View style={{ gap: space[3] }}>
          <TextField type="name" value={name} onChangeText={setName} placeholder={t("co.personName")} icon="user" />
          <TextField type="email" value={email} onChangeText={setEmail} placeholder={t("co.email")} icon="message" />
          <TextField type="phone" value={phone} onChangeText={setPhone} placeholder={t("co.phone")} icon="phone" />
          <T v="caption" tone="mut">
            {t("team.roles")}
          </T>
          <MultiChips value={roles} onChange={setRoles} items={ROLES.map((r) => ({ key: r, label: t(`role.${r}`) }))} />
          <ChoiceChips
            value={kind}
            onChange={setKind}
            items={[
              { key: "employee", label: t("team.employee") },
              { key: "sub", label: t("team.sub") },
            ]}
          />
          <T v="caption" tone="mut">
            {t("team.inviteHint")}
          </T>
          <Button label={t("team.send")} icon="send" full disabled={!ok} onPress={invite} />
        </View>
      </Sheet>
    </Screen>
  );
}
