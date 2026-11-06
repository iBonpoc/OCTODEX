import { lateAfterOf } from "@/features/scheduleSettings";
import { useState } from "react";
import { Platform, View } from "react-native";
import { router } from "expo-router";
import { size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Member, Role } from "@/data/types";
import { useI18n } from "@/i18n";
import { Button, ChoiceChips, TextField, Toggle } from "@/ui/controls";
import { canGrantSign } from "@/features/estimateSign";
import { todayVisits, visitStatus } from "@/features/visits";
import { crewNow } from "@/features/crewList";
import { visitContext } from "@/data/selectors";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { CardList, RowView, Screen } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";
import { useDevice } from "@/theme/ThemeProvider";
import { useAuth } from "@/cloud/auth";
import { inviteMember, resendInvitation, revokeInvitation, setMemberStatus } from "@/cloud/team";
import { WEB_APP_URL } from "@/config/backend";
import { copyText, shareText } from "@/features/sendEstimate";
import { canDisable, dbRoleFor, INVITE_ROLES, inviteLink, teamErrorKey, teamList, teamState, validInviteEmail } from "@/features/team";

/** «Пригласить» → the link (cloud) to send by «Поделиться» or copy; email comes with the mail service (П1b) */
type LinkFor = { name: string; link: string } | null;

/** Team: who works in the company (roles), subcontractors, invite a person (wave 7-2, S21). */
export default function Team() {
  const store = useStore();
  const { db } = store;
  const { t } = useI18n();
  const toast = useToast();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("tech");
  const [kind, setKind] = useState<"employee" | "sub">("employee");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<LinkFor>(null);
  const [inviteOf, setInviteOf] = useState<Member | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  const [editing, setEditing] = useState<Member | null>(null);
  const { device } = useDevice();
  const cloud = store.mode === "cloud";
  const companyId = auth.company?.companyId;
  const ok = name.trim().length > 1 && validInviteEmail(email) && !busy;
  const origin = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : WEB_APP_URL;
  const reset = () => {
    setOpen(false);
    setName("");
    setEmail("");
    setPhone("");
    setRole("tech");
    setKind("employee");
  };
  const invite = async () => {
    const who = name.trim();
    if (!cloud) {
      const undo = store.inviteMember({ name: who, email: email.trim(), phone: phone.trim() || undefined, roles: [kind === "sub" ? "tech" : role], kind });
      toast.show(t("team.invited", { name: who }), undo);
      reset();
      return;
    }
    // the link is made by the server: it needs the network (13 §3.13)
    if (!store.online || !companyId) return toast.show(t("team.needOnline"));
    setBusy(true);
    try {
      const r = await inviteMember(companyId, email.trim(), dbRoleFor(role, kind), who);
      reset();
      setLink({ name: who, link: inviteLink(origin, r.token) });
      store.refresh();
    } catch (e) {
      toast.show(t(teamErrorKey((e as Error).message)));
    } finally {
      setBusy(false);
    }
  };
  /**
   * One list card per person (spec 06 §5 «Команда», PR9b): name, roles and «Субподрядчик» / «Вы» as grey tags,
   * «today» for a tech (visits count, the visit's own status — read only, as in «Бригады сейчас»), phone and email,
   * call / SMS. «Приглашён» / «Отключён» are neutral (not a problem to fix); an expired link is a warning.
   */
  const card = (m: Member) => {
    const state = teamState(m);
    const tech = m.roles.includes("tech") && state === "active";
    const vs = tech ? todayVisits(db, m.id) : [];
    const { current, next } = crewNow(vs);
    const st = current ? visitStatus(current, Date.now(), lateAfterOf(db)) : next ? visitStatus(next, Date.now(), lateAfterOf(db)) : null;
    const now = current ? visitContext(db, current) : null;
    const status =
      state === "pending" ? { tone: "neutral" as const, label: t("team.pending") }
      : state === "expired" ? { tone: "warn" as const, label: t("team.expired") }
      : state === "disabled" ? { tone: "neutral" as const, label: t("team.disabled") }
      : st ? { tone: st.status, label: t(st.label) } : undefined;
    const director = store.role === "director";
    return (
      <ListCard
        key={m.id}
        title={m.name}
        when={tech ? t("visits.count", { n: vs.length }) : undefined}
        lead={{ kind: "initials", text: m.initials, dashed: m.kind === "sub" }}
        status={status}
        tags={[...m.roles.map((r) => t(`role.${r}`)), ...(m.kind === "sub" ? [t("team.sub")] : []), ...(m.id === db.me ? [t("team.you")] : [])]}
        facts={{
          phone: m.phone,
          email: m.email,
          now: now ? [now.customer?.name, now.property ? `${now.property.address}, ${now.property.city}` : undefined].filter(Boolean).join(" · ") : undefined,
        }}
        // a person on the team: call / SMS only (spec 06 §5)
        contact={m.id === db.me || state !== "active" ? undefined : { phone: m.phone }}
        edge={null}
        // a switched-off person (also «pending») and anyone at work, subcontractors too, open the person's sheet
        onPress={!director ? undefined : m.disabled ? () => setEditing(m) : m.pending ? () => setInviteOf(m) : () => setEditing(m)}
      />
    );
  };
  const people = teamList(db);
  return (
    <Screen
      title={t("team.title")}
      back={back}
      help={t("team.help")}
      hintKey="team"
      right={store.role === "director" ? <Button label={t("team.invite")} icon="plus" size="sm" onPress={() => setOpen(true)} /> : undefined}
    >
      {device === "phone" ? <CardList>{people.map(card)}</CardList> : <CardGrid>{people.map(card)}</CardGrid>}
      <Sheet visible={open} onClose={() => setOpen(false)} title={t("team.invite")}>
        <View style={{ gap: space[3] }}>
          <TextField type="name" value={name} onChangeText={setName} placeholder={t("co.personName")} icon="user" />
          <TextField type="email" value={email} onChangeText={setEmail} placeholder={t("co.email")} icon="message" />
          {!cloud ? <TextField type="phone" value={phone} onChangeText={setPhone} placeholder={t("co.phone")} icon="phone" /> : null}
          <ChoiceChips
            value={kind}
            onChange={setKind}
            items={[
              { key: "employee", label: t("team.employee") },
              { key: "sub", label: t("team.sub") },
            ]}
          />
          {kind === "employee" ? (
            <>
              <T v="caption" tone="mut">
                {t("team.role")}
              </T>
              <ChoiceChips<Role> value={role} onChange={setRole} items={INVITE_ROLES.map((r) => ({ key: r, label: t(`role.${r}`) }))} />
            </>
          ) : null}
          <T v="caption" tone="mut">
            {cloud ? t("team.inviteHint.link") : t("team.inviteHint")}
          </T>
          <Button label={t("team.send")} icon="send" full disabled={!ok} onPress={invite} />
        </View>
      </Sheet>
      <LinkSheet link={link} onClose={() => setLink(null)} />
      <InviteSheet member={inviteOf} onClose={() => setInviteOf(null)} onLink={setLink} origin={origin} />
      <MemberSheet member={editing} onClose={() => setEditing(null)} />
    </Screen>
  );
}

/** the invitation link: «Поделиться» (SMS, WhatsApp, mail — the phone's own sheet) or copy */
function LinkSheet({ link, onClose }: { link: LinkFor; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const text = link ? t("team.linkMessage", { name: link.name, link: link.link }) : "";
  return (
    <Sheet visible={!!link} onClose={onClose} title={t("team.linkTitle")}>
      <View testID="invite-link" style={{ gap: space[3] }}>
        <T v="body">{link ? t("team.linkHint", { name: link.name }) : ""}</T>
        <T v="caption" tone="mut">
          {link?.link ?? ""}
        </T>
        <Button label={t("team.share")} icon="send" full onPress={() => link && shareText(text, link.link)} />
        <Button
          label={t("team.copy")}
          icon="copy"
          variant="secondary"
          full
          onPress={async () => {
            if (!link) return;
            await copyText(link.link);
            toast.show(t("team.copied"));
          }}
        />
        <T v="caption" tone="mut">
          {t("team.linkExpires")}
        </T>
      </View>
    </Sheet>
  );
}

/** a pending invitation: «Отправить ещё раз» (a new link, the old one stops) and «Отменить приглашение» (asks first) */
function InviteSheet({ member, onClose, onLink, origin }: { member: Member | null; onClose: () => void; onLink: (l: LinkFor) => void; origin: string }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const cloud = store.mode === "cloud";
  const close = () => {
    setSure(false);
    onClose();
  };
  const run = async (f: () => Promise<void>) => {
    if (cloud && !store.online) return toast.show(t("team.needOnline"));
    setBusy(true);
    try {
      await f();
    } catch (e) {
      toast.show(t(teamErrorKey((e as Error).message)));
    } finally {
      setBusy(false);
    }
  };
  const resend = () =>
    run(async () => {
      if (!member) return;
      if (!cloud || !member.invitationId) {
        toast.show(t("team.resent", { name: member.name }));
        return close();
      }
      const r = await resendInvitation(member.invitationId);
      close();
      onLink({ name: member.name, link: inviteLink(origin, r.token) });
      store.refresh();
    });
  const revoke = () =>
    run(async () => {
      if (!member) return;
      if (!cloud || !member.invitationId) store.revokeInvite(member.id);
      else {
        await revokeInvitation(member.invitationId);
        store.refresh();
      }
      toast.show(t("team.revoked", { name: member.name }));
      close();
    });
  return (
    <Sheet visible={!!member} onClose={close} title={member ? `${t("team.pending")}: ${member.name}` : t("team.pending")}>
      <View testID="invite-sheet" style={{ gap: space[3] }}>
        {member?.email ? <T v="body">{member.email}</T> : null}
        {member ? (
          <T v="caption" tone={teamState(member) === "expired" ? "warn" : "mut"}>
            {teamState(member) === "expired" ? `⚠ ${t("team.expired")}` : t("team.linkExpires")}
          </T>
        ) : null}
        <Button label={t("team.resend")} icon="refresh" full disabled={busy} onPress={resend} />
        {!sure ? (
          <Button label={t("team.revoke")} icon="close" variant="ghost" full disabled={busy} onPress={() => setSure(true)} />
        ) : (
          <>
            <T v="body">{t("team.revokeSure")}</T>
            <Button label={t("team.revokeYes")} icon="close" variant="secondary" full disabled={busy} onPress={revoke} />
          </>
        )}
      </View>
    </Sheet>
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
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const auth = useAuth();
  if (member && loaded !== member.id) {
    setSure(false);
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
  const switchable = !!member && (member.disabled || canDisable(store.db, store.db.me, member));
  /** «Отключить» / «Включить снова» (S21): the person's records stay with the company; only the access changes */
  const setDisabled = async (disabled: boolean) => {
    if (!member) return;
    if (store.mode !== "cloud") {
      toast.show(t(disabled ? "team.disabledToast" : "team.enabledToast", { name: member.name }), store.setMemberDisabled(member.id, disabled));
      return close();
    }
    const companyId = auth.company?.companyId;
    if (!store.online || !companyId) return toast.show(t("team.needOnline"));
    setBusy(true);
    try {
      await setMemberStatus(companyId, member.id, disabled ? "disabled" : "active");
      toast.show(t(disabled ? "team.disabledToast" : "team.enabledToast", { name: member.name }));
      store.refresh();
      close();
    } catch (e) {
      toast.show(t(teamErrorKey((e as Error).message)));
    } finally {
      setBusy(false);
    }
  };
  if (member?.disabled)
    return (
      <Sheet visible onClose={close} title={`${t("team.disabled")}: ${member.name}`}>
        <View testID="member-sheet" style={{ gap: space[3] }}>
          <T v="body">{t("team.disabledHint")}</T>
          <Button label={t("team.enable")} icon="check" full disabled={busy} onPress={() => setDisabled(false)} />
        </View>
      </Sheet>
    );
  return (
    <Sheet visible={!!member} onClose={close} title={member ? `${t("team.member.title")}: ${member.name}` : t("team.member.title")} dirty={dirty} onSave={save}>
      <View testID="member-sheet" style={{ gap: space[3] }}>
        {member?.kind !== "sub" ? (
          <>
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
          </>
        ) : (
          // a subcontractor never signs for the company: nothing to edit here, only the access
          <T v="body">{t("team.sub")}</T>
        )}
        {switchable && member?.id !== store.db.me ? (
          !sure ? (
            <Button label={t("team.disable")} icon="close" variant="ghost" full disabled={busy} onPress={() => setSure(true)} />
          ) : (
            <View testID="disable-confirm" style={{ gap: space[2] }}>
              <T v="body">{t("team.disableSure", { name: member?.name ?? "" })}</T>
              <Button label={t("team.disableYes")} icon="close" variant="secondary" full disabled={busy} onPress={() => setDisabled(true)} />
            </View>
          )
        ) : null}
      </View>
    </Sheet>
  );
}
