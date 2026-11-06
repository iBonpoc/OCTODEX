/**
 * Parts of the lead card (app/lead/[id].tsx): overview sections with edit sheets, close / reopen, tasks, history.
 * Every edit is a store mutation with "Undo" (rule 5) and works offline (rule 6).
 */
import { useState } from "react";
import { Linking, View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { ContactWay, Lead, LostReason, Person, Task, Timeframe } from "@/data/types";
import { peopleForLead } from "@/data/people";
import { PeopleEditSheet } from "@/features/client/ClientSheets";
import { useI18n, type DictKey } from "@/i18n";
import { Labeled, MoneyField } from "@/features/fields";
import { CatalogPicker } from "@/features/estimatePickers";
import {
  canSeeLeadCost, isOverdueTask, leadTimeline, openTasks, reasonsFor, sourceName, sourceOf, type TimelineEntry,
} from "@/features/leads";
import { SourceSheet, sourceKindLabel } from "./SourcePicker";
import { InterestPicker, MissingBlock } from "./LeadSheets";
import { Avatar, Button, ChoiceChips, IconButton, Segmented, StatusChip, TextField } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, CardList, Divider, Empty, ItemCard, ListRow, RowView, SectionTitle } from "@/ui/surfaces";
import { mailtoHref, smsHref } from "@/features/contactLinks";
import { dayAtHour } from "./bookRules";

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
const tel = (p?: string) => (p ?? "").replace(/[^\d+]/g, "");

/** Saved toast with Undo; offline it says "queued". */
function useSaved() {
  const store = useStore();
  const toast = useToast();
  const { t } = useI18n();
  return (undo: () => void, msg?: string) => toast.show(store.online ? msg ?? t("co.saved") : t("offline.queued"), undo);
}

/* ======================= contact actions (call / SMS / email / route / marketplace) ======================= */
/** Call / SMS / email / route / marketplace. A call does not count as a reply by itself: onCall asks "did you get through?" (Р13). */
export function ContactActions({ l, onCall }: { l: Lead; onCall?: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const src = sourceOf(store.db, l.sourceId);
  const addr = [l.address, l.city, l.state, l.zip].filter(Boolean).join(", ");
  const touch = (kind: "call" | "sms" | "email" | "marketplace", url?: string) => {
    if (url) Linking.openURL(url).catch(() => {});
    store.touchLead(l.id, kind);
  };
  return (
    <RowView style={{ flexWrap: "wrap" }}>
      <IconButton
        icon="phone"
        label={t("visit.call")}
        onPress={() => {
          Linking.openURL(`tel:${tel(l.phone)}`).catch(() => {});
          if (onCall) onCall();
          else store.touchLead(l.id, "call");
        }}
      />
      <IconButton icon="sms" label={t("visit.message")} onPress={() => touch("sms", smsHref(l.phone) ?? undefined)} />
      {mailtoHref(l.email) ? <IconButton icon="mail" label={t("lead.emailTo")} onPress={() => touch("email", mailtoHref(l.email) ?? undefined)} /> : null}
      {addr ? <IconButton icon="navigate" label={t("visit.navigate")} onPress={() => Linking.openURL(`https://maps.apple.com/?daddr=${encodeURIComponent(addr)}`).catch(() => {})} /> : null}
      {src?.kind === "marketplace" ? (
        <Button label={t("lead.answeredIn", { source: src.name })} icon="send" size="sm" variant="secondary" onPress={() => touch("marketplace")} />
      ) : null}
    </RowView>
  );
}

/* ======================= overview ======================= */
type EditKind = "contact" | "address" | "request" | "cost" | "source" | "assignee" | null;

export function LeadOverview({ l }: { l: Lead }) {
  const store = useStore();
  const { db, role } = store;
  const { t, money, day } = useI18n();
  const [edit, setEdit] = useState<EditKind>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  // the lead's people, or the client's once the lead has one (S3); a tech who cannot open the client does not edit them
  const people = peopleForLead(db, l);
  const main = people[0];
  const others = people.slice(1);
  // the client's language for estimates and messages: the main person's (people sheet), else the lead's from before
  const lang = main?.language ?? l.language;
  const client = l.customerId ? db.customers.find((c) => c.id === l.customerId) : undefined;
  const canEditPeople = !l.customerId || (!!client && canSeeLeadCost(role));
  const src = sourceOf(db, l.sourceId);
  const assignee = db.members.find((m) => m.id === l.assigneeId);
  const item = db.catalog.find((x) => x.id === l.serviceItemId);
  const staff = canSeeLeadCost(role);
  const row = (icon: Parameters<typeof Icon>[0]["name"], text?: string, sub?: string) =>
    text ? (
      <RowView gap={space[2]} style={{ alignItems: "flex-start" }}>
        <Icon name={icon} />
        <View style={{ flex: 1 }}>
          <T v="body">{text}</T>
          {sub ? (
            <T v="caption" tone="mut">
              {sub}
            </T>
          ) : null}
        </View>
      </RowView>
    ) : null;
  const head = (title: string, k: EditKind) => (
    <RowView style={{ justifyContent: "space-between" }}>
      <T v="heading">{title}</T>
      <IconButton icon="pencil" label={`${t("common.edit")}: ${title}`} onPress={() => setEdit(k)} />
    </RowView>
  );

  /** every phone (type, "primary" when several) and email of a person */
  const phoneRows = (p?: Person) =>
    p ? (
      <>
        {p.phones.map((x, i) => (
          <View key={`p${i}`}>{row("phone", x.number, [t(`phone.${x.label}` as DictKey), p.phones.length > 1 && x.primary ? t("person.primary") : ""].filter(Boolean).join(" · "))}</View>
        ))}
        {p.emails.map((x, i) => (
          <View key={`e${i}`}>{row("mail", x.address, p.emails.length > 1 && x.primary ? t("person.primary") : undefined)}</View>
        ))}
      </>
    ) : null;

  return (
    <View style={{ gap: space[3] }}>
      <MissingBlock l={l} onAdd={(k) => (k === "contact" && canEditPeople ? setPeopleOpen(true) : setEdit(k))} />
      <Card>
        {head(t("lead.sec.contact"), "contact")}
        {row("user", l.name, l.customerId ? t("lead.peopleOfClient") : undefined)}
        {phoneRows(main)}
        {l.preferredContact || lang ? (
          <RowView style={{ flexWrap: "wrap" }}>
            {l.preferredContact ? <StatusChip status="neutral" label={t("lead.prefers", { way: t(`lead.way.${l.preferredContact}` as DictKey) })} soft /> : null}
            {lang ? <StatusChip status="neutral" label={t("lead.lang", { lang: lang.toUpperCase() })} soft /> : null}
          </RowView>
        ) : null}
        {canEditPeople ? <Button label={t("lead.editPhones")} icon="pencil" size="sm" variant="secondary" onPress={() => setPeopleOpen(true)} /> : null}
      </Card>

      <View style={{ gap: space[2] }}>
        <SectionTitle
          title={t("lead.sec.people")}
          right={canEditPeople ? <Button label={t("lead.addPerson")} icon="plus" size="sm" variant="ghost" onPress={() => setPeopleOpen(true)} /> : undefined}
        />
        {others.length ? (
          <CardList>
            {others.map((p) => (
              <ItemCard
                key={p.id}
                title={p.name || "—"}
                subtitle={[t(`person.role.${p.role}` as DictKey), ...p.phones.map((x) => x.number), ...p.emails.map((x) => x.address)].join(" · ")}
                left={<Icon name="user" />}
                onPress={canEditPeople ? () => setPeopleOpen(true) : undefined}
              />
            ))}
          </CardList>
        ) : (
          <T v="caption" tone="mut">
            {t("lead.noPeople")}
          </T>
        )}
      </View>

      <Card>
        {head(t("lead.sec.address"), "address")}
        {l.address || l.city ? row("pin", l.address || l.city, [l.address ? l.city : undefined, [l.state, l.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || undefined) : (
          <T v="caption" tone="mut">{t("lead.noAddress")}</T>
        )}
      </Card>

      <Card>
        {head(t("lead.sec.request"), "request")}
        {row("wrench", item?.name ?? l.service, item && l.service ? l.service : undefined)}
        {l.timeframe ? row("clock", l.timeframe === "date" && l.timeframeDate ? day(l.timeframeDate) : t(`lead.tf.${l.timeframe}` as DictKey), t("lead.when")) : null}
        {l.budgetCents ? row("wallet", money(l.budgetCents), t("lead.budget")) : null}
        {l.message ? (
          <Card inner>
            <T v="caption" tone="mut">{t("lead.clientWrote")}</T>
            <T v="body">“{l.message}”</T>
          </Card>
        ) : null}
        {!item && !l.service && !l.message ? <T v="caption" tone="mut">{t("lead.noRequest")}</T> : null}
      </Card>

      <Card>
        <InterestPicker l={l} />
      </Card>
      <Card>
        <T v="heading">{t("lead.sec.source")}</T>
        <ListRow title={src?.name ?? "—"} subtitle={src ? t(sourceKindLabel(src.kind)) : undefined} left={<Icon name="star" />} onPress={() => setEdit("source")} />
        {staff ? (
          <>
            <Divider />
            <ListRow title={t("lead.cost")} subtitle={t("lead.costHint")} right={<T v="body" w="semibold" tabular>{money(l.costCents ?? 0)}</T>} onPress={() => setEdit("cost")} />
          </>
        ) : null}
        <Divider />
        <ListRow
          title={assignee?.name ?? t("lead.unassigned")}
          subtitle={t("lead.assignee")}
          left={assignee ? <Avatar initials={assignee.initials} /> : <Icon name="user" />}
          onPress={staff ? () => setEdit("assignee") : undefined}
        />
      </Card>

      <ContactSheet key={`ContactSheet-${edit === "contact"}`} l={l} visible={edit === "contact"} onClose={() => setEdit(null)} />
      <AddressSheet key={`AddressSheet-${edit === "address"}`} l={l} visible={edit === "address"} onClose={() => setEdit(null)} />
      <RequestSheet key={`RequestSheet-${edit === "request"}`} l={l} visible={edit === "request"} onClose={() => setEdit(null)} />
      <CostSheet key={`CostSheet-${edit === "cost"}`} l={l} visible={edit === "cost"} onClose={() => setEdit(null)} />
      <AssigneeSheet l={l} visible={edit === "assignee"} onClose={() => setEdit(null)} />
      <SourceSheet
        visible={edit === "source"}
        value={l.sourceId}
        onClose={() => setEdit(null)}
        onPick={(id) => {
          setEdit(null);
          if (id !== l.sourceId) store.updateLead(l.id, { sourceId: id });
        }}
      />
      <PeopleEditSheet visible={peopleOpen} mainName={l.name} people={people} onSave={(p) => store.saveLeadPeople(l.id, p)} onClose={() => setPeopleOpen(false)} />
    </View>
  );
}

/** who the lead is and how they like to be reached; phones, emails and language are in the people sheet */
function ContactSheet({ l, visible, onClose }: { l: Lead; visible: boolean; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const saved = useSaved();
  const [d, setD] = useState({ name: l.name, preferredContact: l.preferredContact });
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const [d0] = useState(d);
  const ok = d.name.trim().length > 1;
  const save = () => {
    saved(store.updateLead(l.id, { ...d, name: d.name.trim() }));
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={t("lead.sec.contact")} dirty={JSON.stringify(d) !== JSON.stringify(d0)} onSave={ok ? save : undefined}>
      <Labeled label={t("lead.name")}>
        <TextField type="name" value={d.name} onChangeText={(v) => set({ name: v })} placeholder={t("lead.name")} icon="user" />
      </Labeled>
      <Labeled label={t("lead.prefersLabel")}>
        <ChoiceChips<ContactWay | "">
          value={d.preferredContact ?? ""}
          onChange={(v) => set({ preferredContact: v || undefined })}
          items={[{ key: "", label: t("lead.any") }, ...(["call", "sms", "email"] as const).map((k) => ({ key: k, label: t(`lead.way.${k}` as DictKey) }))]}
        />
      </Labeled>
      <Button label={t("ue.save")} icon="check" full disabled={!ok} onPress={save} />
    </Sheet>
  );
}

function AddressSheet({ l, visible, onClose }: { l: Lead; visible: boolean; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const saved = useSaved();
  const [d, setD] = useState({ address: l.address ?? "", city: l.city, state: l.state ?? "CA", zip: l.zip ?? "" });
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const [d0] = useState(d);
  const save = () => {
    saved(store.updateLead(l.id, { address: d.address.trim() || undefined, city: d.city.trim(), state: d.state || undefined, zip: d.zip || undefined }));
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={t("lead.sec.address")} dirty={JSON.stringify(d) !== JSON.stringify(d0)} onSave={save}>
      <Labeled label={t("co.street")}>
        <TextField type="street" value={d.address} onChangeText={(v) => set({ address: v })} placeholder={t("co.street")} icon="pin" />
      </Labeled>
      <Labeled label={t("co.city")}>
        <TextField type="city" value={d.city} onChangeText={(v) => set({ city: v })} placeholder="Pasadena" />
      </Labeled>
      <RowView>
        <Labeled label={t("co.state")}>
          <TextField type="state" value={d.state} onChangeText={(v) => set({ state: v })} placeholder="CA" />
        </Labeled>
        <Labeled label="ZIP">
          <TextField type="zip" value={d.zip} onChangeText={(v) => set({ zip: v })} placeholder="91103" />
        </Labeled>
      </RowView>
      <Button
        label={t("ue.save")}
        icon="check"
        full
        onPress={save}
      />
    </Sheet>
  );
}

const TIMEFRAMES: Timeframe[] = ["asap", "this_week", "this_month", "flexible", "date"];
function RequestSheet({ l, visible, onClose }: { l: Lead; visible: boolean; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const saved = useSaved();
  const [pick, setPick] = useState(false);
  const [d, setD] = useState({ serviceItemId: l.serviceItemId, service: l.service ?? "", timeframe: l.timeframe, timeframeDate: l.timeframeDate ?? "", budgetCents: l.budgetCents ?? 0, message: l.message });
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const item = store.db.catalog.find((x) => x.id === d.serviceItemId);
  const dateOk = d.timeframe !== "date" || /^\d{2}\/\d{2}\/\d{4}$/.test(d.timeframeDate);
  const [d0] = useState(d);
  const save = () => {
    saved(
      store.updateLead(l.id, {
        serviceItemId: d.serviceItemId, service: d.service.trim() || undefined, timeframe: d.timeframe,
        timeframeDate: d.timeframe === "date" ? usToIso(d.timeframeDate) : undefined, budgetCents: d.budgetCents || undefined, message: d.message.trim(),
      }),
    );
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={t("lead.sec.request")} dirty={JSON.stringify(d) !== JSON.stringify(d0)} onSave={dateOk ? save : undefined}>
      <Labeled label={t("lead.service")}>
        <ListRow
          title={item?.name ?? t("lead.fromCatalog")}
          subtitle={item ? t("lead.fromCatalogHint") : undefined}
          left={<Icon name="wrench" />}
          right={item ? <IconButton icon="close" label={t("common.clear")} onPress={() => set({ serviceItemId: undefined })} /> : undefined}
          onPress={() => setPick(true)}
        />
      </Labeled>
      <Labeled label={t("lead.serviceText")}>
        <TextField type="text" value={d.service} onChangeText={(v) => set({ service: v })} placeholder={t("lead.servicePh")} />
      </Labeled>
      <Labeled label={t("lead.when")}>
        <ChoiceChips<Timeframe | "">
          value={d.timeframe ?? ""}
          onChange={(v) => set({ timeframe: v || undefined })}
          items={[{ key: "", label: t("lead.any") }, ...TIMEFRAMES.map((k) => ({ key: k, label: t(`lead.tf.${k}` as DictKey) }))]}
        />
      </Labeled>
      {d.timeframe === "date" ? (
        <TextField type="date" value={d.timeframeDate} onChangeText={(v) => set({ timeframeDate: v })} placeholder="MM/DD/YYYY" label={t("lead.date")} icon="calendar" />
      ) : null}
      <Labeled label={t("lead.budget")}>
        <MoneyField cents={d.budgetCents} onChange={(c) => set({ budgetCents: c })} />
      </Labeled>
      <Labeled label={t("lead.clientWrote")}>
        <TextField type="note" value={d.message} onChangeText={(v) => set({ message: v })} placeholder={t("lead.messagePh")} />
      </Labeled>
      <Button
        label={t("ue.save")}
        icon="check"
        full
        disabled={!dateOk}
        onPress={save}
      />
      <CatalogPicker visible={pick} onClose={() => setPick(false)} exclude={["material"]} onPick={(it) => { set({ serviceItemId: it.id }); setPick(false); }} />
    </Sheet>
  );
}
/** MM/DD/YYYY → YYYY-MM-DD */
const usToIso = (s: string) => {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : undefined;
};

function CostSheet({ l, visible, onClose }: { l: Lead; visible: boolean; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const saved = useSaved();
  const [c, setC] = useState(l.costCents ?? 0);
  return (
    <Sheet visible={visible} onClose={onClose} title={t("lead.cost")}>
      <T v="caption" tone="mut">{t("lead.costLong")}</T>
      <MoneyField cents={c} onChange={setC} />
      <Button label={t("ue.save")} icon="check" full onPress={() => { saved(store.setLeadCost(l.id, c)); onClose(); }} />
    </Sheet>
  );
}

function AssigneeSheet({ l, visible, onClose }: { l: Lead; visible: boolean; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const saved = useSaved();
  const people = store.db.members.filter((m) => !m.pending);
  return (
    <Sheet visible={visible} onClose={onClose} title={t("lead.assignee")}>
      <View>
        {people.map((m, i) => (
          <View key={m.id}>
            {i > 0 ? <Divider /> : null}
            <ListRow
              title={m.name}
              subtitle={m.roles.map((r) => t(`role.${r}` as DictKey)).join(" · ")}
              left={<Avatar initials={m.initials} sub={m.kind === "sub"} />}
              right={m.id === l.assigneeId ? <Icon name="check" /> : undefined}
              onPress={() => {
                if (m.id !== l.assigneeId) saved(store.assignLead(l.id, m.id), t("lead.assignedTo", { name: m.name }));
                onClose();
              }}
            />
          </View>
        ))}
      </View>
    </Sheet>
  );
}

/* ======================= close (lost / declined) ======================= */
export function CloseSheet({ l, visible, onClose }: { l: Lead; visible: boolean; onClose: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const saved = useSaved();
  const [close, setClose] = useState<"lost" | "declined">("lost");
  const [reason, setReason] = useState<LostReason>("no_response");
  const [text, setText] = useState("");
  const list = reasonsFor(close);
  const r = list.includes(reason) ? reason : list[0]!;
  const ok = r !== "other" || text.trim().length > 2;
  return (
    <Sheet visible={visible} onClose={onClose} title={t("lead.closeTitle")}>
      <Segmented
        full
        value={close}
        onChange={(v) => setClose(v)}
        items={[
          { key: "lost", label: t("lead.st.lost") },
          { key: "declined", label: t("lead.st.declined") },
        ]}
      />
      <T v="caption" tone="mut">{close === "lost" ? t("lead.lostHint") : t("lead.declinedHint")}</T>
      <ChoiceChips<LostReason> value={r} onChange={setReason} items={list.map((x) => ({ key: x, label: t(`lead.reason.${x}` as DictKey) }))} />
      {r === "other" ? <TextField type="note" value={text} onChangeText={setText} placeholder={t("lead.reasonText")} /> : null}
      <Button
        label={close === "lost" ? t("lead.markLost") : t("lead.markDeclined")}
        icon="close"
        variant="danger"
        full
        disabled={!ok}
        onPress={() => {
          saved(store.closeLead(l.id, close, r, r === "other" ? text.trim() : undefined), t(close === "lost" ? "lead.lostToast" : "lead.declinedToast", { name: l.name }));
          onClose();
        }}
      />
    </Sheet>
  );
}

/* ======================= tasks ======================= */
export function TasksBlock({ subjectType, subjectId }: { subjectType: Task["subjectType"]; subjectId: string }) {
  const store = useStore();
  const { db } = store;
  const { t, day, time } = useI18n();
  const saved = useSaved();
  const [edit, setEdit] = useState<(Omit<Task, "id"> & { id?: string }) | null>(null);
  const open = openTasks(db, subjectId);
  const done = db.tasks.filter((x) => x.subjectId === subjectId && x.doneAt).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  const card = (x: Task) => {
    const who = db.members.find((m) => m.id === x.assigneeId);
    const overdue = isOverdueTask(x);
    return (
      <ItemCard
        key={x.id}
        status={x.doneAt ? "ok" : overdue ? "bad" : undefined}
        title={x.title}
        subtitle={[x.dueAt ? `${day(x.dueAt)} ${time(x.dueAt)}` : t("task.noDate"), who?.name].filter(Boolean).join(" · ")}
        left={
          <IconButton
            icon={x.doneAt ? "check" : "clock"}
            label={x.doneAt ? t("task.undo") : t("task.done")}
            active={!!x.doneAt}
            onPress={() => saved(store.saveTask({ ...x, doneAt: x.doneAt ? undefined : new Date().toISOString() }).undo, x.doneAt ? t("task.reopened") : t("task.doneToast"))}
          />
        }
        right={overdue ? <StatusChip status="bad" label={t("task.overdue")} /> : undefined}
        onPress={() => setEdit(x)}
      />
    );
  };
  return (
    <View style={{ gap: space[2] }}>
      <SectionTitle
        title={t("task.title")}
        right={<Button label={t("task.new")} icon="plus" size="sm" variant="ghost" onPress={() => setEdit({ subjectType, subjectId, title: "", assigneeId: db.me, dueAt: at(1, 9) })} />}
      />
      {open.length ? <CardList>{open.map(card)}</CardList> : <T v="caption" tone="mut">{t("task.none")}</T>}
      {done.length ? (
        <>
          <T v="micro" tone="mut" w="semibold">{t("task.doneList")}</T>
          <CardList>{done.slice(0, 5).map(card)}</CardList>
        </>
      ) : null}
      <TaskSheet key={edit ? edit.id ?? `new-${edit.dueAt}` : "none"} value={edit} onClose={() => setEdit(null)} />
    </View>
  );
}
/** today of the company + n days at h:00 of its clock (П4b) */
const at = (n: number, h: number) => dayAtHour(n, h);
const WHEN = [
  { key: "today", n: 0, h: 17 },
  { key: "tomorrow", n: 1, h: 9 },
  { key: "in3", n: 3, h: 9 },
  { key: "week", n: 7, h: 9 },
] as const;
function TaskSheet({ value, onClose }: { value: (Omit<Task, "id"> & { id?: string }) | null; onClose: () => void }) {
  const store = useStore();
  const { t, day, time } = useI18n();
  const saved = useSaved();
  const [d, setD] = useState(value);
  const [d0] = useState(value);
  if (!value || !d) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const set = (p: Partial<Task>) => setD((x) => (x ? { ...x, ...p } : x));
  const people = store.db.members.filter((m) => !m.pending);
  return (
    <Sheet
      visible
      onClose={onClose}
      title={d.id ? t("task.edit") : t("task.new")}
      dirty={JSON.stringify(d) !== JSON.stringify(d0)}
      onSave={d.title.trim().length >= 2 ? () => { saved(store.saveTask({ ...d, title: d.title.trim() }).undo, t("task.saved")); onClose(); } : undefined}
    >
      <Labeled label={t("task.what")}>
        <TextField type="title" value={d.title} onChangeText={(v) => set({ title: v })} placeholder={t("task.whatPh")} />
      </Labeled>
      <Labeled label={t("task.when")}>
        <ChoiceChips<string>
          value={WHEN.find((w) => d.dueAt === at(w.n, w.h))?.key ?? ""}
          onChange={(k) => { const w = WHEN.find((x) => x.key === k); if (w) set({ dueAt: at(w.n, w.h) }); }}
          items={WHEN.map((w) => ({ key: w.key, label: t(`task.when.${w.key}` as DictKey) }))}
        />
      </Labeled>
      {d.dueAt ? <T v="caption" tone="mut">{`${day(d.dueAt)} ${time(d.dueAt)}`}</T> : null}
      <Labeled label={t("task.who")}>
        <ChoiceChips<string> value={d.assigneeId ?? ""} onChange={(v) => set({ assigneeId: v })} items={people.map((m) => ({ key: m.id, label: m.name }))} />
      </Labeled>
      <Button
        label={t("ue.save")}
        icon="check"
        full
        disabled={d.title.trim().length < 2}
        onPress={() => { saved(store.saveTask({ ...d, title: d.title.trim() }).undo, t("task.saved")); onClose(); }}
      />
    </Sheet>
  );
}

/* ======================= history ======================= */
export function LeadHistory({ l }: { l: Lead }) {
  const { db } = useStore();
  const { t, day, time } = useI18n();
  const items = leadTimeline(db, l, db.me);
  const text = (e: TimelineEntry) => {
    const p: Record<string, string> = { ...(e.params ?? {}) };
    if (p.status) p.status = t(p.status as DictKey);
    if (p.reason) p.reason = p.reason ? `: ${t(p.reason as DictKey)}` : "";
    return t(e.key, p);
  };
  if (!items.length) return <Empty icon="clock" title={t("tl.empty")} />;
  return (
    <Card>
      {items.map((e, i) => (
        <View key={e.id} style={{ gap: space[1] }}>
          {i > 0 ? <Divider /> : null}
          <RowView gap={space[2]} style={{ alignItems: "flex-start" }}>
            <Icon name={e.icon} />
            <View style={{ flex: 1, gap: space[1] }}>
              <T v="body" w="medium">{text(e)}</T>
              {e.body ? <T v="body" tone="mut">{e.body}</T> : null}
              <T v="micro" tone="mut">
                {[`${day(e.at)} ${time(e.at)}`, db.members.find((m) => m.id === e.actorId)?.name].filter(Boolean).join(" · ")}
              </T>
            </View>
          </RowView>
        </View>
      ))}
    </Card>
  );
}

export { smsWithBody } from "@/features/sms";
export { sourceName };
export const goLead = (id: string) => router.push(`/lead/${id}`);
