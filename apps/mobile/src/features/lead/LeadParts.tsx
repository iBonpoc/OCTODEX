/**
 * Parts of the lead card (app/lead/[id].tsx): overview sections with edit sheets, close / reopen, tasks, history.
 * Every edit is a store mutation with "Undo" (rule 5) and works offline (rule 6).
 */
import { useOpening } from "@/ui/heldSheet";
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
  timelineText,
} from "@/features/leads";
import { SourceSheet, sourceKindLabel } from "./SourcePicker";
import { InterestPicker, MissingBlock } from "./LeadSheets";
import { Avatar, Button, ChoiceChips, IconButton, Segmented, StatusChip, TextField } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Divider, Empty, ListRow, RowView, SectionTitle } from "@/ui/surfaces";
import { GroupRow, ListGroup } from "@/ui/groupedList";
import { CardGrid, ListCard } from "@/ui/listCard";
import { mailtoHref, smsHref } from "@/features/contactLinks";
import { dayAtHour } from "./bookRules";
import { TaskSheet } from "@/features/tasks/TaskSheet";
import { memberLabel, memberName } from "@/features/team";
import { useDialThenAsk } from "@/features/comms/dial";
import { type GuardedUndo } from "@/data/undo";

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
const tel = (p?: string) => (p ?? "").replace(/[^\d+]/g, "");

/** Saved toast with Undo; offline it says "queued". */
function useSaved() {
  const store = useStore();
  const toast = useToast();
  const { t } = useI18n();
  return (undo: GuardedUndo, msg?: string) => toast.show(store.online ? msg ?? t("co.saved") : t("offline.queued"), undo);
}

/* ======================= contact actions (call / SMS / email / route / marketplace) ======================= */
/** Call / SMS / email / route / marketplace. A call does not count as a reply by itself: onCall asks "did you get through?" (Р13). */
export function ContactActions({ l, onCall }: { l: Lead; onCall: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const dial = useDialThenAsk();
  const src = sourceOf(store.db, l.sourceId);
  const addr = [l.address, l.city, l.state, l.zip].filter(Boolean).join(", ");
  const touch = (kind: "sms" | "email" | "marketplace", url?: string) => {
    if (url) Linking.openURL(url).catch(() => {});
    store.touchLead(l.id, kind);
  };
  return (
    <RowView style={{ flexWrap: "wrap" }}>
      <IconButton
        icon="phone"
        label={t("visit.call")}
        // a call always asks «Чем кончился?» — after the call, not under the system dialer (20 §3)
        onPress={() => dial(tel(l.phone), onCall)}
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

/**
 * The lead's overview (prototype v2, object-cards «Лид» → Обзор): what is missing for an estimate, «Что нужно» with the client's
 * own words, «Контакт» (people, phones, the address), «Кто ведёт» (who works it, the source and the lead's price — not to a tech),
 * the owner's gut feeling. Grouped rows (GroupedList); «Изменить ›» of a group opens its sheet; every edit has «Отменить».
 */
export function LeadOverview({ l }: { l: Lead }) {
  const store = useStore();
  const { db, role } = store;
  const { t, money, day, time } = useI18n();
  const [edit, setEdit] = useState<EditKind>(null);
  // a form starts fresh at each opening — a counter that grows at the opening, not a key that flips at the close (#1163)
  const openContact = useOpening(edit === "contact");
  const openAddress = useOpening(edit === "address");
  const openRequest = useOpening(edit === "request");
  const openCost = useOpening(edit === "cost");
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
  // the source, the price and «Ведёт» are the office's: the server refuses them to a tech (#2075, t12_lead_member_guard)
  const staff = canSeeLeadCost(role);
  const edit_ = (k: EditKind, label = t("common.edit")) => ({ label, onPress: () => setEdit(k), testID: `lead-edit-${k}` });
  const what = item?.name ?? l.service;
  const when = l.timeframe ? (l.timeframe === "date" && l.timeframeDate ? day(l.timeframeDate) : t(`lead.tf.${l.timeframe}` as DictKey)) : undefined;
  const phonesOf = (p?: Person) => (p ? [...p.phones.map((x) => x.number), ...p.emails.map((x) => x.address)].join(" · ") : "");
  const ways = [l.preferredContact ? t("lead.prefers", { way: t(`lead.way.${l.preferredContact}` as DictKey) }) : "", lang ? t("lead.lang", { lang: lang.toUpperCase() }) : ""].filter(Boolean).join(" · ");
  const ini = (n: string) => n.split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase() || "#";

  return (
    <View style={{ gap: space[6] }}>
      <MissingBlock l={l} onAdd={(k) => (k === "contact" && canEditPeople ? setPeopleOpen(true) : setEdit(k))} />
      <View style={{ gap: space[2] }}>
        <ListGroup title={t("lead.sec.request")} all={edit_("request")} testID="lead-request">
          <GroupRow
            lead={{ icon: "wrench" }}
            title={what || t("lead.noRequest")}
            subtitle={[item && l.service ? l.service : undefined, when, l.budgetCents ? t("proto.leads.upTo", { amount: money(l.budgetCents) }) : undefined].filter(Boolean).join(" · ") || undefined}
            onPress={() => setEdit("request")}
            testID="lead-request-row"
          />
        </ListGroup>
        {l.message ? (
          // the client's own words — whole, not cut to a row (object-cards: «Что нужно» с цитатой)
          <View testID="lead-quote">
            <Card inner>
              <T v="body">“{l.message}”</T>
              <T v="caption" tone="mut">
                {[t("proto.leads.wroteIn", { source: src?.name ?? "—" }), `${day(l.receivedAt)} ${time(l.receivedAt)}`].join(" · ")}
              </T>
            </Card>
          </View>
        ) : null}
      </View>

      <ListGroup title={t("lead.sec.contact")} all={canEditPeople ? { label: t("lead.addPerson"), onPress: () => setPeopleOpen(true), testID: "lead-add-person" } : undefined} testID="lead-contact">
        <GroupRow
          // the name is the header's: the row starts with how to reach him (#2350 «ничего не повторять», audit 2.4)
          lead={{ icon: "phone" }}
          title={phonesOf(main) || l.name}
          subtitle={[ways, l.customerId ? t("lead.peopleOfClient") : ""].filter(Boolean).join(" · ") || undefined}
          onPress={() => (canEditPeople ? setPeopleOpen(true) : setEdit("contact"))}
          testID="lead-person-main"
        />
        {others.map((p) => (
          <GroupRow
            key={p.id}
            lead={{ initials: ini(p.name || "—") }}
            title={p.name || "—"}
            subtitle={[t(`person.role.${p.role}` as DictKey), phonesOf(p)].filter(Boolean).join(" · ")}
            onPress={canEditPeople ? () => setPeopleOpen(true) : undefined}
            testID={`lead-person-${p.id}`}
          />
        ))}
        <GroupRow
          lead={{ icon: "pin" }}
          title={l.address || l.city || t("lead.noAddress")}
          subtitle={[l.address ? l.city : undefined, [l.state, l.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || undefined}
          onPress={() => setEdit("address")}
          testID="lead-address-row"
        />
      </ListGroup>

      <ListGroup title={t("lead.assignee")} testID="lead-work">
        <GroupRow
          lead={assignee ? { initials: assignee.initials } : { icon: "user" }}
          title={assignee ? t("lead.worksOn", { name: memberLabel(assignee, t) ?? "" }) : t("lead.unassigned")}
          onPress={staff ? () => setEdit("assignee") : undefined}
          testID="lead-assignee-row"
        />
        <GroupRow
          lead={{ icon: "star" }}
          title={src?.name ?? "—"}
          subtitle={src ? t(sourceKindLabel(src.kind)) : undefined}
          onPress={staff ? () => setEdit("source") : undefined}
          testID="lead-source-row"
        />
        {staff ? <GroupRow lead={{ icon: "wallet" }} title={t("lead.cost")} subtitle={t("lead.costHint")} value={money(l.costCents ?? 0)} onPress={() => setEdit("cost")} testID="lead-cost-row" /> : null}
      </ListGroup>

      <InterestPicker l={l} />

      <ContactSheet key={`ContactSheet-${openContact}`} l={l} visible={edit === "contact"} onClose={() => setEdit(null)} />
      <AddressSheet key={`AddressSheet-${openAddress}`} l={l} visible={edit === "address"} onClose={() => setEdit(null)} />
      <RequestSheet key={`RequestSheet-${openRequest}`} l={l} visible={edit === "request"} onClose={() => setEdit(null)} />
      <CostSheet key={`CostSheet-${openCost}`} l={l} visible={edit === "cost"} onClose={() => setEdit(null)} />
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
      // recipe E (06 §3), as the client's tasks (B1): the tick on the left closes / reopens the task (undo in the toast), the card opens the form
      <ListCard
        key={x.id}
        density="compact"
        testID={`${subjectType}-task-${x.id}`}
        lead={{
          kind: "check",
          on: !!x.doneAt,
          label: x.doneAt ? t("task.undo") : t("task.done"),
          onToggle: () => saved(store.saveTask({ ...x, doneAt: x.doneAt ? undefined : new Date().toISOString() }).undo, x.doneAt ? t("task.reopened") : t("task.doneToast")),
        }}
        title={x.title}
        when={[x.dueAt ? `${day(x.dueAt)} ${time(x.dueAt)}` : t("task.noDate"), memberLabel(who, t)].filter(Boolean).join(" · ")}
        signs={overdue ? [{ tone: "bad", label: t("task.overdue") }] : undefined}
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
      {open.length ? <CardGrid>{open.map(card)}</CardGrid> : <T v="caption" tone="mut">{t("task.none")}</T>}
      {done.length ? (
        <>
          <T v="micro" tone="mut" w="semibold">{t("task.doneList")}</T>
          <CardGrid>{done.slice(0, 5).map(card)}</CardGrid>
        </>
      ) : null}
      <TaskSheet value={edit} onClose={() => setEdit(null)} />
    </View>
  );
}
/** today of the company + n days at h:00 of its clock (П4b) */
const at = (n: number, h: number) => dayAtHour(n, h);
/* ======================= history ======================= */
export function LeadHistory({ l }: { l: Lead }) {
  const { db } = useStore();
  const { t, day, time } = useI18n();
  const items = leadTimeline(db, l, db.me, t("acct.deletedName"));
  const text = (e: TimelineEntry) => timelineText(e, t);
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
                {[`${day(e.at)} ${time(e.at)}`, memberName(db, e.actorId, t)].filter(Boolean).join(" · ")}
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
