import { useState } from "react";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { component, space, type StatusName } from "@octo/design-tokens";
import { NotesBlock } from "@/features/NotesBlock";
import { invoiceChip } from "@/features/ContractStatement";
import { useStore } from "@/data/store";
import { peopleOf } from "@/data/people";
import { usePersistentState } from "@/data/persist";
import { sourceName } from "@/features/leads";
import { canSeeClientMoney, clientHistory, clientMoneyOf, clientStatusChip, statusOf, tagLabel, tagsOf, visibleClients, type HistoryKind } from "@/features/clients";
import { PeopleSheet, StatusSheet, TagsSheet } from "@/features/client/ClientSheets";
import type { EstimateStatus, JobStatus } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { Button, ChoiceChips, IconButton, Segmented, StatusChip, TagChip, TextField } from "@/ui/controls";
import { Icon, Press, T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, CardList, Empty, ItemCard, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";

type Tab = "overview" | "properties" | "history" | "documents" | "tasks" | "files";
const TABS: Tab[] = ["overview", "properties", "history", "documents", "tasks", "files"];

const jobSt: Record<JobStatus, { s: StatusName; l: DictKey }> = {
  lead: { s: "info", l: "st.new" },
  estimate: { s: "info", l: "st.inspection" },
  unscheduled: { s: "warn", l: "st.toSchedule" },
  scheduled: { s: "neutral", l: "st.scheduled" },
  in_progress: { s: "info", l: "st.working" },
  done: { s: "ok", l: "st.paid" },
};
const estSt: Record<EstimateStatus, { s: StatusName; l: DictKey }> = {
  draft: { s: "neutral", l: "st.draft" },
  sent: { s: "info", l: "st.sent" },
  approved: { s: "ok", l: "st.approved" },
  declined: { s: "bad", l: "st.declined" },
};
const ROLE_KEY: Record<string, DictKey> = {
  main: "person.role.main",
  spouse: "person.role.spouse",
  assistant: "person.role.assistant",
  tenant: "person.role.tenant",
  property_manager: "person.role.property_manager",
  accountant: "person.role.accountant",
  other: "person.role.other",
};
const PHONE_KEY: Record<string, DictKey> = { mobile: "phone.mobile", home: "phone.home", work: "phone.work", other: "phone.other" };

/**
 * Client card (docs/specs/04 §7.2): number · source, status label, tags, call / SMS / email / route,
 * "Owes / Paid total" (office only), tabs Overview · Properties · History · Documents · Tasks · Files.
 */
export default function ClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db, role } = store;
  const { t, money, day } = useI18n();
  const toast = useToast();
  const [tab, setTab] = usePersistentState<Tab>("octo.clientTab.v1", "overview", { validate: (v) => TABS.includes(v) });
  const [sheet, setSheet] = useState<null | "people" | "tags" | "status">(null);
  const [hist, setHist] = useState<"all" | HistoryKind>("all");
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
  const people = peopleOf(c);
  const props = db.properties.filter((p) => p.customerId === c.id);
  const jobs = db.jobs.filter((j) => props.some((p) => p.id === j.propertyId));
  const estimates = db.estimates.filter((e) => e.customerId === c.id);
  const invoices = db.invoices.filter((i) => i.customerId === c.id);
  const receipts = db.payments.filter((p) => p.customerId === c.id);
  const tasks = db.tasks.filter((x) => x.subjectType === "customer" && x.subjectId === c.id && !x.doneAt);
  const photos = db.visits.filter((v) => jobs.some((j) => j.id === v.jobId)).flatMap((v) => v.photos ?? []);
  const history = clientHistory(db, c.id, role);
  const m = clientMoneyOf(db, c.id);
  const tel = c.phone.replace(/[^\d+]/g, "");
  const nextVisit = db.visits
    .filter((v) => jobs.some((j) => j.id === v.jobId) && v.step !== "paid" && new Date(v.start).getTime() >= Date.now() - 86_400_000)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const label = (k: Tab, n?: number) => (n ? `${t(`client.tab.${k}`)} · ${n}` : t(`client.tab.${k}`));

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

  return (
    <Screen
      title={c.name}
      back={back}
      subtitle={[c.number, office ? sourceName(db, c.sourceId) : undefined].filter(Boolean).join(" · ")}
      right={office ? <Button label={t("ue.edit")} icon="pencil" variant="ghost" size="sm" onPress={() => router.push(`/client/edit?id=${c.id}`)} /> : undefined}
    >
      <RowView style={{ flexWrap: "wrap" }}>
        {office ? (
          <Press onPress={() => setSheet("status")} visibleHeight={component.button.sm} accessibilityRole="button" accessibilityLabel={`${t("client.statusTitle")}: ${t(chip.l)}`}>
            <StatusChip status={chip.s} label={t(chip.l)} />
          </Press>
        ) : (
          <StatusChip status={chip.s} label={t(chip.l)} />
        )}
        {tags.map((x) => (
          <TagChip key={x.id} label={tagLabel(x, t)} onPress={office ? () => setSheet("tags") : undefined} />
        ))}
        {office && tags.length === 0 ? <Button label={t("client.addTag")} icon="plus" variant="ghost" size="sm" onPress={() => setSheet("tags")} /> : null}
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
      </RowView>

      {canSeeClientMoney(role) ? (
        <Card>
          <RowView style={{ justifyContent: "space-between" }}>
            <View>
              <T v="caption" tone="mut">
                {t("client.owes")}
              </T>
              <T v="title" tabular tone={m.owesCents > 0 ? "warn" : "ink"}>
                {money(m.owesCents)}
              </T>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <T v="caption" tone="mut">
                {t("client.paidTotal")}
              </T>
              <T v="title" tabular>
                {money(m.paidTotalCents)}
              </T>
            </View>
          </RowView>
        </Card>
      ) : null}

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

      {tab === "overview" ? (
        <>
          <NotesBlock subjectType="customer" subjectId={c.id} extraSubjects={db.leads.filter((l) => l.customerId === c.id).map((l) => ({ type: "lead" as const, id: l.id }))} />
          {nextVisit || tasks.length || m.owesCents > 0 ? (
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
          <SectionTitle
            title={t("client.people")}
            right={office ? <Button label={t("ue.edit")} icon="pencil" variant="ghost" size="sm" onPress={() => setSheet("people")} /> : undefined}
          />
          <CardList>
            {people.map((p) => (
              <Card key={p.id}>
                <T v="heading">{p.name || "—"}</T>
                <T v="caption" tone="mut">
                  {t(ROLE_KEY[p.role] ?? "person.role.other")}
                </T>
                {p.phones.map((ph, i) => (
                  <ListRow
                    key={`ph${i}`}
                    title={ph.number}
                    subtitle={`${t(PHONE_KEY[ph.label] ?? "phone.other")}${ph.primary ? ` · ${t("person.primary")}` : ""}`}
                    left={<Icon name="phone" />}
                    onPress={() => Linking.openURL(`tel:${ph.number.replace(/[^\d+]/g, "")}`)}
                  />
                ))}
                {p.emails.map((e, i) => (
                  <ListRow key={`em${i}`} title={e.address} subtitle={e.primary ? t("person.primary") : undefined} left={<Icon name="mail" />} onPress={() => Linking.openURL(`mailto:${e.address}`)} />
                ))}
              </Card>
            ))}
          </CardList>
          {history.length ? (
            <>
              <SectionTitle title={t("client.recent")} right={<Button label={t("client.allHistory")} variant="ghost" size="sm" onPress={() => setTab("history")} />} />
              {historyList(history.slice(0, 3))}
            </>
          ) : null}
        </>
      ) : null}

      {tab === "properties" ? (
        props.length === 0 ? (
          <Empty icon="home2" title={t("client.empty.properties")} hint={t("client.empty.propertiesHint")} />
        ) : (
          <CardList>
            {props.map((p) => {
              const pj = jobs.filter((j) => j.propertyId === p.id && j.status !== "done");
              return (
                <Card key={p.id}>
                  <T v="heading">{p.address || p.city}</T>
                  <T v="caption" tone="mut">
                    {p.city}
                  </T>
                  {pj.map((j) => (
                    <ListRow key={j.id} title={j.title} right={<StatusChip status={jobSt[j.status].s} label={t(jobSt[j.status].l)} />} onPress={() => router.push(`/job/${j.id}`)} />
                  ))}
                  {office ? (
                    <Button label={t("est.new")} icon="invoice" variant="secondary" size="sm" onPress={() => router.push(`/estimate/new?customerId=${c.id}&propertyId=${p.id}`)} />
                  ) : null}
                </Card>
              );
            })}
          </CardList>
        )
      ) : null}

      {tab === "history" ? (
        <>
          <ChoiceChips<"all" | HistoryKind>
            value={hist}
            onChange={setHist}
            items={(office ? (["all", "talk", "docs", "money"] as const) : (["all", "talk", "docs"] as const)).map((k) => ({ key: k, label: t(`client.h.f.${k}`) }))}
          />
          {historyList(hist === "all" ? history : history.filter((h) => h.kind === hist))}
        </>
      ) : null}

      {tab === "documents" ? (
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
        )
      ) : null}

      {tab === "tasks" ? (
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
          {tasks.length === 0 ? (
            <Empty icon="check" title={t("client.empty.tasks")} hint={office ? t("client.empty.tasksHint") : undefined} />
          ) : (
            <CardList>
              {tasks.map((x) => (
                <ItemCard
                  key={x.id}
                  title={x.title}
                  subtitle={x.dueAt ? day(x.dueAt) : undefined}
                  left={<Icon name="check" />}
                  right={
                    <Button
                      label={t("client.taskDone")}
                      variant="secondary"
                      size="sm"
                      onPress={() => toast.show(t("client.taskDoneToast"), store.saveTask({ ...x, doneAt: new Date().toISOString() }).undo)}
                    />
                  }
                />
              ))}
            </CardList>
          )}
        </>
      ) : null}

      {tab === "files" ? (
        photos.length === 0 ? (
          <Empty icon="camera" title={t("client.empty.files")} hint={t("client.empty.filesHint")} />
        ) : (
          <CardList>
            <ItemCard title={t("client.photos", { n: photos.length })} subtitle={t("client.photosHint")} left={<Icon name="image" />} />
          </CardList>
        )
      ) : null}

      <PeopleSheet visible={sheet === "people"} customer={c} onClose={() => setSheet(null)} />
      <TagsSheet visible={sheet === "tags"} customer={c} onClose={() => setSheet(null)} />
      <StatusSheet visible={sheet === "status"} customer={c} onClose={() => setSheet(null)} />
      <View style={{ height: space[2] }} />
    </Screen>
  );
}
