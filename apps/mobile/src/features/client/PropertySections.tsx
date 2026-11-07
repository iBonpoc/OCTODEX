/**
 * The lists the rows of the property card open (docs/specs/13-app-structure.md §3.3 «Объект», wave 4a-2): people of
 * the property, leads, jobs, estimates, invoices, visits, tasks, notes, files, history. One object — one card (rule 12).
 * The contents of the old tabs (docs/specs/04 §7.3, C2b) moved here unchanged.
 */
import { visitWhen } from "@/features/schedule";
import { useState } from "react";
import { Linking } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import type { Property } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { propertyRecords, type PropertyRow } from "@/features/propertyRows";
import { invoiceChip } from "@/features/ContractStatement";
import { estView } from "@/features/boards";
import { jobStatusView } from "@/features/jobs";
import { leadStatusView } from "@/features/leads";
import { NotesBlock } from "@/features/NotesBlock";
import { TasksBlock } from "@/features/lead/LeadParts";
import { PropertyPeopleSheet } from "@/features/client/PropertySheets";
import { Button, IconButton, StatusChip } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { CardList, Empty, ItemCard } from "@/ui/surfaces";
import { memberName } from "@/features/team";

/** the row's name: shared with the client card where the word is the same */
export function propertyRowLabel(row: PropertyRow): DictKey {
  if (row === "people") return "prop.people";
  if (row === "invoices") return "client.invoices";
  if (row === "visits") return "prop.row.visits";
  return `client.row.${row}` as DictKey;
}

export function PropertySection({ p, s }: { p: Property; s: PropertyRow }) {
  const { db, role } = useStore();
  const { t, money, day, time } = useI18n();
  const office = role !== "tech";
  const r = propertyRecords(db, p, role);
  const [people, setPeople] = useState(false);

  switch (s) {
    case "people":
      return (
        <>
          {office ? <Button label={t("prop.people")} icon="users" variant="secondary" onPress={() => setPeople(true)} /> : null}
          {r.people.length ? (
            <CardList>
              {r.people.map((x) => {
                const ph = x.phones.find((y) => y.primary) ?? x.phones[0];
                const tel = (ph?.number ?? "").replace(/[^\d+]/g, "");
                return (
                  <ItemCard
                    key={x.id}
                    title={x.name || "—"}
                    subtitle={[t(`person.role.${x.role}` as DictKey), ph?.number].filter(Boolean).join(" · ")}
                    left={<Icon name="user" />}
                    right={tel ? <IconButton icon="phone" label={`${t("client.call")}: ${x.name}`} onPress={() => Linking.openURL(`tel:${tel}`)} /> : undefined}
                  />
                );
              })}
            </CardList>
          ) : (
            <Empty icon="users" title={t("prop.noPeople")} hint={office ? t("prop.peopleHint") : undefined} />
          )}
          <PropertyPeopleSheet value={people ? p : null} onClose={() => setPeople(false)} />
        </>
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

    case "jobs":
      return r.jobs.length === 0 ? (
        <Empty icon="wrench" title={t("client.empty.jobs")} />
      ) : (
        <CardList>
          {r.jobs.map((j) => {
            const v = jobStatusView[j.status];
            return (
              <ItemCard
                key={j.id}
                title={[j.number, j.title].filter(Boolean).join(" · ")}
                subtitle={office ? money(j.amountCents) : undefined}
                left={<Icon name="wrench" />}
                right={<StatusChip status={v.status} label={t(v.label)} />}
                onPress={() => router.push(`/job/${j.id}`)}
              />
            );
          })}
        </CardList>
      );

    case "estimates":
      return r.estimates.length === 0 ? (
        <Empty icon="invoice" title={t("client.empty.estimates")} />
      ) : (
        <CardList>
          {r.estimates.map((e) => (
            <ItemCard
              key={e.id}
              title={[e.number, e.title].filter(Boolean).join(" · ")}
              subtitle={office ? money(e.totalCents) : undefined}
              left={<Icon name="invoice" />}
              right={<StatusChip status={estView[e.status].s} label={t(estView[e.status].l)} />}
              onPress={() => router.push(`/estimate/${e.id}`)}
            />
          ))}
        </CardList>
      );

    case "invoices":
      return r.invoices.length === 0 ? (
        <Empty icon="wallet" title={t("client.empty.invoices")} />
      ) : (
        <CardList>
          {r.invoices.map((i) => {
            const ch = invoiceChip(i);
            return (
              <ItemCard
                key={i.id}
                title={i.number ?? t("inv.title")}
                subtitle={money(i.totalCents)}
                left={<Icon name="wallet" />}
                status={ch.s === "bad" ? "bad" : undefined}
                right={<StatusChip status={ch.s} label={t(ch.l)} />}
                onPress={() => router.push(`/invoice/${i.id}`)}
              />
            );
          })}
        </CardList>
      );

    case "visits":
      return r.visits.length === 0 ? (
        <Empty icon="calendar" title={t("prop.noVisits")} />
      ) : (
        <CardList>
          {r.visits.map((v) => (
            <ItemCard
              key={v.id}
              title={`${day(v.start)} · ${visitWhen(v, time, t("plan5.allDay"), false)}`}
              subtitle={[v.jobId ? db.jobs.find((j) => j.id === v.jobId)?.title : t("prop.h.visit"), memberName(db, v.techId, t)].filter(Boolean).join(" · ")}
              left={<Icon name="calendar" />}
              onPress={() => router.push(`/visit/${v.id}`)}
            />
          ))}
        </CardList>
      );

    case "tasks":
      return <TasksBlock subjectType="property" subjectId={p.id} />;

    case "notes":
      return <NotesBlock subjectType="property" subjectId={p.id} />;

    case "files":
      return r.photos.length ? (
        <CardList>
          {r.photos.map(({ visit, photo }) => (
            <ItemCard
              key={photo.id}
              title={photo.kind === "after" ? t("prop.photoAfter") : t("prop.photoBefore")}
              subtitle={`${day(visit.start)} · ${visitWhen(visit, time, t("plan5.allDay"), false)}`}
              left={<Icon name="image" />}
              onPress={() => router.push(`/visit/${visit.id}`)}
            />
          ))}
        </CardList>
      ) : (
        <Empty icon="image" title={t("prop.noFiles")} />
      );

    case "history":
      return r.history.length ? (
        <CardList>
          {r.history.map((h) =>
            h.kind === "visit" ? (
              <ItemCard
                key={`v${h.visit.id}`}
                title={`${day(h.at)} · ${time(h.at)}`}
                subtitle={[t("prop.h.visit"), memberName(db, h.visit.techId, t)].filter(Boolean).join(" · ")}
                left={<Icon name="calendar" />}
                onPress={() => router.push(`/visit/${h.visit.id}`)}
              />
            ) : h.kind === "estimate" ? (
              <ItemCard
                key={`e${h.estimate.id}`}
                title={[h.estimate.number, h.estimate.title].filter(Boolean).join(" · ")}
                subtitle={`${t("prop.h.estimate")} · ${day(h.at)}`}
                left={<Icon name="invoice" />}
                right={<StatusChip status={estView[h.estimate.status].s} label={t(estView[h.estimate.status].l)} />}
                onPress={() => router.push(`/estimate/${h.estimate.id}`)}
              />
            ) : (
              <ItemCard key={`n${h.note.id}`} title={h.note.body} subtitle={`${t("prop.h.note")} · ${day(h.at)}`} left={<Icon name="note" />} />
            ),
          )}
        </CardList>
      ) : (
        <Empty icon="clock" title={t("prop.noHistory")} />
      );
  }
}

/** a counter on the right of a row (no colour: a number is not a status) */
export const RowCount = ({ n }: { n: number }) => (
  <T v="body" tone="mut" tabular>
    {String(n)}
  </T>
);
