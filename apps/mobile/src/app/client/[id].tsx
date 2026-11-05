import { useRef, useState } from "react";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { component, space, type StatusName } from "@octo/design-tokens";
import { NotesBlock } from "@/features/NotesBlock";
import { invoiceChip } from "@/features/ContractStatement";
import { useStore } from "@/data/store";
import { peopleOf } from "@/data/people";
import { usePersistentState } from "@/data/persist";
import { sourceName } from "@/features/leads";
import {
  canSeeClientMoney,
  clientHistory,
  clientMoneyOf,
  clientStatusChip,
  noLateCallsNow,
  statusOf,
  tagLabel,
  tagsOf,
  visibleClients,
  type HistoryKind,
} from "@/features/clients";
import { PeopleSheet, StatusSheet, TagsSheet } from "@/features/client/ClientSheets";
import { newProperty, PropertySheet } from "@/features/client/PropertySheets";
import { propertyTitle } from "@/features/properties";
import type { CustomerStatus, EstimateStatus, JobStatus, Person, Property } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { Button, ChoiceChips, IconButton, Segmented, StatusChip, TagChip, TextField } from "@/ui/controls";
import { Icon, Press, T } from "@/ui/primitives";
import { Menu, useToast } from "@/ui/overlays";
import { Card, CardList, Empty, ItemCard, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";

type Tab = "overview" | "properties" | "history" | "documents" | "tasks" | "files";
const TABS: Tab[] = ["overview", "properties", "history", "documents", "tasks", "files"];

const jobSt: Record<JobStatus, { s: StatusName; l: DictKey }> = {
  unscheduled: { s: "warn", l: "st.toSchedule" },
  scheduled: { s: "neutral", l: "st.scheduled" },
  in_progress: { s: "info", l: "st.working" },
  done: { s: "ok", l: "st.paid" },
};
const estSt: Record<EstimateStatus, { s: StatusName; l: DictKey }> = {
  draft: { s: "neutral", l: "st.draft" },
  sent: { s: "info", l: "st.sent" },
  awaiting_countersign: { s: "warn", l: "est.awaitingCountersign" },
  approved: { s: "ok", l: "st.approved" },
  declined: { s: "bad", l: "st.declined" },
};
const PHONE_KEY: Record<string, DictKey> = { mobile: "phone.mobile", home: "phone.home", work: "phone.work", other: "phone.other" };

/**
 * Client card (docs/specs/04 §7.2). Compact header: name; one line "CLT-0001 · status · tags"; call / SMS / email / route.
 * Money (office): owes, paid total, invoiced, jobs. Tabs stick to the top and never make the page jump.
 * Overview starts with the client's contacts (phones, emails, address, where they came from), then additional contacts.
 */
export default function ClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db, role } = store;
  const { t, money, moneyWhole, day } = useI18n();
  const toast = useToast();
  const [tab, setTab] = usePersistentState<Tab>("octo.clientTab.v1", "overview", { validate: (v) => TABS.includes(v) });
  const [sheet, setSheet] = useState<null | "people" | "tags" | "status">(null);
  const [menu, setMenu] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const statusRef = useRef<React.ComponentRef<typeof View>>(null);
  const [hist, setHist] = useState<"all" | HistoryKind>("all");
  const [newProp, setNewProp] = useState<Property | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/clients"));
  const c = visibleClients(db, role).find((x) => x.id === id);
  if (!c)
    return (
      <Screen title={t("clients.title")} back={back}>
        <Empty icon="user" title={t("clients.empty")} />
      </Screen>
    );
  const office = role !== "tech";
  const status = statusOf(c);
  const chip = clientStatusChip[status];
  const tags = tagsOf(db, c);
  const [main, ...others] = peopleOf(c);
  const props = db.properties.filter((p) => p.customerId === c.id);
  const jobs = db.jobs.filter((j) => props.some((p) => p.id === j.propertyId));
  const estimates = db.estimates.filter((e) => e.customerId === c.id);
  const invoices = db.invoices.filter((i) => i.customerId === c.id);
  const receipts = db.payments.filter((p) => p.customerId === c.id);
  const allTasks = db.tasks.filter((x) => x.subjectType === "customer" && x.subjectId === c.id);
  const tasks = allTasks.filter((x) => !x.doneAt);
  const doneTasks = allTasks.filter((x) => x.doneAt).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  const photos = db.visits.filter((v) => jobs.some((j) => j.id === v.jobId)).flatMap((v) => v.photos ?? []);
  const history = clientHistory(db, c.id, role);
  const m = clientMoneyOf(db, c.id);
  const tel = c.phone.replace(/[^\d+]/g, "");
  const lateCalls = noLateCallsNow(db, c);
  const nextVisit = db.visits
    .filter((v) => jobs.some((j) => j.id === v.jobId) && v.step !== "paid" && new Date(v.start).getTime() >= Date.now() - 86_400_000)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const label = (k: Tab, n?: number) => (n ? `${t(`client.tab.${k}`)} · ${n}` : t(`client.tab.${k}`));

  const openStatusMenu = () =>
    statusRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setMenu({ x, y, w, h }));
  const chooseStatus = (s: CustomerStatus) => {
    if (s === status) return;
    if (s === "do_not_service") return setSheet("status"); // needs a reason
    toast.show(t("client.statusSaved"), store.setCustomerStatus(c.id, s));
  };
  const statusOptions: CustomerStatus[] = status === "prospect" ? ["prospect", "archived", "do_not_service"] : ["active", "archived", "do_not_service"];

  const historyList = (items: typeof history) =>
    items.length === 0 ? (
      <Empty icon="clock" title={t("client.empty.history")} hint={t("client.empty.historyHint")} />
    ) : (
      <CardList>
        {items.map((h) => (
          <ItemCard
            key={h.id}
            title={t(h.title)}
            subtitle={[day(h.at), h.detail].filter(Boolean).join(" · ")}
            left={<Icon name={h.icon} />}
            right={h.cents !== undefined ? <T v="body" tabular>{money(h.cents)}</T> : undefined}
            onPress={h.href ? () => router.push(h.href as never) : undefined}
          />
        ))}
      </CardList>
    );

  const personRows = (p: Person) => (
    <>
      {p.phones.map((ph, i) => (
        <ListRow
          key={`ph${i}`}
          title={ph.number}
          subtitle={[t(PHONE_KEY[ph.label] ?? "phone.other"), p.phones.length > 1 && ph.primary ? t("person.primary") : null].filter(Boolean).join(" · ")}
          left={<Icon name="phone" />}
          onPress={() => Linking.openURL(`tel:${ph.number.replace(/[^\d+]/g, "")}`)}
        />
      ))}
      {p.emails.map((e, i) => (
        <ListRow key={`em${i}`} title={e.address} subtitle={p.emails.length > 1 && e.primary ? t("person.primary") : undefined} left={<Icon name="mail" />} onPress={() => Linking.openURL(`mailto:${e.address}`)} />
      ))}
    </>
  );

  /* ---------- tab contents ---------- */
  const overview = (
    <>
      <SectionTitle title={t("client.contacts")} right={office ? <Button label={t("ue.edit")} icon="pencil" variant="ghost" size="sm" onPress={() => setSheet("people")} /> : undefined} />
      <Card>
        {main ? personRows(main) : null}
        {props.map((p) => (
          <ListRow
            key={p.id}
            title={propertyTitle(p)}
            subtitle={p.address ? p.city : undefined}
            left={<Icon name="pin" />}
            onPress={() => router.push(`/property/${p.id}`)}
          />
        ))}
        {office && c.sourceId ? (
          <T v="caption" tone="mut">
            {t("client.cameFrom", { source: sourceName(db, c.sourceId) })}
          </T>
        ) : null}
      </Card>
      {others.length ? <SectionTitle title={t("client.moreContacts")} /> : null}
      {others.length ? (
        <CardList>
          {others.map((p) => (
            <Card key={p.id}>
              <T v="heading">{p.name || "—"}</T>
              <T v="caption" tone="mut">
                {t(`person.role.${p.role}` as DictKey)}
              </T>
              {personRows(p)}
            </Card>
          ))}
        </CardList>
      ) : office ? (
        <Button label={t("client.addContact")} icon="plus" variant="secondary" onPress={() => setSheet("people")} />
      ) : null}
      {nextVisit || tasks.length || (canSeeClientMoney(role) && m.owesCents > 0) ? (
        <>
          <SectionTitle title={t("client.next")} />
          <CardList>
            {nextVisit ? (
              <ItemCard
                title={t("client.nextVisit")}
                subtitle={[day(nextVisit.start), jobs.find((j) => j.id === nextVisit.jobId)?.title].filter(Boolean).join(" · ")}
                left={<Icon name="route" />}
                onPress={() => router.push(`/visit/${nextVisit.id}`)}
              />
            ) : null}
            {tasks.length ? <ItemCard title={t("client.openTasks", { n: tasks.length })} subtitle={tasks[0]!.title} left={<Icon name="check" />} onPress={() => setTab("tasks")} /> : null}
            {canSeeClientMoney(role) && m.owesCents > 0 ? (
              <ItemCard title={t("client.unpaid", { amount: money(m.owesCents) })} left={<Icon name="invoice" />} status="warn" onPress={() => setTab("documents")} />
            ) : null}
          </CardList>
        </>
      ) : null}
      <NotesBlock subjectType="customer" subjectId={c.id} extraSubjects={db.leads.filter((l) => l.customerId === c.id).map((l) => ({ type: "lead" as const, id: l.id }))} />
      {history.length ? (
        <>
          <SectionTitle title={t("client.recent")} right={<Button label={t("client.allHistory")} variant="ghost" size="sm" onPress={() => setTab("history")} />} />
          {historyList(history.slice(0, 3))}
        </>
      ) : null}
    </>
  );

  // C2: one card per property; the card opens the property (address, now, access, people)
  const properties = (
    <>
      {office ? <Button label={t("prop.add")} icon="plus" variant="secondary" onPress={() => setNewProp(newProperty(c.id))} /> : null}
      {props.length === 0 ? (
        <Empty icon="home2" title={t("client.empty.properties")} hint={t("client.empty.propertiesHint")} />
      ) : (
        <CardList>
          {props.map((p) => {
            const open = jobs.filter((j) => j.propertyId === p.id && j.status !== "done").length;
            return (
              <ItemCard
                key={p.id}
                title={propertyTitle(p)}
                subtitle={[p.city, p.label].filter(Boolean).join(" · ")}
                left={<Icon name="pin" />}
                right={open ? <StatusChip status="info" label={t("prop.openJobs", { n: open })} /> : undefined}
                onPress={() => router.push(`/property/${p.id}`)}
              />
            );
          })}
        </CardList>
      )}
    </>
  );

  const historyTab = (
    <>
      <ChoiceChips<"all" | HistoryKind>
        value={hist}
        onChange={setHist}
        items={(office ? (["all", "talk", "docs", "money"] as const) : (["all", "talk", "docs"] as const)).map((k) => ({ key: k, label: t(`client.h.f.${k}`) }))}
      />
      {historyList(hist === "all" ? history : history.filter((h) => h.kind === hist))}
    </>
  );

  const documents =
    estimates.length + (office ? invoices.length + receipts.length : 0) === 0 ? (
      <Empty icon="invoice" title={t("client.empty.documents")} hint={t("client.empty.documentsHint")} />
    ) : (
      <>
        {estimates.length ? <SectionTitle title={t("client.estimates")} /> : null}
        <CardList>
          {estimates.map((e) => (
            <ItemCard
              key={e.id}
              title={[e.number, e.title].filter(Boolean).join(" · ")}
              subtitle={office ? money(e.totalCents) : undefined}
              right={<StatusChip status={estSt[e.status].s} label={t(estSt[e.status].l)} />}
              onPress={() => router.push(`/estimate/${e.id}`)}
            />
          ))}
        </CardList>
        {office && invoices.length ? <SectionTitle title={t("client.invoices")} /> : null}
        {office ? (
          <CardList>
            {invoices.map((inv) => {
              const ic = invoiceChip(inv);
              return (
                <ItemCard
                  key={inv.id}
                  title={`${money(inv.totalCents)}${inv.number ? ` · ${inv.number}` : ""}`}
                  subtitle={[inv.title, db.jobs.find((j) => j.id === inv.jobId)?.title].filter(Boolean).join(" · ")}
                  right={<StatusChip status={ic.s} label={t(ic.l)} />}
                  onPress={() => router.push(`/invoice/${inv.id}`)}
                />
              );
            })}
          </CardList>
        ) : null}
        {office && receipts.length ? <SectionTitle title={t("client.receipts")} /> : null}
        {office ? (
          <CardList>
            {receipts.map((p) => (
              <ItemCard key={p.id} title={`${money(p.amountCents)}${p.receiptNumber ? ` · ${p.receiptNumber}` : ""}`} subtitle={day(p.at)} left={<Icon name="dollar" />} onPress={() => router.push(`/receipt/${p.id}`)} />
            ))}
          </CardList>
        ) : null}
      </>
    );

  const tasksTab = (
    <>
      {office ? (
        <RowView>
          <View style={{ flex: 1 }}>
            <TextField type="text" value={taskTitle} onChangeText={setTaskTitle} placeholder={t("client.taskPlaceholder")} />
          </View>
          <Button
            label={t("client.addTask")}
            icon="plus"
            disabled={!taskTitle.trim()}
            onPress={() => {
              const r = store.saveTask({ subjectType: "customer", subjectId: c.id, title: taskTitle.trim(), assigneeId: db.me });
              setTaskTitle("");
              toast.show(t("client.taskAdded"), r.undo);
            }}
          />
        </RowView>
      ) : null}
      {tasks.length === 0 && doneTasks.length === 0 ? (
        <Empty icon="check" title={t("client.empty.tasks")} hint={office ? t("client.empty.tasksHint") : undefined} />
      ) : null}
      {tasks.length ? (
        <CardList>
          {tasks.map((x) => (
            <ItemCard
              key={x.id}
              title={x.title}
              subtitle={x.dueAt ? day(x.dueAt) : undefined}
              left={<Icon name="check" />}
              right={<Button label={t("client.taskDone")} variant="secondary" size="sm" onPress={() => toast.show(t("client.taskDoneToast"), store.saveTask({ ...x, doneAt: new Date().toISOString() }).undo)} />}
            />
          ))}
        </CardList>
      ) : null}
      {doneTasks.length ? (
        <>
          <SectionTitle title={t("client.doneTasks", { n: doneTasks.length })} />
          <CardList>
            {doneTasks.map((x) => (
              <Card key={x.id}>
                <RowView>
                  <Icon name="check" />
                  <View style={{ flex: 1 }}>
                    <T v="body" tone="mut" style={{ textDecorationLine: "line-through" }}>
                      {x.title}
                    </T>
                    <T v="caption" tone="mut">
                      {t("client.doneOn", { date: day(x.doneAt!) })}
                    </T>
                  </View>
                  <Button label={t("client.taskReopen")} variant="ghost" size="sm" onPress={() => toast.show(t("client.taskReopened"), store.saveTask({ ...x, doneAt: undefined }).undo)} />
                </RowView>
              </Card>
            ))}
          </CardList>
        </>
      ) : null}
    </>
  );

  const files =
    photos.length === 0 ? (
      <Empty icon="camera" title={t("client.empty.files")} hint={t("client.empty.filesHint")} />
    ) : (
      <CardList>
        <ItemCard title={t("client.photos", { n: photos.length })} subtitle={t("client.photosHint")} left={<Icon name="image" />} />
      </CardList>
    );

  const body: Record<Tab, React.ReactNode> = { overview, properties, history: historyTab, documents, tasks: tasksTab, files };

  return (
    <Screen
      title={c.name}
      back={back}
      right={office ? <Button label={t("ue.edit")} icon="pencil" variant="ghost" size="sm" onPress={() => router.push(`/client/edit?id=${c.id}`)} /> : undefined}
      tabKey={tab}
      tabs={
        <Segmented
          scroll
          value={tab}
          onChange={setTab}
          items={[
            { key: "overview", label: label("overview") },
            { key: "properties", label: label("properties", props.length) },
            { key: "history", label: label("history") },
            { key: "documents", label: label("documents", estimates.length + (office ? invoices.length : 0)) },
            { key: "tasks", label: label("tasks", tasks.length) },
            { key: "files", label: label("files", photos.length) },
          ]}
        />
      }
      below={body[tab]}
    >
      {/* one line: number · status · tags */}
      <RowView style={{ flexWrap: "wrap", marginTop: -space[2] }}>
        {c.number ? (
          <T v="caption" tone="mut" tabular>
            {c.number}
          </T>
        ) : null}
        {office ? (
          <View ref={statusRef} collapsable={false}>
            <Press onPress={openStatusMenu} visibleHeight={component.button.sm} accessibilityRole="button" accessibilityLabel={`${t("client.statusTitle")}: ${t(chip.l)}`}>
              <StatusChip status={chip.s} label={t(chip.l)} />
            </Press>
          </View>
        ) : (
          <StatusChip status={chip.s} label={t(chip.l)} />
        )}
        {tags.map((x) => (
          <TagChip key={x.id} label={tagLabel(x, t)} onPress={office ? () => setSheet("tags") : undefined} />
        ))}
        {office ? <TagChip label={tags.length ? "+" : t("client.addTag")} onPress={() => setSheet("tags")} /> : null}
      </RowView>
      {status === "do_not_service" && c.statusReason ? (
        <T v="caption" tone="mut">
          {t("client.reason", { r: c.statusReason })}
        </T>
      ) : null}

      <RowView>
        {tel ? <IconButton icon="phone" label={t("client.call")} onPress={() => Linking.openURL(`tel:${tel}`)} /> : null}
        {tel ? <IconButton icon="sms" label={t("visit.message")} onPress={() => Linking.openURL(`sms:${tel}`)} /> : null}
        {c.email ? <IconButton icon="mail" label={t("client.email")} onPress={() => Linking.openURL(`mailto:${c.email}`)} /> : null}
        {props[0] ? (
          <IconButton
            icon="navigate"
            label={t("client.route")}
            onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(`${props[0]!.address}, ${props[0]!.city}`)}`)}
          />
        ) : null}
        {lateCalls ? <StatusChip status="warn" label={t("client.lateCalls")} /> : null}
      </RowView>

      {canSeeClientMoney(role) ? (
        <Card>
          <RowView style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <MoneyCell label={t("client.owes")} value={moneyWhole(m.owesCents)} tone={m.owesCents > 0 ? "warn" : "ink"} />
            <MoneyCell label={t("client.paidTotal")} value={moneyWhole(m.paidTotalCents)} end />
          </RowView>
          <RowView style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <MoneyCell label={t("client.invoiced")} value={moneyWhole(m.invoicedCents)} small />
            <MoneyCell label={t("client.jobs")} value={String(jobs.length)} small end />
          </RowView>
        </Card>
      ) : null}

      <Menu
        visible={!!menu}
        anchor={menu}
        title={t("client.statusTitle")}
        onClose={() => setMenu(null)}
        onSelect={chooseStatus}
        items={statusOptions.map((s) => ({ key: s, label: t(clientStatusChip[s].l), selected: s === status, destructive: s === "do_not_service" }))}
      />
      <PeopleSheet visible={sheet === "people"} customer={c} onClose={() => setSheet(null)} />
      <PropertySheet value={newProp} onClose={() => setNewProp(null)} />
      <TagsSheet visible={sheet === "tags"} customer={c} onClose={() => setSheet(null)} />
      <StatusSheet visible={sheet === "status"} customer={c} preset="do_not_service" onClose={() => setSheet(null)} />
    </Screen>
  );
}

function MoneyCell({ label, value, tone = "ink", end, small }: { label: string; value: string; tone?: "ink" | "warn"; end?: boolean; small?: boolean }) {
  return (
    <View style={{ alignItems: end ? "flex-end" : "flex-start", flex: 1 }}>
      <T v="caption" tone="mut">
        {label}
      </T>
      <T v={small ? "heading" : "title"} tabular tone={tone}>
        {value}
      </T>
    </View>
  );
}
