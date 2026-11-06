import { useRef, useState } from "react";
import { isOpenVisit } from "@/features/schedule";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { component, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { peopleOf } from "@/data/people";
import { canServe, canSeeClientMoney, statusChoices, clientMoneyOf, clientStatusChip, noLateCallsNow, statusOf, tagLabel, tagsOf, visibleClients } from "@/features/clients";
import { clientCounts, clientRecords, clientRowsFor, isClientSection, type ClientRow } from "@/features/clientRows";
import { billingLine } from "@/features/clientForm";
import { ClientSection, PersonRows } from "@/features/client/ClientSections";
import { StatusSheet, TagsSheet } from "@/features/client/ClientSheets";
import { propertyTitle } from "@/features/properties";
import { sourceName } from "@/features/leads";
import type { CustomerStatus } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { Button, IconButton, StatusChip, TagChip } from "@/ui/controls";
import { Icon, Press, T, type IconKey } from "@/ui/primitives";
import { Menu, useToast } from "@/ui/overlays";
import { Card, CardList, Empty, ItemCard, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { cleanPhone, mailtoHref, smsHref } from "@/features/contactLinks";

const ROW_ICON: Record<ClientRow, IconKey> = {
  properties: "pin",
  billing: "invoice",
  people: "users",
  jobs: "wrench",
  leads: "inbox",
  estimates: "invoice",
  invoices: "wallet",
  tasks: "check",
  notes: "note",
  files: "camera",
  history: "clock",
};

/**
 * Client card (docs/specs/13-app-structure.md §3.3, wave 4). Header: name; one line "CLT-0001 · status · tags";
 * call / SMS / email / route; money (office). Below — not tabs but rows with counters, each opens its own list
 * (`/client/<id>?s=jobs`): properties, billing address, people, jobs, leads, estimates, invoices, tasks, notes, files, history.
 */
export default function ClientScreen() {
  const { id, s } = useLocalSearchParams<{ id: string; s?: string }>();
  const store = useStore();
  const { db, role } = store;
  const { t, money, moneyWhole, day } = useI18n();
  const toast = useToast();
  const [sheet, setSheet] = useState<null | "tags" | "status">(null);
  const [menu, setMenu] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const statusRef = useRef<React.ComponentRef<typeof View>>(null);
  const c = visibleClients(db, role).find((x) => x.id === id);
  const toCard = () => router.replace(`/client/${id}`);
  const back = () => (router.canGoBack() ? router.back() : s ? toCard() : router.replace("/clients"));
  if (!c)
    return (
      <Screen title={t("clients.title")} back={back}>
        <Empty icon="user" title={t("clients.empty")} />
      </Screen>
    );
  const rows = clientRowsFor(role);
  // a row's own list: the same address with ?s=<row>
  if (isClientSection(s) && rows.includes(s))
    return (
      <Screen title={t(`client.row.${s}` as DictKey)} subtitle={c.name} back={back} fab={canServe(db, c.id) ? "client" : undefined} fabCtx={{ customerId: c.id }}>
        <ClientSection c={c} s={s} />
      </Screen>
    );

  const office = role !== "tech";
  const status = statusOf(c);
  const chip = clientStatusChip[status];
  const tags = tagsOf(db, c);
  const [main] = peopleOf(c);
  const r = clientRecords(db, c, role);
  const counts = clientCounts(r);
  const props = r.properties;
  const openTasks = r.tasks.filter((x) => !x.doneAt);
  const m = clientMoneyOf(db, c.id);
  const tel = cleanPhone(c.phone);
  const mail = mailtoHref(c.email);
  const lateCalls = noLateCallsNow(db, c);
  const nextVisit = db.visits
    .filter((v) => r.jobs.some((j) => j.id === v.jobId) && isOpenVisit(v) && new Date(v.start).getTime() >= Date.now() - 86_400_000)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const open = (row: ClientRow) => (row === "billing" ? router.push(`/client/edit?id=${c.id}`) : router.push(`/client/${c.id}?s=${row}`));
  const subtitleOf = (row: ClientRow): string | undefined => {
    if (row === "billing") return c.billing ? billingLine(c.billing) : props[0] ? `${t("client.row.billingSame")} · ${propertyTitle(props[0])}` : t("client.row.billingSame");
    if (row === "properties") return props.map(propertyTitle).join(" · ") || undefined;
    if (row === "people") return r.people.map((p) => p.name || c.name).join(" · ");
    return undefined;
  };

  const openStatusMenu = () =>
    statusRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setMenu({ x, y, w, h }));
  const chooseStatus = (st: CustomerStatus) => {
    if (st === status) return;
    if (st === "do_not_service") return setSheet("status"); // needs a reason
    toast.show(t("client.statusSaved"), store.setCustomerStatus(c.id, st));
  };
  // the mark is the director's and the office's (04 §12.8): sales see no «Не обслуживаем» and cannot lift it
  const statusOptions = statusChoices(status, role);

  return (
    <Screen
      title={c.name}
      back={back}
      // «do not service»: no «＋» (nothing new for the client, docs/specs/04 §12; the server refuses too)
      fab={canServe(db, c.id) ? "client" : undefined}
      fabCtx={{ customerId: c.id }}
      right={office ? <Button label={t("ue.edit")} icon="pencil" variant="ghost" size="sm" onPress={() => router.push(`/client/edit?id=${c.id}`)} /> : undefined}
    >
      {/* one line: number · status · tags */}
      <RowView style={{ flexWrap: "wrap", marginTop: -space[2] }}>
        {c.number ? (
          <T v="caption" tone="mut" tabular>
            {c.number}
          </T>
        ) : null}
        {office && statusOptions.length ? (
          <View ref={statusRef} collapsable={false}>
            <Press onPress={openStatusMenu} visibleHeight={component.button.sm} accessibilityRole="button" accessibilityLabel={`${t("client.statusTitle")}: ${t(chip.l)}`}>
              <StatusChip status={chip.s} label={t(chip.l)} />
            </Press>
          </View>
        ) : (
          <StatusChip status={chip.s} label={t(chip.l)} />
        )}
        {c.taxExempt ? <StatusChip status="neutral" label={t("client.f.taxExempt")} soft /> : null}
        {tags.map((x) => (
          <TagChip key={x.id} label={tagLabel(x, t)} onPress={office ? () => setSheet("tags") : undefined} />
        ))}
        {office ? <TagChip label={tags.length ? "+" : t("client.addTag")} onPress={() => setSheet("tags")} /> : null}
      </RowView>
      {office && c.sourceId ? (
        <T v="caption" tone="mut">
          {t("client.cameFrom", { source: sourceName(db, c.sourceId) })}
        </T>
      ) : null}
      {status === "do_not_service" ? (
        <T v="caption" tone="mut">
          {[c.statusReason ? t("client.reason", { r: c.statusReason }) : null, t("client.noServiceHint")].filter(Boolean).join(" · ")}
        </T>
      ) : null}

      <RowView>
        {tel ? <IconButton icon="phone" label={t("client.call")} onPress={() => Linking.openURL(`tel:${tel}`)} /> : null}
        {tel ? <IconButton icon="sms" label={t("visit.message")} onPress={() => Linking.openURL(smsHref(tel) ?? "").catch(() => {})} /> : null}
        {mail ? <IconButton icon="mail" label={t("client.email")} onPress={() => Linking.openURL(mail).catch(() => {})} /> : null}
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
        // money only, three equal tiles on one line — unslop 05.11
        <Card>
          <RowView style={{ alignItems: "flex-start" }}>
            <MoneyCell label={t("client.owes")} value={moneyWhole(m.owesCents)} tone={m.owesCents > 0 ? "warn" : "ink"} />
            <MoneyCell label={t("client.paidTotal")} value={moneyWhole(m.paidTotalCents)} />
            <MoneyCell label={t("client.invoiced")} value={moneyWhole(m.invoicedCents)} />
          </RowView>
        </Card>
      ) : null}

      {/* the main person's phones and emails at hand; everyone else — row «People» */}
      {main && (main.phones.length || main.emails.length) ? (
        <>
          <SectionTitle title={t("client.contacts")} />
          <Card>
            <PersonRows p={main} />
          </Card>
        </>
      ) : null}

      {nextVisit || openTasks.length || (canSeeClientMoney(role) && m.owesCents > 0) ? (
        <>
          <SectionTitle title={t("client.next")} />
          <CardList>
            {nextVisit ? (
              <ItemCard
                title={t("client.nextVisit")}
                subtitle={[day(nextVisit.start), r.jobs.find((j) => j.id === nextVisit.jobId)?.title].filter(Boolean).join(" · ")}
                left={<Icon name="route" />}
                onPress={() => router.push(`/visit/${nextVisit.id}`)}
              />
            ) : null}
            {openTasks.length ? <ItemCard title={t("client.openTasks", { n: openTasks.length })} subtitle={openTasks[0]!.title} left={<Icon name="check" />} onPress={() => open("tasks")} /> : null}
            {canSeeClientMoney(role) && m.owesCents > 0 ? (
              <ItemCard title={t("client.unpaid", { amount: money(m.owesCents) })} left={<Icon name="invoice" />} status="warn" onPress={() => open("invoices")} />
            ) : null}
          </CardList>
        </>
      ) : null}

      {/* rows with counters (13 §3.3): details of this one client, each opens its own list */}
      <View testID="client-rows">
      <Card>
        {rows.map((row) => {
          const n = counts[row];
          const title = t(`client.row.${row}` as DictKey);
          return (
            <ListRow
              key={row}
              title={title}
              subtitle={subtitleOf(row)}
              left={<Icon name={ROW_ICON[row]} />}
              right={
                n !== undefined ? (
                  <T v="body" tone="mut" tabular>
                    {String(n)}
                  </T>
                ) : undefined
              }
              onPress={() => open(row)}
            />
          );
        })}
      </Card>
      </View>

      <Menu
        visible={!!menu}
        anchor={menu}
        title={t("client.statusTitle")}
        onClose={() => setMenu(null)}
        onSelect={chooseStatus}
        items={statusOptions.map((x) => ({ key: x, label: t(clientStatusChip[x].l), selected: x === status, destructive: x === "do_not_service" }))}
      />
      <TagsSheet visible={sheet === "tags"} customer={c} onClose={() => setSheet(null)} />
      <StatusSheet visible={sheet === "status"} customer={c} preset="do_not_service" onClose={() => setSheet(null)} />
    </Screen>
  );
}

function MoneyCell({ label, value, tone = "ink" }: { label: string; value: string; tone?: "ink" | "warn" }) {
  return (
    <View style={{ alignItems: "flex-start", flex: 1 }}>
      <T v="caption" tone="mut">
        {label}
      </T>
      <T v="heading" tabular tone={tone}>
        {value}
      </T>
    </View>
  );
}
