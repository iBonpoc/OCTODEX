/**
 * The lists the rows of the client card open (docs/specs/13-app-structure.md §3.3, wave 4): properties (+ property),
 * people, jobs, leads, estimates, invoices and receipts, tasks, notes, files, history. One object — one card (rule 12).
 * The contents of the old tabs (docs/specs/04 §7.2) moved here unchanged.
 */
import { useState } from "react";
import { Linking, View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { findJob } from "@/data/jobs";
import type { Customer, Person, Property } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { clientHistory, type HistoryKind } from "@/features/clients";
import { clientRecords, type ClientRow } from "@/features/clientRows";
import { invoiceChip } from "@/features/ContractStatement";
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
import { Button, ChoiceChips, StatusChip, TextField } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, CardList, Empty, ItemCard, ListRow, RowView, SectionTitle } from "@/ui/surfaces";

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
  const r = clientRecords(db, c, role);
  const [newProp, setNewProp] = useState<Property | null>(null);
  const [people, setPeople] = useState(false);
  const [hist, setHist] = useState<"all" | HistoryKind>("all");
  const [taskEdit, setTaskEdit] = useState<TaskDraft | null>(null);
  const [calling, setCalling] = useState<CallPreset | null>(null);

  switch (s) {
    case "properties":
      return (
        <>
          {office ? <Button label={t("prop.add")} icon="plus" variant="secondary" onPress={() => setNewProp(newProperty(c.id))} /> : null}
          {r.properties.length === 0 ? (
            <Empty icon="home2" title={t("client.empty.properties")} hint={t("client.empty.propertiesHint")} />
          ) : (
            <CardList>
              {r.properties.map((p) => {
                const open = r.jobs.filter((j) => j.propertyId === p.id && j.status !== "done").length;
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
        <CardList>
          {r.jobs.map((j) => {
            const v = jobStatusView[j.status];
            const p = db.properties.find((x) => x.id === j.propertyId);
            return (
              <ItemCard
                key={j.id}
                title={[j.number, j.title].filter(Boolean).join(" · ")}
                subtitle={[p ? propertyTitle(p) : null, office ? money(j.amountCents) : null].filter(Boolean).join(" · ")}
                right={<StatusChip status={v.status} label={t(v.label)} />}
                onPress={() => router.push(`/job/${j.id}`)}
              />
            );
          })}
        </CardList>
      );

    case "leads":
      return r.leads.length === 0 ? (
        <Empty icon="inbox" title={t("client.empty.leads")} />
      ) : (
        <CardList>
          {r.leads.map((l) => {
            const v = leadStatusView[l.status];
            return (
              <ItemCard
                key={l.id}
                title={[l.number, l.service ?? l.name].filter(Boolean).join(" · ")}
                subtitle={day(l.receivedAt)}
                right={<StatusChip status={v.status} label={t(v.label)} />}
                onPress={() => router.push(`/lead/${l.id}`)}
              />
            );
          })}
        </CardList>
      );

    case "estimates":
      return r.estimates.length === 0 ? (
        <Empty icon="invoice" title={t("client.empty.estimates")} hint={t("client.empty.documentsHint")} />
      ) : (
        <CardList>
          {r.estimates.map((e) => {
            const v = estView[e.status];
            return (
              <ItemCard
                key={e.id}
                title={[e.number, e.title].filter(Boolean).join(" · ")}
                subtitle={office ? money(e.totalCents) : undefined}
                right={<StatusChip status={v.s} label={t(v.l)} />}
                onPress={() => router.push(`/estimate/${e.id}`)}
              />
            );
          })}
        </CardList>
      );

    case "invoices":
      return r.invoices.length + r.receipts.length === 0 ? (
        <Empty icon="invoice" title={t("client.empty.invoices")} hint={t("client.empty.documentsHint")} />
      ) : (
        <>
          {r.invoices.length ? <SectionTitle title={t("client.invoices")} /> : null}
          <CardList>
            {r.invoices.map((inv) => {
              const ic = invoiceChip(inv);
              return (
                <ItemCard
                  key={inv.id}
                  title={`${money(inv.totalCents)}${inv.number ? ` · ${inv.number}` : ""}`}
                  subtitle={[inv.title, findJob(db, inv.jobId)?.title].filter(Boolean).join(" · ")}
                  right={<StatusChip status={ic.s} label={t(ic.l)} />}
                  onPress={() => router.push(`/invoice/${inv.id}`)}
                />
              );
            })}
          </CardList>
          {r.receipts.length ? <SectionTitle title={t("client.receipts")} /> : null}
          <CardList>
            {r.receipts.map((p) => (
              <ItemCard
                key={p.id}
                title={`${money(p.amountCents)}${p.receiptNumber ? ` · ${p.receiptNumber}` : ""}`}
                subtitle={day(p.at)}
                left={<Icon name="dollar" />}
                onPress={() => router.push(`/receipt/${p.id}`)}
              />
            ))}
          </CardList>
        </>
      );

    case "tasks": {
      const open = r.tasks.filter((x) => !x.doneAt);
      const done = r.tasks.filter((x) => x.doneAt).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
      return (
        <>
          {/* wave 6-1/6-2: the one task form (20 §7) — the client is already «к чему» */}
          {office ? <Button label={t("task.new")} icon="plus" variant="secondary" onPress={() => setTaskEdit({ subjectType: "customer", subjectId: c.id, title: "", assigneeId: db.me })} /> : null}
          <TaskSheet value={taskEdit} onClose={() => setTaskEdit(null)} />
          {open.length === 0 && done.length === 0 ? <Empty icon="check" title={t("client.empty.tasks")} hint={office ? t("client.empty.tasksHint") : undefined} /> : null}
          {open.length ? (
            <CardList>
              {open.map((x) => (
                <ItemCard
                  key={x.id}
                  title={x.title}
                  subtitle={x.dueAt ? day(x.dueAt) : undefined}
                  left={<Icon name="check" />}
                  onPress={() => setTaskEdit(x)}
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
          ) : null}
          {done.length ? (
            <>
              <SectionTitle title={t("client.doneTasks", { n: done.length })} />
              <CardList>
                {done.map((x) => (
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
    }

    case "notes":
      return <NotesBlock subjectType="customer" subjectId={c.id} extraSubjects={r.leadIds.map((id) => ({ type: "lead" as const, id }))} />;

    case "files":
      return r.photos.length + r.files.length === 0 ? (
        <Empty icon="camera" title={t("client.empty.files")} hint={t("client.empty.filesHint")} />
      ) : (
        <CardList>
          <ItemCard title={t("client.photos", { n: r.photos.length + r.files.length })} subtitle={t("client.photosHint")} left={<Icon name="image" />} />
        </CardList>
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
          )}
        </>
      );
    }

    case "billing":
      return null;
  }
}
