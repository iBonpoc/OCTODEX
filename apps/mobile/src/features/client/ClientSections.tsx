/**
 * The lists the rows of the client card open (docs/specs/13-app-structure.md §3.3, wave 4): properties (+ property),
 * people, jobs, leads, estimates, invoices and receipts, tasks, notes, files, history. One object — one card (rule 12).
 * The contents of the old tabs (docs/specs/04 §7.2) moved here unchanged.
 */
import { useState } from "react";
import { space } from "@octo/design-tokens";
import { Linking, View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { findJob } from "@/data/jobs";
import type { Customer, Person, Property } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { clientHistory, type HistoryKind } from "@/features/clients";
import { clientRecords, type ClientRow } from "@/features/clientRows";
import { invoiceChip } from "@/features/ContractStatement";
import { VoidInvoiceCards } from "@/features/invoice/VoidInvoice";
import { estView } from "@/features/boards";
import { jobStatusView } from "@/features/jobs";
import { leadStatusView } from "@/features/leads";
import { NotesBlock } from "@/features/NotesBlock";
import { PeopleSheet } from "@/features/client/ClientSheets";
import { TaskSheet, type TaskDraft } from "@/features/tasks/TaskSheet";
import { CallSheet, type CallPreset } from "@/features/comms/CallSheet";
import { useDialThenAsk } from "@/features/comms/dial";
import { callPlaceForClient } from "@/features/comms/comms";
import { newProperty, PropertySheet } from "@/features/client/PropertySheets";
import { propertyTitle } from "@/features/properties";
import { mailtoHref } from "@/features/contactLinks";
import { Button, ChoiceChips, TextField } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, CardList, Empty, ListRow, SectionTitle } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";

const PHONE_KEY: Record<string, DictKey> = { mobile: "phone.mobile", home: "phone.home", work: "phone.work", other: "phone.other" };

/** the phones and emails of a person; a phone calls and then asks «Чем кончился?» (onCall, 20 §5) */
export function PersonRows({ p, onCall }: { p: Person; onCall?: (p: Person) => void }) {
  const { t } = useI18n();
  const dial = useDialThenAsk();
  return (
    <>
      {p.phones.map((ph, i) => (
        <ListRow
          key={`ph${i}`}
          title={ph.number}
          subtitle={[t(PHONE_KEY[ph.label] ?? "phone.other"), p.phones.length > 1 && ph.primary ? t("person.primary") : null].filter(Boolean).join(" · ")}
          left={<Icon name="phone" />}
          onPress={() => dial(ph.number, () => onCall?.(p))}
        />
      ))}
      {p.emails.map((e, i) => (
        <ListRow
          key={`em${i}`}
          title={e.address}
          subtitle={p.emails.length > 1 && e.primary ? t("person.primary") : undefined}
          left={<Icon name="mail" />}
          onPress={() => {
            const u = mailtoHref(e.address);
            if (u) Linking.openURL(u).catch(() => {});
          }}
        />
      ))}
    </>
  );
}

export function ClientSection({ c, s }: { c: Customer; s: ClientRow }) {
  const store = useStore();
  const { db, role } = store;
  const { t, money, day } = useI18n();
  const toast = useToast();
  const office = role !== "tech";
  const r = clientRecords(db, c, role, store.mode);
  const [newProp, setNewProp] = useState<Property | null>(null);
  const [people, setPeople] = useState(false);
  const [hist, setHist] = useState<"all" | HistoryKind>("all");
  const [taskEdit, setTaskEdit] = useState<TaskDraft | null>(null);
  const [calling, setCalling] = useState<CallPreset | null>(null);

  const newTask = () => setTaskEdit({ subjectType: "customer", subjectId: c.id, title: "", assigneeId: db.me });

  switch (s) {
    case "properties":
      return (
        <>
          {office && r.properties.length ? <Button label={t("prop.add")} icon="plus" variant="secondary" onPress={() => setNewProp(newProperty(c.id))} /> : null}
          {r.properties.length === 0 ? (
            // an empty list says what to do: the button to make the first one stands in it (S-42, #882)
            <Empty
              icon="home2"
              title={t("client.empty.properties")}
              hint={t("client.empty.propertiesHint")}
              action={office ? <View testID="client-empty-add-property"><Button label={t("prop.add")} icon="plus" onPress={() => setNewProp(newProperty(c.id))} /></View> : undefined}
            />
          ) : (
            <CardGrid>
              {r.properties.map((p) => {
                const open = r.jobs.filter((j) => j.propertyId === p.id && j.status !== "done").length;
                return (
                  <ListCard
                    key={p.id}
                    density="compact"
                    testID={`client-property-${p.id}`}
                    lead={{ kind: "icon", icon: "pin" }}
                    title={propertyTitle(p)}
                    when={[p.city, p.label].filter(Boolean).join(" · ") || undefined}
                    status={open ? { tone: "info", label: t("prop.openJobs", { n: open }) } : undefined}
                    onPress={() => router.push(`/property/${p.id}`)}
                  />
                );
              })}
            </CardGrid>
          )}
          <PropertySheet value={newProp} onClose={() => setNewProp(null)} />
        </>
      );

    case "people":
      return (
        <>
          {office ? <Button label={t("client.people")} icon="users" variant="secondary" onPress={() => setPeople(true)} /> : null}
          <CardList>
            {r.people.map((p) => (
              <Card key={p.id}>
                <T v="heading">{p.name || c.name}</T>
                <T v="caption" tone="mut">
                  {t(`person.role.${p.role}` as DictKey)}
                </T>
                <PersonRows p={p} onCall={(x) => setCalling({ ...(callPlaceForClient(db, role, c.id) ?? {}), customerId: c.id, contactId: x.id })} />
              </Card>
            ))}
          </CardList>
          <PeopleSheet visible={people} customer={c} onClose={() => setPeople(false)} />
          <CallSheet preset={calling} onClose={() => setCalling(null)} />
        </>
      );

    case "jobs":
      return r.jobs.length === 0 ? (
        <Empty icon="wrench" title={t("client.empty.jobs")} hint={office ? t("client.empty.jobsHint") : undefined} />
      ) : (
        <CardGrid>
          {r.jobs.map((j) => {
            const v = jobStatusView[j.status];
            const p = db.properties.find((x) => x.id === j.propertyId);
            return (
              <ListCard
                key={j.id}
                density="compact"
                testID={`client-job-${j.id}`}
                lead={{ kind: "icon", icon: "wrench" }}
                title={j.title || j.number || ""}
                when={[j.title ? j.number : null, p ? propertyTitle(p) : null].filter(Boolean).join(" · ") || undefined}
                value={office ? money(j.amountCents) : undefined}
                status={{ tone: v.status, label: t(v.label) }}
                onPress={() => router.push(`/job/${j.id}`)}
              />
            );
          })}
        </CardGrid>
      );

    case "leads":
      return r.leads.length === 0 ? (
        <Empty icon="inbox" title={t("client.empty.leads")} />
      ) : (
        <CardGrid>
          {r.leads.map((l) => {
            const v = leadStatusView[l.status];
            return (
              <ListCard
                key={l.id}
                density="compact"
                testID={`client-lead-${l.id}`}
                lead={{ kind: "icon", icon: "inbox" }}
                title={l.service ?? l.name ?? l.number ?? ""}
                when={[l.number, day(l.receivedAt)].filter(Boolean).join(" · ")}
                status={{ tone: v.status, label: t(v.label) }}
                onPress={() => router.push(`/lead/${l.id}`)}
              />
            );
          })}
        </CardGrid>
      );

    case "estimates":
      return r.estimates.length === 0 ? (
        <>
          <PropertySheet value={newProp} onClose={() => setNewProp(null)} />
          <Empty
            icon="invoice"
            title={t("client.empty.estimates")}
            hint={t("client.empty.documentsHint")}
            // an estimate is made for an address: no address yet — the first thing to make is the address
            action={
              office ? (
                <View testID="client-empty-add-estimate">
                  <Button
                    label={r.properties.length ? t("est.new") : t("prop.add")}
                    icon="plus"
                    onPress={() => (r.properties.length ? router.push(`/estimate/new?customerId=${c.id}&propertyId=${r.properties[0]!.id}`) : setNewProp(newProperty(c.id)))}
                  />
                </View>
              ) : undefined
            }
          />
        </>
      ) : (
        <CardGrid>
          {r.estimates.map((e) => {
            const v = estView[e.status];
            return (
              <ListCard
                key={e.id}
                density="compact"
                testID={`client-estimate-${e.id}`}
                lead={{ kind: "icon", icon: "invoice" }}
                title={e.title || e.number || ""}
                when={e.title ? e.number : undefined}
                value={office ? money(e.totalCents) : undefined}
                status={{ tone: v.s, label: t(v.l) }}
                onPress={() => router.push(`/estimate/${e.id}`)}
              />
            );
          })}
        </CardGrid>
      );

    case "invoices":
      return r.invoices.length + r.receipts.length + (db.voidInvoices ?? []).filter((i) => i.customerId === c.id).length === 0 ? (
        <Empty icon="invoice" title={t("client.empty.invoices")} hint={t("client.empty.documentsHint")} />
      ) : (
        <>
          {r.invoices.length ? <SectionTitle title={t("client.invoices")} /> : null}
          <CardGrid>
            {r.invoices.map((inv) => {
              const ic = invoiceChip(inv);
              return (
                <ListCard
                  key={inv.id}
                  density="compact"
                  testID={`client-invoice-${inv.id}`}
                  lead={{ kind: "icon", icon: "invoice" }}
                  title={inv.title || findJob(db, inv.jobId)?.title || inv.number || ""}
                  when={[inv.number, inv.title ? findJob(db, inv.jobId)?.title : null].filter(Boolean).join(" · ") || undefined}
                  value={money(inv.totalCents)}
                  status={{ tone: ic.s, label: t(ic.l) }}
                  onPress={() => router.push(`/invoice/${inv.id}`)}
                />
              );
            })}
          </CardGrid>
          <VoidInvoiceCards list={(db.voidInvoices ?? []).filter((i) => i.customerId === c.id)} testPrefix="client" />
          {r.receipts.length ? <SectionTitle title={t("client.receipts")} /> : null}
          <CardGrid>
            {r.receipts.map((p) => (
              <ListCard
                key={p.id}
                density="compact"
                testID={`client-receipt-${p.id}`}
                lead={{ kind: "icon", icon: "dollar" }}
                title={p.receiptNumber ?? t("rcpt.title")}
                when={day(p.at)}
                value={money(p.amountCents)}
                valueTone="ok"
                onPress={() => router.push(`/receipt/${p.id}`)}
              />
            ))}
          </CardGrid>
        </>
      );

    case "tasks": {
      const open = r.tasks.filter((x) => !x.doneAt);
      const done = r.tasks.filter((x) => x.doneAt).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
      return (
        <>
          {/* wave 6-1/6-2: the one task form (20 §7) — the client is already «к чему» */}
          {office && (open.length || done.length) ? <Button label={t("task.new")} icon="plus" variant="secondary" onPress={newTask} /> : null}
          <TaskSheet value={taskEdit} onClose={() => setTaskEdit(null)} />
          {open.length === 0 && done.length === 0 ? (
            <Empty
              icon="check"
              title={t("client.empty.tasks")}
              hint={office ? t("client.empty.tasksHint") : undefined}
              action={office ? <View testID="client-empty-add-task"><Button label={t("task.new")} icon="plus" onPress={newTask} /></View> : undefined}
            />
          ) : null}
          {open.length ? (
            <CardGrid>
              {open.map((x) => (
                // recipe E (06 §3): the tick on the left closes the task (undo in the toast), the card opens the form
                <ListCard
                  key={x.id}
                  density="compact"
                  testID={`client-task-${x.id}`}
                  lead={{ kind: "check", on: false, label: t("client.taskDone"), onToggle: () => toast.show(t("client.taskDoneToast"), store.saveTask({ ...x, doneAt: new Date().toISOString() }).undo) }}
                  title={x.title}
                  when={x.dueAt ? day(x.dueAt) : undefined}
                  onPress={() => setTaskEdit(x)}
                />
              ))}
            </CardGrid>
          ) : null}
          {done.length ? (
            <>
              <SectionTitle title={t("client.doneTasks", { n: done.length })} />
              <CardGrid>
                {done.map((x) => (
                  // the tick taken off reopens the task (undo in the toast)
                  <ListCard
                    key={x.id}
                    density="compact"
                    testID={`client-task-done-${x.id}`}
                    lead={{ kind: "check", on: true, label: t("client.taskReopen"), onToggle: () => toast.show(t("client.taskReopened"), store.saveTask({ ...x, doneAt: undefined }).undo) }}
                    title={x.title}
                    when={t("client.doneOn", { date: day(x.doneAt!) })}
                  />
                ))}
              </CardGrid>
            </>
          ) : null}
        </>
      );
    }

    case "notes":
      return <NotesBlock subjectType="customer" subjectId={c.id} extraSubjects={r.leadIds.map((id) => ({ type: "lead" as const, id }))} />;

    case "files":
      return r.photos.length + r.files.length === 0 ? (
        <Empty icon="camera" title={t("client.empty.files")} hint={t("client.empty.filesHint")} />
      ) : (
        // one hint, not a list of objects (06 «10а, остаток» п.6): Card + ListRow
        <Card style={{ paddingVertical: space[1] }}>
          <ListRow title={t("client.photos", { n: r.photos.length + r.files.length })} subtitle={t("client.photosHint")} left={<Icon name="image" />} />
        </Card>
      );

    case "history": {
      const history = clientHistory(db, c.id, role);
      const items = hist === "all" ? history : history.filter((h) => h.kind === hist);
      return (
        <>
          <ChoiceChips<"all" | HistoryKind>
            value={hist}
            onChange={setHist}
            items={(office ? (["all", "talk", "docs", "money"] as const) : (["all", "talk", "docs"] as const)).map((k) => ({ key: k, label: t(`client.h.f.${k}`) }))}
          />
          {items.length === 0 ? (
            <Empty icon="clock" title={t("client.empty.history")} hint={t("client.empty.historyHint")} />
          ) : (
            <CardGrid>
              {items.map((h) => (
                <ListCard
                  key={h.id}
                  density="compact"
                  lead={{ kind: "icon", icon: h.icon }}
                  title={t(h.title)}
                  when={[day(h.at), h.detail].filter(Boolean).join(" · ")}
                  value={h.cents !== undefined ? money(h.cents) : undefined}
                  onPress={h.href ? () => router.push(h.href as never) : undefined}
                />
              ))}
            </CardGrid>
          )}
        </>
      );
    }

    case "billing":
      return null;
  }
}
