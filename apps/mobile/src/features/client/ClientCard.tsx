import { ModulePlaces } from "@/modules/ModulePlaces";
import { useRef, useState } from "react";
import { isOpenVisit } from "@/features/schedule";
import { Linking, View } from "react-native";
import { router } from "expo-router";
import { component, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { peopleOf } from "@/data/people";
import { canSeeClientMoney, statusChoices, clientMoneyOf, clientStatusChip, noLateCallsNow, statusOf, tagLabel, tagsOf } from "@/features/clients";
import { clientCounts, clientRecords, clientRowsFor, type ClientRow } from "@/features/clientRows";
import { billingLine } from "@/features/clientForm";
import { PersonRows } from "@/features/client/ClientSections";
import { AdvancesBlock } from "@/features/payments/AdvancesBlock";
import { CallSheet, type CallPreset } from "@/features/comms/CallSheet";
import { useDialThenAsk } from "@/features/comms/dial";
import { MessageSheet, type MessagePreset } from "@/features/comms/MessageSheet";
import { callPlaceForClient } from "@/features/comms/comms";
import { StatusSheet, TagsSheet } from "@/features/client/ClientSheets";
import { ClientDupCards } from "@/features/client/ClientDuplicates";
import { propertyTitle } from "@/features/properties";
import { sourceName } from "@/features/leads";
import type { Customer, CustomerStatus } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { IconButton, StatusChip, TagChip } from "@/ui/controls";
import { Icon, Press, T, type IconKey } from "@/ui/primitives";
import { Menu, useToast } from "@/ui/overlays";
import { Card, CardList, ListRow, RowView, SectionTitle } from "@/ui/surfaces";
import { cleanPhone, mailtoHref } from "@/features/contactLinks";

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
 * The client card's body (docs/specs/13-app-structure.md §3.3): one line «number · status · tags», call / SMS / email /
 * route, money (only to whom `canSeeClientMoney` allows), contacts, «next», rows with counters, the sheets.
 * The same body on the client's own screen (`/client/<id>`) and in the panel beside the list on 1280
 * (`/clients?open=<id>`, docs/specs/06-list-cards.md «Панель 1280») — so the panel never shows more than the screen.
 */
export function ClientCardBody({ c }: { c: Customer }) {
  const store = useStore();
  const { db, role } = store;
  const { t, money, moneyWhole, day } = useI18n();
  const toast = useToast();
  const [sheet, setSheet] = useState<null | "tags" | "status">(null);
  const [menu, setMenu] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  /** wave 6-2: after «Позвонить» — «Чем кончился?» (the call goes to the client; a technician — to his job) */
  const [calling, setCalling] = useState<CallPreset | null>(null);
  const dial = useDialThenAsk();
  const [writing, setWriting] = useState<MessagePreset | null>(null);
  const statusRef = useRef<React.ComponentRef<typeof View>>(null);
  const rows = clientRowsFor(role);
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
    <>
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
      {/* step 17 C3: other clients with the same phone / email / address — «Слить» or «Не дубль» (docs/specs/04 §13) */}
      <ClientDupCards c={c} />

      <RowView>
        {tel ? (
          <IconButton
            icon="phone"
            label={t("client.call")}
            // the outcome sheet opens after the call, not under the system dialer (spec 20 §3, founder 07.11)
            onPress={() => dial(tel, () => setCalling({ ...(callPlaceForClient(db, role, c.id) ?? {}), customerId: c.id, contactId: main?.id }))}
          />
        ) : null}
        {/* wave 6-3: «Новое сообщение» to the main person — a ready text in the client's language, the event is written */}
        {main ? <IconButton icon="sms" label={t("visit.message")} onPress={() => setWriting({ owner: { type: "customer", id: c.id }, person: main })} /> : null}
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

      {/* add-on modules' place (spec 33 П24 А3): nothing unless a module is switched on */}
      <ModulePlaces place="client" ctx={{ customerId: c.id }} />

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
      {/* spec 35 §4г («Деньги и отчёты»): the client's money without an invoice — apply or refund it on its receipt */}
      {canSeeClientMoney(role) ? <AdvancesBlock customerId={c.id} /> : null}

      {/* the main person's phones and emails at hand; everyone else — row «People» */}
      {main && (main.phones.length || main.emails.length) ? (
        <>
          <SectionTitle title={t("client.contacts")} />
          <Card>
            <PersonRows p={main} onCall={(x) => setCalling({ ...(callPlaceForClient(db, role, c.id) ?? {}), customerId: c.id, contactId: x.id })} />
          </Card>
        </>
      ) : null}

      {nextVisit || openTasks.length || (canSeeClientMoney(role) && m.owesCents > 0) ? (
        <>
          <SectionTitle title={t("client.next")} />
          <CardList>
            {/* single hints about this client, not lists of objects (06 «10а, остаток» п.6): Card + ListRow */}
            {nextVisit ? (
              <Card style={{ paddingVertical: space[1] }}>
                <ListRow
                  title={t("client.nextVisit")}
                  subtitle={[day(nextVisit.start), r.jobs.find((j) => j.id === nextVisit.jobId)?.title].filter(Boolean).join(" · ")}
                  left={<Icon name="route" />}
                  onPress={() => router.push(`/visit/${nextVisit.id}`)}
                />
              </Card>
            ) : null}
            {openTasks.length ? (
              <Card style={{ paddingVertical: space[1] }}>
                <ListRow title={t("client.openTasks", { n: openTasks.length })} subtitle={openTasks[0]!.title} left={<Icon name="check" />} onPress={() => open("tasks")} />
              </Card>
            ) : null}
            {canSeeClientMoney(role) && m.owesCents > 0 ? (
              <Card status="warn" style={{ paddingVertical: space[1] }}>
                <ListRow title={t("client.unpaid", { amount: money(m.owesCents) })} left={<Icon name="invoice" />} onPress={() => open("invoices")} />
              </Card>
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
      <CallSheet preset={calling} onClose={() => setCalling(null)} />
      <MessageSheet preset={writing} onClose={() => setWriting(null)} />
    </>
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
