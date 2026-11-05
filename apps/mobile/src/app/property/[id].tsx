/**
 * Property card (wave C2, docs/specs/04 §7.3): lives only inside its client ("‹ Client").
 * Address, label and kind with route; "now at this property" (open estimates and jobs, next visit); access notes and
 * the gate code (a tech sees it only on the visit day and the day before); people of the property.
 */
import { useState } from "react";
import { Linking } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import type { Property } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { canSeeGateCode, propertyMapQuery, propertyNow, propertyPeople, propertyTitle } from "@/features/properties";
import { AccessSheet, PropertyPeopleSheet, PropertySheet } from "@/features/client/PropertySheets";
import { jobStatusView } from "@/features/jobs";
import { Button, IconButton, StatusChip } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Card, CardList, Empty, ItemCard, RowView, Screen, SectionTitle } from "@/ui/surfaces";

export default function PropertyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db, role } = store;
  const { t, money, day, time } = useI18n();
  const [sheet, setSheet] = useState<"edit" | "access" | "people" | null>(null);
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

  return (
    <Screen title={propertyTitle(p)} back={back} subtitle={c?.name}>
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
        </RowView>
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

      <PropertySheet value={sheet === "edit" ? p : null} onClose={() => setSheet(null)} />
      <AccessSheet value={sheet === "access" ? p : null} onClose={() => setSheet(null)} />
      <PropertyPeopleSheet value={sheet === "people" ? (p as Property) : null} onClose={() => setSheet(null)} />
    </Screen>
  );
}
