import { ModulePlaces } from "@/modules/ModulePlaces";
import { useRef, useState } from "react";
import { isOpenVisit } from "@/features/schedule";
import { Linking, View } from "react-native";
import { router, type Href } from "expo-router";
import { component, radius, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useStore } from "@/data/store";
import { peopleOf } from "@/data/people";
import { canServe, canSeeClientMoney, statusChoices, clientMoneyOf, clientStatusChip, noLateCallsNow, statusOf, tagLabel, tagsOf } from "@/features/clients";
import { clientRecords, clientTabsFor, clientWaiting, type ClientRow, type ClientTab } from "@/features/clientRows";
import { ClientSection, PersonRows } from "@/features/client/ClientSections";
import { AdvancesBlock } from "@/features/payments/AdvancesBlock";
import { CallSheet, type CallPreset } from "@/features/comms/CallSheet";
import { useDialThenAsk } from "@/features/comms/dial";
import { MessageSheet, type MessagePreset } from "@/features/comms/MessageSheet";
import { callPlaceForClient } from "@/features/comms/comms";
import { StatusSheet, TagsSheet } from "@/features/client/ClientSheets";
import { billingLine } from "@/features/clientForm";
import { propertyTitle } from "@/features/properties";
import { ClientDupCards } from "@/features/client/ClientDuplicates";
import { sourceName } from "@/features/leads";
import type { Customer, CustomerStatus } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { fabItems } from "@/nav/sections";
import { Button, StatusChip, TagChip } from "@/ui/controls";
import { Icon, Press, T, type IconKey } from "@/ui/primitives";
import { Menu, Sheet, useToast } from "@/ui/overlays";
import { ViewTabs } from "@/ui/viewTabs";
import { Card, CardList, ListRow, RowView, SectionTitle } from "@/ui/surfaces";
import { cleanPhone, mailtoHref } from "@/features/contactLinks";

/** a tab's words (DS §9 А1п, #1343): the client's sections, the same row for every client of a role */
const TAB_LABEL: Record<ClientTab, DictKey> = {
  overview: "client.tab.overview",
  estimates: "cl6.tab.estimates",
  invoices: "cl6.tab.invoices",
  jobs: "cl6.tab.jobs",
  tasks: "client.tab.tasks",
  notes: "cl6.tab.notes",
  files: "client.tab.files",
  history: "client.tab.history",
};

/**
 * The client card's body (docs/specs/13-app-structure.md §3.3): one line «number · status · tags», call / SMS / email /
 * route, money (only to whom `canSeeClientMoney` allows), contacts, «next», rows with counters, the sheets.
 * The same body on the client's own screen (`/client/<id>`) and in the panel beside the list on 1280
 * (`/clients?open=<id>`, docs/specs/06-list-cards.md «Панель 1280») — so the panel never shows more than the screen.
 */
export function ClientCardBody({ c, tab: tabNow, onTab }: { c: Customer; tab?: ClientTab; onTab?: (t: ClientTab) => void }) {
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
  /** «Написать»: SMS or email — a small sheet when the client has both (prototype v6) */
  const [writeAsk, setWriteAsk] = useState(false);
  const tabs = clientTabsFor(role);
  const [tabOwn, setTabOwn] = useState<ClientTab>("overview");
  const tab = tabNow && tabs.includes(tabNow) ? tabNow : tabOwn;
  const pickTab = (k: ClientTab) => {
    setTabOwn(k);
    onTab?.(k);
  };
  const statusRef = useRef<React.ComponentRef<typeof View>>(null);
  const office = role !== "tech";
  const status = statusOf(c);
  const chip = clientStatusChip[status];
  const tags = tagsOf(db, c);
  /** the same rules as the «＋» of this card: the role, the tie to the client */
  const fab = fabItems("client", role, { customerId: c.id });
  const estimateItem = fab.find((i) => i.id === "estimate");
  /** «Работа без сметы» (warranty, small repair): what the card's «＋» used to offer — now «＋» on the «Работы» tab (#1343) */
  const jobItem = fab.find((i) => i.id === "job");
  const [main] = peopleOf(c);
  const r = clientRecords(db, c, role, store.mode);
  const waiting = clientWaiting(r);
  const props = r.properties;
  const openTasks = r.tasks.filter((x) => !x.doneAt);
  const m = clientMoneyOf(db, c.id);
  const tel = cleanPhone(c.phone);
  const mail = mailtoHref(c.email);
  const lateCalls = noLateCallsNow(db, c);
  const nextVisit = db.visits
    .filter((v) => r.jobs.some((j) => j.id === v.jobId) && isOpenVisit(v) && new Date(v.start).getTime() >= Date.now() - 86_400_000)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const open = (row: ClientRow) => router.push(`/client/${c.id}?s=${row}`);

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

      {/* Позвонить · Написать · Маршрут (prototype v6, #1343): a word under each, nothing to do — no tile */}
      <View testID="client-actions" style={{ flexDirection: "row", gap: space[2] }}>
        {tel ? (
          <ActionTile
            testID="client-call"
            icon="phone"
            label={t("client.call")}
            // the outcome sheet opens after the call, not under the system dialer (spec 20 §3, founder 07.11)
            onPress={() => dial(tel, () => setCalling({ ...(callPlaceForClient(db, role, c.id) ?? {}), customerId: c.id, contactId: main?.id }))}
          />
        ) : null}
        {main && (tel || mail) ? (
          <ActionTile
            testID="client-write"
            icon="sms"
            label={t("visit.message")}
            // both — ask how; one — straight to it (wave 6-3: a ready text in the client's language, the event is written)
            onPress={() => (tel && mail ? setWriteAsk(true) : tel ? setWriting({ owner: { type: "customer", id: c.id }, person: main }) : Linking.openURL(mail!).catch(() => {}))}
          />
        ) : null}
        {props[0] ? (
          <ActionTile
            testID="client-route"
            icon="navigate"
            label={t("client.route")}
            onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(`${props[0]!.address}, ${props[0]!.city}`)}`)}
          />
        ) : null}
      </View>
      {lateCalls ? <StatusChip status="warn" label={t("client.lateCalls")} /> : null}

      {/* #1094/#879: the card's main action — in one place, a verb: the estimate (the «＋» keeps the rest) */}
      {estimateItem && canServe(db, c.id) ? (
        <Button testID="client-make-estimate" label={t("path.estimateNew")} icon="invoice" full onPress={() => router.push(estimateItem.href as Href)} />
      ) : null}

      {/* add-on modules' place (spec 33 П24 А3): nothing unless a module is switched on */}
      <ModulePlaces place="client" ctx={{ customerId: c.id, leadIds: db.leads.filter((l) => l.customerId === c.id).map((l) => l.id) }} />

      {canSeeClientMoney(role) ? (
        // money only, three equal tiles on one line — unslop 05.11
        <Card>
          <RowView style={{ alignItems: "flex-start" }}>
            <MoneyCell testID="client-owes" label={t("client.owes")} value={moneyWhole(m.owesCents)} tone={m.owesCents > 0 ? "warn" : "ink"} />
            <MoneyCell testID="client-paid" label={t("client.paidTotal")} value={moneyWhole(m.paidTotalCents)} />
            <MoneyCell testID="client-invoiced" label={t("client.invoiced")} value={moneyWhole(m.invoicedCents)} />
          </RowView>
        </Card>
      ) : null}
      {/* spec 35 §4г («Деньги и отчёты»): the client's money without an invoice — apply or refund it on its receipt */}
      {canSeeClientMoney(role) ? <AdvancesBlock customerId={c.id} /> : null}

      {/* the client's sections as view tabs (DS §9 А1п, #1343): all always, the number — what waits for an action */}
      <ViewTabs
        testID="client-tabs"
        label={t("cl6.tabs")}
        value={tab}
        onChange={pickTab}
        items={tabs.map((k) => ({ key: k, label: t(TAB_LABEL[k]), count: waiting[k] }))}
      />
      <View testID={`client-tab-${tab}`} style={{ gap: space[3] }}>
        {tab === "overview" ? (
          <>
            {nextVisit || openTasks.length || (canSeeClientMoney(role) && m.owesCents > 0) ? (
              <>
                <SectionTitle title={t("cl6.waiting")} />
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
                      <ListRow title={t("client.openTasks", { n: openTasks.length })} subtitle={openTasks[0]!.title} left={<Icon name="check" />} onPress={() => pickTab("tasks")} />
                    </Card>
                  ) : null}
                  {canSeeClientMoney(role) && m.owesCents > 0 ? (
                    <Card status="warn" style={{ paddingVertical: space[1] }}>
                      <ListRow title={t("client.unpaid", { amount: money(m.owesCents) })} left={<Icon name="invoice" />} onPress={() => pickTab("invoices")} />
                    </Card>
                  ) : null}
                </CardList>
              </>
            ) : null}
            <SectionTitle title={t("client.row.properties")} />
            <ClientSection c={c} s="properties" />
            {office ? (
              // where the invoices go (office): the property's address until one is set; opens the client's form
              <View testID="client-billing">
                <Card style={{ paddingVertical: space[1] }}>
                  <ListRow
                    title={t("client.row.billing")}
                    subtitle={c.billing ? billingLine(c.billing) : props[0] ? `${t("client.row.billingSame")} · ${propertyTitle(props[0])}` : t("client.row.billingSame")}
                    left={<Icon name="invoice" />}
                    onPress={() => router.push(`/client/edit?id=${c.id}`)}
                  />
                </Card>
              </View>
            ) : null}
            {main && (main.phones.length || main.emails.length) ? (
              <>
                <SectionTitle title={t("client.contacts")} />
                <Card>
                  <PersonRows p={main} onCall={(x) => setCalling({ ...(callPlaceForClient(db, role, c.id) ?? {}), customerId: c.id, contactId: x.id })} />
                </Card>
              </>
            ) : null}
            {r.people.length > 1 || office ? (
              <View testID="client-people">
              <Card style={{ paddingVertical: space[1] }}>
                <ListRow title={t("client.row.people")} subtitle={r.people.map((p) => p.name || c.name).join(" · ")} left={<Icon name="users" />} onPress={() => open("people")} />
              </Card>
              </View>
            ) : null}
            {r.leads.length ? (
              <View testID="client-leads">
              <Card style={{ paddingVertical: space[1] }}>
                <ListRow title={t("client.row.leads")} right={<T v="body" tone="mut" tabular>{String(r.leads.length)}</T>} left={<Icon name="inbox" />} onPress={() => open("leads")} />
              </Card>
              </View>
            ) : null}
          </>
        ) : (
          <>
            {/* «＋ Новая …» on its own tab (prototype v6): the same rules as the card's main button — role, «do not service» */}
            {tab === "estimates" && estimateItem && canServe(db, c.id) && r.estimates.length ? (
              <View testID="client-new-estimate" style={{ alignSelf: "flex-start" }}>
                <Button label={t("path.estimateNew")} icon="plus" variant="secondary" size="sm" onPress={() => router.push(estimateItem.href as Href)} />
              </View>
            ) : null}
            {tab === "jobs" && jobItem && canServe(db, c.id) ? (
              <View testID="client-new-job" style={{ alignSelf: "flex-start" }}>
                <Button label={t("path.jobNew")} icon="plus" variant="secondary" size="sm" onPress={() => router.push(jobItem.href as Href)} />
              </View>
            ) : null}
            <ClientSection c={c} s={tab} />
          </>
        )}
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
      <Sheet visible={writeAsk} onClose={() => setWriteAsk(false)} title={t("cl6.writeTitle", { name: c.name })}>
        <View testID="client-write-sheet">
          <Card>
            <ListRow
              title={t("cl6.writeSms")}
              subtitle={c.phone}
              left={<Icon name="sms" />}
              onPress={() => {
                setWriteAsk(false);
                if (main) setWriting({ owner: { type: "customer", id: c.id }, person: main });
              }}
            />
            <ListRow
              title={t("client.email")}
              subtitle={c.email}
              left={<Icon name="mail" />}
              onPress={() => {
                setWriteAsk(false);
                if (mail) Linking.openURL(mail).catch(() => {});
              }}
            />
          </Card>
        </View>
      </Sheet>
    </>
  );
}


function MoneyCell({ label, value, tone = "ink", testID }: { label: string; value: string; tone?: "ink" | "warn"; testID?: string }) {
  return (
    <View testID={testID} style={{ alignItems: "flex-start", flex: 1 }}>
      <T v="caption" tone="mut">
        {label}
      </T>
      <T v="heading" tabular tone={tone}>
        {value}
      </T>
    </View>
  );
}

/** a quick action of the card: a round button with its word under it (prototype v6: Позвонить · Написать · Маршрут) */
function ActionTile({ icon, label, onPress, testID }: { icon: IconKey; label: string; onPress: () => void; testID: string }) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} containerStyle={{ flex: 1 }} style={{ alignItems: "center", gap: space[1], minHeight: size.hitMin }}>
      <View style={{ width: component.dockBtn, height: component.dockBtn, borderRadius: radius.pill, backgroundColor: c.surf2, borderWidth: 1, borderColor: c.bd, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} />
      </View>
      <T v="caption" tone="mut" center>
        {label}
      </T>
    </Press>
  );
}
