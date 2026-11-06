import { lateAfterOf } from "@/features/scheduleSettings";
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Member, Role } from "@/data/types";
import { useI18n } from "@/i18n";
import { Button, ChoiceChips, MultiChips, TextField, Toggle } from "@/ui/controls";
import { canGrantSign } from "@/features/estimateSign";
import { todayVisits, visitStatus } from "@/features/visits";
import { crewNow } from "@/features/crewList";
import { visitContext } from "@/data/selectors";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { CardList, RowView, Screen } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";
import { useDevice } from "@/theme/ThemeProvider";

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
  const [editing, setEditing] = useState<Member | null>(null);
  const { device } = useDevice();
  const ok = name.trim().length > 1 && (email.includes("@") || phone.replace(/\D/g, "").length >= 7) && roles.length > 0;
  const invite = () => {
    const undo = store.inviteMember({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined, roles, kind });
    toast.show(store.mode === "demo" ? t("team.invited", { name: name.trim() }) : t("team.inviteSoon"), store.mode === "demo" ? undo : undefined);
    setOpen(false);
    setName("");
    setEmail("");
    setPhone("");
  };
  /**
   * One list card per person (spec 06 §5 «Команда», PR9b): name, roles and «Субподрядчик» / «Вы» as grey tags,
   * «today» for a tech (visits count, the visit's own status — read only, as in «Бригады сейчас»), phone and email,
   * call / SMS. «Приглашён» is neutral (not a problem to fix). No coloured edge: nothing here needs action.
   */
  const card = (m: Member) => {
    const tech = m.roles.includes("tech");
    const vs = tech && !m.pending ? todayVisits(db, m.id) : [];
    const { current, next } = crewNow(vs);
    const st = current ? visitStatus(current, Date.now(), lateAfterOf(db)) : next ? visitStatus(next, Date.now(), lateAfterOf(db)) : null;
    const now = current ? visitContext(db, current) : null;
    const status = m.pending ? { tone: "neutral" as const, label: t("team.pending") } : st ? { tone: st.status, label: t(st.label) } : undefined;
    return (
      <ListCard
        key={m.id}
        title={m.name}
        when={tech && !m.pending ? t("visits.count", { n: vs.length }) : undefined}
        lead={{ kind: "initials", text: m.initials, dashed: m.kind === "sub" }}
        status={status}
        tags={[...m.roles.map((r) => t(`role.${r}`)), ...(m.kind === "sub" ? [t("team.sub")] : []), ...(m.id === db.me ? [t("team.you")] : [])]}
        facts={{
          phone: m.phone,
          email: m.email,
          now: now ? [now.customer?.name, now.property ? `${now.property.address}, ${now.property.city}` : undefined].filter(Boolean).join(" · ") : undefined,
        }}
        // a person on the team: call / SMS only (spec 06 §5)
        contact={m.id === db.me ? undefined : { phone: m.phone }}
        edge={null}
        onPress={store.role === "director" && m.kind === "employee" ? () => setEditing(m) : undefined}
      />
    );
  };
  return (
    <Screen
      title={t("team.title")}
      back={back}
      help={t("team.help")}
      hintKey="team"
      right={store.role === "director" ? <Button label={t("team.invite")} icon="plus" size="sm" onPress={() => setOpen(true)} /> : undefined}
    >
      {device === "phone" ? <CardList>{db.members.map(card)}</CardList> : <CardGrid>{db.members.map(card)}</CardGrid>}
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
      <MemberSheet member={editing} onClose={() => setEditing(null)} />
    </Screen>
  );
}

/**
 * «Сотрудник» (E2b-2, docs/specs/07): title and HIS number under the employee's signature on contracts;
 * the right to sign contracts for the company — only the owner gives or takes it (the server checks the same).
 */
function MemberSheet({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [his, setHis] = useState("");
  const [canSign, setCanSign] = useState(true);
  const [loaded, setLoaded] = useState<string | null>(null);
  if (member && loaded !== member.id) {
    setLoaded(member.id);
    setTitle(member.title ?? "");
    setHis(member.hisNumber ?? "");
    setCanSign(member.canSignContracts !== false);
  }
  const owner = canGrantSign(store.db, store.db.me);
  const dirty = !!member && (title !== (member.title ?? "") || his !== (member.hisNumber ?? "") || canSign !== (member.canSignContracts !== false));
  const save = () => {
    if (!member) return;
    toast.show(t("team.member.saved"), store.updateMember(member.id, { title, hisNumber: his, canSignContracts: owner ? canSign : undefined }));
    setLoaded(null);
    onClose();
  };
  const close = () => {
    setLoaded(null);
    onClose();
  };
  return (
    <Sheet visible={!!member} onClose={close} title={member ? `${t("team.member.title")}: ${member.name}` : t("team.member.title")} dirty={dirty} onSave={save}>
      <View style={{ gap: space[3] }}>
        <TextField type="jobTitle" value={title} onChangeText={setTitle} placeholder={t("team.member.jobTitle")} />
        <TextField type="text" value={his} onChangeText={setHis} placeholder={t("team.member.his")} />
        {owner ? (
          <RowView style={{ minHeight: size.hitMin }}>
            <T v="body" style={{ flex: 1 }}>
              {t("team.member.canSign")}
            </T>
            <Toggle label={t("team.member.canSign")} on={canSign} onChange={setCanSign} />
          </RowView>
        ) : null}
        {!owner ? (
          <T v="caption" tone="mut">
            {t("team.member.ownerOnly")}
          </T>
        ) : null}
        <Button label={t("team.member.save")} icon="check" full disabled={!dirty} onPress={save} />
      </View>
    </Sheet>
  );
}
