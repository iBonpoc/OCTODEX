/**
 * Property card (docs/specs/13-app-structure.md §3.3 «Объект», wave 4a-2): lives only inside its client («‹ Client»).
 * Header: address, label and kind, route, the client, «＋ Смета» / «＋ Осмотр»; «now at this property»; access notes and
 * the gate code (a tech sees it only on the visit day and the day before). Below — rows with counters, each opens its
 * list at /property/<id>?s=<row>: people of the property, leads, jobs, estimates, invoices, visits, tasks, notes, files, history.
 */
import { scheduleSettingsOf } from "@/features/scheduleSettings";
import { useState } from "react";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { canSeeGateCode, propertyMapQuery, propertyNow, propertyTitle } from "@/features/properties";
import { isPropertyRow, propertyCounts, propertyRecords, propertyRowsFor, type PropertyRow } from "@/features/propertyRows";
import { PropertySection, propertyRowLabel, RowCount } from "@/features/client/PropertySections";
import { AccessSheet, PropertySheet } from "@/features/client/PropertySheets";
import { jobStatusView } from "@/features/jobs";
import { canServe } from "@/features/clients";
import { Button, IconButton, StatusChip } from "@/ui/controls";
import { Icon, T, type IconKey } from "@/ui/primitives";
import { Card, Empty, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";
import { estView } from "@/features/boards";
import { space } from "@octo/design-tokens";
import { useToast } from "@/ui/overlays";
import { VisitFormSheet } from "@/features/VisitForm";
import { ModulePlaces } from "@/modules/ModulePlaces";
import { uid } from "@/features/estimateDoc";

const ROW_ICON: Record<PropertyRow, IconKey> = {
  people: "users",
  leads: "inbox",
  jobs: "wrench",
  estimates: "invoice",
  invoices: "wallet",
  visits: "calendar",
  tasks: "check",
  notes: "note",
  files: "image",
  history: "clock",
};

export default function PropertyScreen() {
  const { id, s: sec } = useLocalSearchParams<{ id: string; s?: string }>();
  const store = useStore();
  const { db, role } = store;
  const { t, money, day, time } = useI18n();
  const [sheet, setSheet] = useState<"edit" | "access" | null>(null);
  const [inspect, setInspect] = useState(false);
  const toast = useToast();
  const p = db.properties.find((x) => x.id === id);
  const back = () => (router.canGoBack() ? router.back() : router.replace(p ? (sec ? `/property/${p.id}` : `/client/${p.customerId}`) : "/clients"));
  if (!p)
    return (
      <Screen title={t("prop.card")} back={back}>
        <Empty icon="home2" title={t("client.empty.properties")} />
      </Screen>
    );
  const c = db.customers.find((x) => x.id === p.customerId);
  const office = role !== "tech";
  // «не обслуживаем»: nothing new for this property — no «＋», no inspection (S4 / S5 / S17, Customer §5)
  const servable = canServe(db, p.customerId);
  const rows = propertyRowsFor(role);
  // a row's own list: the same address with ?s=<row>
  if (isPropertyRow(sec) && rows.includes(sec))
    return (
      <Screen title={t(propertyRowLabel(sec))} subtitle={propertyTitle(p)} back={back} fab={servable ? "client" : undefined} fabCtx={{ customerId: p.customerId, propertyId: p.id }}>
        <PropertySection p={p} s={sec} />
      </Screen>
    );
  const r = propertyRecords(db, p, role);
  const counts = propertyCounts(r);
  const now = propertyNow(db, p.id);
  const gateOk = canSeeGateCode(db, role, p.id);
  const route = () => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(propertyMapQuery(p))}`);
  const open = (k: typeof sheet) => setSheet(k);
  const pencil = (k: "edit" | "access", title: string) =>
    office ? <IconButton icon="pencil" label={`${t("common.edit")}: ${title}`} onPress={() => open(k)} /> : undefined;

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
          {c ? <Button label={`${c.name} ›`} icon="user" variant="ghost" onPress={() => router.push(`/client/${c.id}`)} /> : null}
          {/* «+ Осмотр»: a returning client wants a new estimate (docs/specs/03 §5.1) — an inspection without a lead */}
          {office && servable ? <Button label={t("vf.addInspection")} icon="plus" variant="ghost" onPress={() => setInspect(true)} /> : null}
        </RowView>
        {office && servable ? (
          <VisitFormSheet
            visible={inspect}
            onClose={() => setInspect(false)}
            title={t("vf.addInspection")}
            saveLabel={t("lead.next.book")}
            init={{ durationMin: scheduleSettingsOf(db.company).inspectionMin, propertyId: p.id }}
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
        <>
          {/* the next visit is one hint, not a list (06 «10а, остаток» п.6): Card + ListRow */}
          {now.nextVisit ? (
            <Card style={{ paddingVertical: space[1] }}>
              <ListRow
                title={`${day(now.nextVisit.start)} · ${time(now.nextVisit.start)}`}
                subtitle={t("prop.nextVisit")}
                left={<Icon name="calendar" />}
                onPress={() => router.push(`/visit/${now.nextVisit!.id}`)}
              />
            </Card>
          ) : null}
          {/* open jobs and estimates of the property: related objects → compact list cards */}
          {now.jobs.length || now.estimates.length ? (
            <CardGrid>
              {[
                ...now.jobs.map((j) => (
                  <ListCard
                    key={j.id}
                    density="compact"
                    testID={`property-now-job-${j.id}`}
                    lead={{ kind: "icon", icon: "wrench" }}
                    title={j.title || j.number || ""}
                    when={j.title ? j.number : undefined}
                    status={{ tone: jobStatusView[j.status].status, label: t(jobStatusView[j.status].label) }}
                    onPress={() => router.push(`/job/${j.id}`)}
                  />
                )),
                ...now.estimates.map((e) => (
                  <ListCard
                    key={e.id}
                    density="compact"
                    testID={`property-now-estimate-${e.id}`}
                    lead={{ kind: "icon", icon: "invoice" }}
                    title={e.title || e.number || ""}
                    when={e.title ? e.number : undefined}
                    value={office ? money(e.totalCents) : undefined}
                    status={{ tone: estView[e.status].s, label: t(estView[e.status].l) }}
                    onPress={() => router.push(`/estimate/${e.id}`)}
                  />
                )),
              ]}
            </CardGrid>
          ) : null}
        </>
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

      {/* add-on modules' place (docs/specs/33 П15): nothing unless a module is switched on */}
      <ModulePlaces place="property" ctx={{ customerId: p.customerId, propertyId: p.id }} />

      {/* rows with counters (13 §3.3): details of this one property, each opens its own list */}
      <View testID="property-rows">
        <Card>
          {rows.map((row) => {
            const n = counts[row];
            return (
              <ListRow
                key={row}
                title={t(propertyRowLabel(row))}
                left={<Icon name={ROW_ICON[row]} />}
                right={n !== undefined ? <RowCount n={n} /> : undefined}
                onPress={() => router.push(`/property/${p.id}?s=${row}`)}
              />
            );
          })}
        </Card>
      </View>
    </>
  );

  return (
    <Screen
      title={propertyTitle(p)}
      back={back}
      subtitle={c?.name}
      // «＋»: Новая работа and Смета for this client and this property (S17, S5); none for «не обслуживаем»
      fab={servable ? "client" : undefined}
      fabCtx={{ customerId: p.customerId, propertyId: p.id }}
    >
      {overview}

      <PropertySheet value={sheet === "edit" ? p : null} onClose={() => setSheet(null)} />
      <AccessSheet value={sheet === "access" ? p : null} onClose={() => setSheet(null)} />
    </Screen>
  );
}
