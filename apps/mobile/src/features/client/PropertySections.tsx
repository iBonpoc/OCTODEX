/**
 * The lists the rows of the property card open (docs/specs/13-app-structure.md §3.3 «Объект», wave 4a-2): people of
 * the property, leads, jobs, estimates, invoices, visits, tasks, notes, files, history. One object — one card (rule 12).
 * The contents of the old tabs (docs/specs/04 §7.3, C2b) moved here unchanged.
 */
import { visitWhen } from "@/features/schedule";
import { useState } from "react";
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
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Empty } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";
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
            <CardGrid>
              {r.people.map((x) => {
                const ph = x.phones.find((y) => y.primary) ?? x.phones[0];
                return (
                  // a person of the property: role and phone under the name, the call button stays (not a compact card)
                  <ListCard
                    key={x.id}
                    density="regular"
                    testID={`property-person-${x.id}`}
                    lead={{ kind: "icon", icon: "user" }}
                    title={x.name || "—"}
                    when={t(`person.role.${x.role}` as DictKey)}
                    facts={{ phone: ph?.number }}
                    contact={{ phone: ph?.number }}
                  />
                );
              })}
            </CardGrid>
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
        <CardGrid>
          {r.leads.map((l) => {
            const v = leadStatusView[l.status];
            return (
              <ListCard
                key={l.id}
                density="compact"
                testID={`property-lead-${l.id}`}
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

    case "jobs":
      return r.jobs.length === 0 ? (
        <Empty icon="wrench" title={t("client.empty.jobs")} />
      ) : (
        <CardGrid>
          {r.jobs.map((j) => {
            const v = jobStatusView[j.status];
            return (
              <ListCard
                key={j.id}
                density="compact"
                testID={`property-job-${j.id}`}
                lead={{ kind: "icon", icon: "wrench" }}
                title={j.title || j.number || ""}
                when={j.title ? j.number : undefined}
                value={office ? money(j.amountCents) : undefined}
                status={{ tone: v.status, label: t(v.label) }}
                onPress={() => router.push(`/job/${j.id}`)}
              />
            );
          })}
        </CardGrid>
      );

    case "estimates":
      return r.estimates.length === 0 ? (
        <Empty icon="invoice" title={t("client.empty.estimates")} />
      ) : (
        <CardGrid>
          {r.estimates.map((e) => (
            <ListCard
              key={e.id}
              density="compact"
              testID={`property-estimate-${e.id}`}
              lead={{ kind: "icon", icon: "invoice" }}
              title={e.title || e.number || ""}
              when={e.title ? e.number : undefined}
              value={office ? money(e.totalCents) : undefined}
              status={{ tone: estView[e.status].s, label: t(estView[e.status].l) }}
              onPress={() => router.push(`/estimate/${e.id}`)}
            />
          ))}
        </CardGrid>
      );

    case "invoices":
      return r.invoices.length === 0 ? (
        <Empty icon="wallet" title={t("client.empty.invoices")} />
      ) : (
        <CardGrid>
          {r.invoices.map((i) => {
            const ch = invoiceChip(i);
            return (
              <ListCard
                key={i.id}
                density="compact"
                testID={`property-invoice-${i.id}`}
                lead={{ kind: "icon", icon: "wallet" }}
                title={i.title || i.number || t("inv.title")}
                when={i.title ? i.number : undefined}
                value={money(i.totalCents)}
                status={{ tone: ch.s, label: t(ch.l) }}
                onPress={() => router.push(`/invoice/${i.id}`)}
              />
            );
          })}
        </CardGrid>
      );

    case "visits":
      return r.visits.length === 0 ? (
        <Empty icon="calendar" title={t("prop.noVisits")} />
      ) : (
        <CardGrid>
          {r.visits.map((v) => (
            <ListCard
              key={v.id}
              density="compact"
              testID={`property-visit-${v.id}`}
              lead={{ kind: "icon", icon: "calendar" }}
              title={(v.jobId ? db.jobs.find((j) => j.id === v.jobId)?.title : undefined) ?? t("prop.h.visit")}
              when={[day(v.start), visitWhen(v, time, t("plan5.allDay"), false), memberName(db, v.techId, t)].filter(Boolean).join(" · ")}
              onPress={() => router.push(`/visit/${v.id}`)}
            />
          ))}
        </CardGrid>
      );

    case "tasks":
      return <TasksBlock subjectType="property" subjectId={p.id} />;

    case "notes":
      return <NotesBlock subjectType="property" subjectId={p.id} />;

    case "files":
      return r.photos.length ? (
        <CardGrid>
          {r.photos.map(({ visit, photo }) => (
            <ListCard
              key={photo.id}
              density="compact"
              lead={{ kind: "icon", icon: "image" }}
              title={photo.kind === "after" ? t("prop.photoAfter") : t("prop.photoBefore")}
              when={`${day(visit.start)} · ${visitWhen(visit, time, t("plan5.allDay"), false)}`}
              onPress={() => router.push(`/visit/${visit.id}`)}
            />
          ))}
        </CardGrid>
      ) : (
        <Empty icon="image" title={t("prop.noFiles")} />
      );

    case "history":
      return r.history.length ? (
        <CardGrid>
          {r.history.map((h) =>
            h.kind === "visit" ? (
              <ListCard
                key={`v${h.visit.id}`}
                density="compact"
                lead={{ kind: "icon", icon: "calendar" }}
                title={t("prop.h.visit")}
                when={[day(h.at), time(h.at), memberName(db, h.visit.techId, t)].filter(Boolean).join(" · ")}
                onPress={() => router.push(`/visit/${h.visit.id}`)}
              />
            ) : h.kind === "estimate" ? (
              <ListCard
                key={`e${h.estimate.id}`}
                density="compact"
                lead={{ kind: "icon", icon: "invoice" }}
                title={h.estimate.title || h.estimate.number || t("prop.h.estimate")}
                when={[t("prop.h.estimate"), h.estimate.title ? h.estimate.number : null, day(h.at)].filter(Boolean).join(" · ")}
                status={{ tone: estView[h.estimate.status].s, label: t(estView[h.estimate.status].l) }}
                onPress={() => router.push(`/estimate/${h.estimate.id}`)}
              />
            ) : (
              <ListCard key={`n${h.note.id}`} density="compact" lead={{ kind: "icon", icon: "note" }} title={h.note.body} when={`${t("prop.h.note")} · ${day(h.at)}`} />
            ),
          )}
        </CardGrid>
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
