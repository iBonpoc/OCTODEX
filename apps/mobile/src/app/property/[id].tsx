/**
 * Property card (wave C2, docs/specs/04 §7.3): lives only inside its client ("‹ Client").
 * Address, label and kind with route; "now at this property" (open estimates and jobs, next visit); access notes and
 * the gate code (a tech sees it only on the visit day and the day before); people of the property.
 * Tabs (C2b): overview · history · documents · files · tasks (with notes of the property).
 */
type Tab = "overview" | "history" | "documents" | "files" | "tasks";
const TABS: Tab[] = ["overview", "history", "documents", "files", "tasks"];
import { useState, type ReactNode } from "react";
import { Linking } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import type { Property } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { canSeeGateCode, propertyDocs, propertyMapQuery, propertyNow, propertyPeople, propertyPhotos, propertyTimeline, propertyTitle } from "@/features/properties";
import { usePersistentState } from "@/data/persist";
import { estView } from "@/features/boards";
import { invoiceChip } from "@/features/ContractStatement";
import { NotesBlock } from "@/features/NotesBlock";
import { TasksBlock } from "@/features/lead/LeadParts";
import { AccessSheet, PropertyPeopleSheet, PropertySheet } from "@/features/client/PropertySheets";
import { jobStatusView } from "@/features/jobs";
import { Button, IconButton, Segmented, StatusChip } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Card, CardList, Empty, ItemCard, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { useToast } from "@/ui/overlays";
import { VisitFormSheet } from "@/features/VisitForm";
import { SCHEDULE_DEFAULTS } from "@/features/schedule";
import { uid } from "@/features/estimateDoc";

export default function PropertyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db, role } = store;
  const { t, money, day, time } = useI18n();
  const [sheet, setSheet] = useState<"edit" | "access" | "people" | null>(null);
  const [inspect, setInspect] = useState(false);
  const toast = useToast();
  const [tab, setTab] = usePersistentState<Tab>("octo.propTab.v1", "overview", { validate: (v) => TABS.includes(v) });
  const p = db.properties.find((x) => x.id === id);
  const back = () => (router.canGoBack() ? router.back() : router.replace(p ? `/client/${p.customerId}` : "/clients"));
  if (!p)
    return (
      <Screen title={t("prop.card")} back={back}>
        <Empty icon="home2" title={t("client.empty.properties")} />
      </Screen>
    );
  const c = db.customers.find((x) => x.id === p.customerId);
  const office = role !== "tech";
  const now = propertyNow(db, p.id);
  const people = propertyPeople(db, p);
  const gateOk = canSeeGateCode(db, role, p.id);
  const route = () => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(propertyMapQuery(p))}`);
  const open = (k: typeof sheet) => setSheet(k);
  const pencil = (k: "edit" | "access" | "people", title: string) =>
    office ? <IconButton icon="pencil" label={`${t("common.edit")}: ${title}`} onPress={() => open(k)} /> : undefined;

  const timeline = propertyTimeline(db, p.id);
  const docs = propertyDocs(db, p.id);
  const photos = propertyPhotos(db, p.id);
  const tasks = db.tasks.filter((x) => x.subjectType === "property" && x.subjectId === p.id && !x.doneAt);
  const label = (k: Tab, n?: number) => (n ? `${t(`client.tab.${k}`)} · ${n}` : t(`client.tab.${k}`));

  const overview = (
    <>
      <Card>
        <RowView style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <RowView style={{ flex: 1, alignItems: "flex-start" }}>
            <Icon name="pin" />
            <T v="body" style={{ flex: 1 }}>
              {[propertyTitle(p), p.city].filter(Boolean).join("\n")}
            </T>
          </RowView>
          {pencil("edit", t("prop.card"))}
        </RowView>
        {p.label || p.kind ? (
          <RowView style={{ flexWrap: "wrap" }}>
            {p.label ? <StatusChip status="neutral" label={p.label} soft /> : null}
            {p.kind ? <StatusChip status="neutral" label={t(`prop.kind.${p.kind}` as DictKey)} soft /> : null}
          </RowView>
        ) : null}
        <RowView style={{ flexWrap: "wrap" }}>
          <Button label={t("jobs.route")} icon="route" variant="secondary" onPress={route} />
          {office ? <Button label={t("est.new")} icon="invoice" variant="ghost" onPress={() => router.push(`/estimate/new?customerId=${p.customerId}&propertyId=${p.id}`)} /> : null}
          {/* «+ Осмотр»: a returning client wants a new estimate (docs/specs/03 §5.1) — an inspection without a lead */}
          {office ? <Button label={t("vf.addInspection")} icon="plus" variant="ghost" onPress={() => setInspect(true)} /> : null}
        </RowView>
        {office ? (
          <VisitFormSheet
            visible={inspect}
            onClose={() => setInspect(false)}
            title={t("vf.addInspection")}
            saveLabel={t("lead.next.book")}
            init={{ durationMin: SCHEDULE_DEFAULTS.inspectionMin }}
            onSave={(v) => {
              const visitId = uid();
              const r = store.addInspection(p.id, { ...v, visitId });
              toast.show(t("vf.inspectionSaved", { date: day(v.start), time: time(v.start) }), r.undo);
              return visitId;
            }}
          />
        ) : null}
      </Card>

      <SectionTitle title={t("prop.now")} />
      {now.estimates.length || now.jobs.length || now.nextVisit ? (
        <CardList>
          {now.nextVisit ? (
            <ItemCard
              title={`${day(now.nextVisit.start)} · ${time(now.nextVisit.start)}`}
              subtitle={t("prop.nextVisit")}
              left={<Icon name="calendar" />}
              onPress={() => router.push(`/visit/${now.nextVisit!.id}`)}
            />
          ) : null}
          {now.jobs.map((j) => (
            <ItemCard
              key={j.id}
              title={j.title}
              status={jobStatusView[j.status].status}
              right={<StatusChip status={jobStatusView[j.status].status} label={t(jobStatusView[j.status].label)} />}
              left={<Icon name="wrench" />}
              onPress={() => router.push(`/job/${j.id}`)}
            />
          ))}
          {now.estimates.map((e) => (
            <ItemCard
              key={e.id}
              title={[e.number, e.title].filter(Boolean).join(" · ")}
              right={office ? <T v="body" tabular>{money(e.totalCents)}</T> : undefined}
              left={<Icon name="invoice" />}
              onPress={() => router.push(`/estimate/${e.id}`)}
            />
          ))}
        </CardList>
      ) : (
        <T v="caption" tone="mut">
          {t("prop.nothingNow")}
        </T>
      )}

      <SectionTitle title={t("prop.access")} right={pencil("access", t("prop.access"))} />
      <Card>
        <T v="body" tone={p.accessNotes ? undefined : "mut"}>
          {p.accessNotes || t("prop.noAccess")}
        </T>
        <RowView>
          <Icon name="home2" />
          {gateOk ? (
            <T v="body" w="semibold">
              {p.gateCode ? `${t("prop.gate")}: ${p.gateCode}` : t("prop.noGate")}
            </T>
          ) : (
            <T v="caption" tone="mut">
              {t("prop.gateHidden")}
            </T>
          )}
        </RowView>
      </Card>

      <SectionTitle title={t("prop.people")} right={pencil("people", t("prop.people"))} />
      {people.length ? (
        <CardList>
          {people.map((x) => {
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
        <T v="caption" tone="mut">
          {t("prop.noPeople")}
        </T>
      )}

    </>
  );

  const history = timeline.length ? (
    <CardList>
      {timeline.map((h) =>
        h.kind === "visit" ? (
          <ItemCard
            key={`v${h.visit.id}`}
            title={`${day(h.at)} · ${time(h.at)}`}
            subtitle={[t("prop.h.visit"), db.members.find((m) => m.id === h.visit.techId)?.name].filter(Boolean).join(" · ")}
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

  const documents =
    docs.estimates.length || (office && docs.invoices.length) ? (
      <CardList>
        {docs.estimates.map((e) => (
          <ItemCard
            key={e.id}
            title={[e.number, e.title].filter(Boolean).join(" · ")}
            subtitle={office ? money(e.totalCents) : undefined}
            left={<Icon name="invoice" />}
            right={<StatusChip status={estView[e.status].s} label={t(estView[e.status].l)} />}
            onPress={() => router.push(`/estimate/${e.id}`)}
          />
        ))}
        {office
          ? docs.invoices.map((i) => {
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
            })
          : null}
      </CardList>
    ) : (
      <Empty icon="invoice" title={t("prop.noDocs")} />
    );

  const files = photos.length ? (
    <CardList>
      {photos.map(({ visit, photo }) => (
        <ItemCard
          key={photo.id}
          title={photo.kind === "after" ? t("prop.photoAfter") : t("prop.photoBefore")}
          subtitle={`${day(visit.start)} · ${time(visit.start)}`}
          left={<Icon name="image" />}
          onPress={() => router.push(`/visit/${visit.id}`)}
        />
      ))}
    </CardList>
  ) : (
    <Empty icon="image" title={t("prop.noFiles")} />
  );

  const tasksTab = (
    <>
      <TasksBlock subjectType="property" subjectId={p.id} />
      <NotesBlock subjectType="property" subjectId={p.id} />
    </>
  );

  const body: Record<Tab, ReactNode> = { overview, history, documents, files, tasks: tasksTab };

  return (
    <Screen
      title={propertyTitle(p)}
      back={back}
      subtitle={c?.name}
      tabKey={tab}
      tabs={
        <Segmented
          scroll
          value={tab}
          onChange={setTab}
          items={[
            { key: "overview", label: label("overview") },
            { key: "history", label: label("history", timeline.length) },
            { key: "documents", label: label("documents", docs.estimates.length + (office ? docs.invoices.length : 0)) },
            { key: "files", label: label("files", photos.length) },
            { key: "tasks", label: label("tasks", tasks.length) },
          ]}
        />
      }
    >
      {body[tab]}

      <PropertySheet value={sheet === "edit" ? p : null} onClose={() => setSheet(null)} />
      <AccessSheet value={sheet === "access" ? p : null} onClose={() => setSheet(null)} />
      <PropertyPeopleSheet value={sheet === "people" ? (p as Property) : null} onClose={() => setSheet(null)} />
    </Screen>
  );
}
