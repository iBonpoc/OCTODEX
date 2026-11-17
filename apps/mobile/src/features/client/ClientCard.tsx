import { ModulePlaces } from "@/modules/ModulePlaces";
import { useRef, useState, type ReactElement, type ReactNode } from "react";
import type { LayoutChangeEvent } from "react-native";
import { isOpenVisit } from "@/features/schedule";
import { Linking, View } from "react-native";
import { router, type Href } from "expo-router";
import { component, size, space } from "@octo/design-tokens";
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
import { PeopleSheet, StatusSheet, TagsSheet } from "@/features/client/ClientSheets";
import { billingLine } from "@/features/clientForm";
import { propertyTitle } from "@/features/properties";
import { ClientDupCards } from "@/features/client/ClientDuplicates";
import { ActionTile } from "@/features/ActionTile";
import { sourceName } from "@/features/leads";
import type { Customer, CustomerStatus, Property } from "@/data/types";
import { newProperty, PropertySheet } from "@/features/client/PropertySheets";
import { useI18n, type DictKey } from "@/i18n";
import { fabItems } from "@/nav/sections";
import { Button, IconButton, MetaTag, StatusChip } from "@/ui/controls";
import { Icon, Press, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { StatusPicker } from "@/ui/listCard";
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
/**
 * Where the card's parts stand (#1416): the client's own screen pins the tabs under a mini header (phone, tablet) or puts the
 * summary in a side column (desktop); the panel beside the list on 1280 keeps one column (no frame).
 */
export type ClientFrame = (parts: { summary: ReactNode; tabs: ReactNode; content: ReactNode; rest: ReactNode; mini: ReactNode }) => ReactElement;

export function ClientCardBody({ c, tab: tabNow, onTab, frame }: { c: Customer; tab?: ClientTab; onTab?: (t: ClientTab) => void; frame?: ClientFrame }) {
  const store = useStore();
  const { db, role } = store;
  const { t, money, moneyWhole, day } = useI18n();
  const toast = useToast();
  const [sheet, setSheet] = useState<null | "tags" | "status" | "people">(null);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState<Property | null>(null);
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

  // the status is chosen in the one StatusPicker (DS §9 А10, spec 56 wave 4), not in a menu at the chip
  const chooseStatus = (st: CustomerStatus) => {
    setPicking(false);
    if (st === status) return;
    if (st === "do_not_service") return setSheet("status"); // needs a reason: the page of that choice
    toast.show(t("client.statusSaved"), store.setCustomerStatus(c.id, st));
  };
  // the mark is the director's and the office's (04 §12.8): sales see no «Не обслуживаем» and cannot lift it
  const statusOptions = statusChoices(status, role);

  const summary = (
    <>
      {/* the summary (status, actions, «Создать смету», money): above the tabs on a phone and a tablet (as wide as they are), in the
          side column 360 on a desktop (DS §12.3, #1416) */}
      <View testID="client-summary" style={{ width: "100%", gap: space[3] }}>
        {/* one line, never wrapped (spec 56 §3а.6): number · status · tags, the tags that do not fit — «+N»; the tags open their sheet */}
        <OneLine
          testID="client-headline"
          fixed={[
            c.number ? (
              <T key="n" v="caption" tone="mut" tabular numberOfLines={1}>
                {c.number}
              </T>
            ) : null,
            office && statusOptions.length ? (
              <Press key="s" testID="client-status" onPress={() => setPicking(true)} visibleHeight={component.button.sm} accessibilityRole="button" accessibilityLabel={`${t("client.statusTitle")}: ${t(chip.l)}`}>
                <StatusChip status={chip.s} label={t(chip.l)} />
              </Press>
            ) : (
              <StatusChip key="s" status={chip.s} label={t(chip.l)} />
            ),
            c.taxExempt ? <StatusChip key="x" status="neutral" label={t("client.f.taxExempt")} soft /> : null,
          ]}
          tags={tags.map((x) => ({ id: x.id, label: tagLabel(x, t) }))}
          onTags={office ? () => setSheet("tags") : undefined}
          tagsLabel={t("cw4.tags", { list: tags.map((x) => tagLabel(x, t)).join(", ") })}
          addLabel={office ? `＋ ${t("client.addTag")}` : undefined}
          moreLabel={(n) => t("cw4.moreTags", { n })}
        />
        {/* «Контакты · N ›» (spec 56 §3а.6): the office edits them in the sheet at once; the technician reads the list */}
        {r.people.length > 1 || office ? (
          <View testID="client-people">
            <Card style={{ paddingVertical: space[1] }}>
              <ListRow
                title={t("client.row.people")}
                left={<Icon name="users" />}
                right={
                  <T v="body" tone="mut" tabular>
                    {String(r.people.length)}
                  </T>
                }
                onPress={() => (office ? setSheet("people") : open("people"))}
              />
            </Card>
          </View>
        ) : null}
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
              <MoneyCell testID="client-owes" label={t("cl6.money.owes")} value={moneyWhole(m.owesCents)} tone={m.owesCents > 0 ? "warn" : "ink"} />
              <MoneyCell testID="client-paid" label={t("cl6.money.paid")} value={moneyWhole(m.paidTotalCents)} />
              <MoneyCell testID="client-invoiced" label={t("cl6.money.invoiced")} value={moneyWhole(m.invoicedCents)} />
            </RowView>
          </Card>
        ) : null}
        {/* spec 35 §4г («Деньги и отчёты»): the client's money without an invoice — apply or refund it on its receipt */}
        {canSeeClientMoney(role) ? <AdvancesBlock customerId={c.id} /> : null}
      </View>

    </>
  );
  const tabsNode = (
    <>
      {/* the client's sections as view tabs (DS §9 А1п, #1343): all always, the number — what waits for an action */}
      <ViewTabs
        testID="client-tabs"
        label={t("cl6.tabs")}
        value={tab}
        onChange={pickTab}
        items={tabs.map((k) => ({ key: k, label: t(TAB_LABEL[k]), count: waiting[k] }))}
      />
    </>
  );
  const content = (
    <>
      <View testID={`client-tab-${tab}`} style={{ gap: space[3] }}>
        {tab === "overview" ? (
          <>
            {/* the next visit is what comes, not what waits for an action (#1416): its own line above «Ждёт действия» */}
            {nextVisit ? (
              <>
                <SectionTitle title={t("client.nextVisit")} />
                <View testID="client-next-visit">
                  <Card style={{ paddingVertical: space[1] }}>
                    <ListRow
                      title={day(nextVisit.start)}
                      subtitle={r.jobs.find((j) => j.id === nextVisit.jobId)?.title}
                      lines={2}
                      left={<Icon name="route" />}
                      onPress={() => router.push(`/visit/${nextVisit.id}`)}
                    />
                  </Card>
                </View>
              </>
            ) : null}
            {openTasks.length || (canSeeClientMoney(role) && m.owesCents > 0) ? (
              <>
                <SectionTitle title={t("cl6.waiting")} />
                <CardList>
                  {/* single hints about this client, not lists of objects (06 «10а, остаток» п.6): Card + ListRow */}
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
            {/* «Объекты» with «＋ Объект» on the right of the title (spec 56 §3а.6, DS §12.2), not a big button under it */}
            <SectionTitle
              title={t("client.row.properties")}
              right={
                office && props.length ? (
                  <Button testID="client-add-property" label={t("cw4.addProperty")} accessibilityLabel={t("prop.new")} icon="plus" variant="secondary" size="sm" onPress={() => setAdding(newProperty(c.id))} />
                ) : undefined
              }
            />
            <ClientSection c={c} s="properties" noAdd />
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
                <Button label={t("est.new")} icon="plus" variant="secondary" size="sm" onPress={() => router.push(estimateItem.href as Href)} />
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

    </>
  );
  const rest = (
    <>
      <StatusPicker
        visible={picking}
        onClose={() => setPicking(false)}
        title={t("client.statusTitle")}
        options={statusOptions.map((x) => ({ key: x, tone: clientStatusChip[x].s, label: t(clientStatusChip[x].l), current: x === status, enabled: true, form: x === "do_not_service" }))}
        onPick={(k) => chooseStatus(k as CustomerStatus)}
      />
      <PropertySheet value={adding} onClose={() => setAdding(null)} />
      <PeopleSheet visible={sheet === "people"} customer={c} onClose={() => setSheet(null)} />
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
              title={t("cl6.writeMail")}
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
  // the mini header over the stuck tabs (DS §9 А1п «Прилипание», prototype v6, #1416): the name and the same quick actions as icons
  const mini = (
    <View testID="client-mini" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[2] }}>
      <T v="heading" numberOfLines={1} style={{ flex: 1 }}>
        {c.name}
      </T>
      <RowView gap={space[2]}>
        {tel ? <IconButton icon="phone" label={t("client.call")} onPress={() => dial(tel, () => setCalling({ ...(callPlaceForClient(db, role, c.id) ?? {}), customerId: c.id, contactId: main?.id }))} /> : null}
        {main && (tel || mail) ? (
          <IconButton icon="sms" label={t("visit.message")} onPress={() => (tel && mail ? setWriteAsk(true) : tel ? setWriting({ owner: { type: "customer", id: c.id }, person: main }) : Linking.openURL(mail!).catch(() => {}))} />
        ) : null}
        {props[0] ? <IconButton icon="navigate" label={t("client.route")} onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(`${props[0]!.address}, ${props[0]!.city}`)}`)} /> : null}
      </RowView>
    </View>
  );
  if (frame) return frame({ summary, tabs: tabsNode, content, rest, mini });
  return (
    <>
      {summary}
      {tabsNode}
      {content}
      {rest}
    </>
  );
}


function MoneyCell({ label, value, tone = "ink", testID }: { label: string; value: string; tone?: "ink" | "warn"; testID?: string }) {
  return (
    <View testID={testID} style={{ alignItems: "flex-start", flex: 1 }}>
      <T v="caption" tone="mut" numberOfLines={1}>
        {label}
      </T>
      {/* a sum is never broken onto two lines (#1417 review): the three stay on one line */}
      <T v="heading" tabular tone={tone} numberOfLines={1}>
        {value}
      </T>
    </View>
  );
}


/**
 * One line that never wraps (spec 56 §3а.6, DS §9 А1в): the fixed parts (number, status), then the tags as `MetaTag`; the tags
 * that do not fit go into «+N». Each tag's width is measured where it stands and kept, so the line knows what fits at any width.
 */
function OneLine({
  fixed,
  tags,
  onTags,
  tagsLabel,
  addLabel,
  moreLabel,
  testID,
}: {
  fixed: ReactNode[];
  tags: { id: string; label: string }[];
  onTags?: () => void;
  tagsLabel: string;
  /** «＋ Метка» when there are no tags (office) */
  addLabel?: string;
  moreLabel: (n: number) => string;
  testID?: string;
}) {
  const gap = space[2];
  const [rowW, setRowW] = useState(0);
  const [fixedW, setFixedW] = useState(0);
  const widths = useRef<Record<string, number>>({});
  const [plusW, setPlusW] = useState(0);
  const [, redraw] = useState(0);
  const measured = tags.every((x) => widths.current[x.id] !== undefined);
  // how many tags fit: all, while not measured yet (they are drawn to be measured, the line hides the overflow)
  let shown = tags.length;
  if (rowW && measured) {
    const room = rowW - fixedW;
    const sum = (k: number) => tags.slice(0, k).reduce((a, x) => a + widths.current[x.id]! + gap, 0);
    if (sum(tags.length) > room) {
      shown = 0;
      for (let k = tags.length - 1; k >= 0; k--) if (sum(k) + (plusW || gap * 5) + gap <= room) { shown = k; break; }
    }
  }
  const hidden = tags.length - shown;
  const keep = (id: string) => (e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    if (widths.current[id] !== w) {
      widths.current[id] = w;
      redraw((n) => n + 1);
    }
  };
  const tagsNode = (
    <View style={{ flexDirection: "row", alignItems: "center", gap, flexShrink: 0 }}>
      {tags.slice(0, shown).map((x) => (
        <View key={x.id} onLayout={keep(x.id)} style={{ flexShrink: 0 }}>
          <MetaTag label={x.label} />
        </View>
      ))}
      {hidden > 0 ? (
        <View testID="client-tags-more" onLayout={(e) => setPlusW(Math.ceil(e.nativeEvent.layout.width))} style={{ flexShrink: 0 }} accessibilityLabel={moreLabel(hidden)}>
          <MetaTag label={`+${hidden}`} />
        </View>
      ) : null}
      {!tags.length && addLabel ? (
        <View testID="client-add-tag">
          <MetaTag label={addLabel} />
        </View>
      ) : null}
    </View>
  );
  return (
    <View testID={testID} onLayout={(e) => setRowW(Math.floor(e.nativeEvent.layout.width))} style={{ flexDirection: "row", alignItems: "center", gap, overflow: "hidden", marginTop: -space[2] }}>
      <View onLayout={(e) => setFixedW(Math.ceil(e.nativeEvent.layout.width) + gap)} style={{ flexDirection: "row", alignItems: "center", gap, flexShrink: 0 }}>
        {fixed}
      </View>
      {onTags && (tags.length || addLabel) ? (
        <Press testID="client-tags" onPress={onTags} visibleHeight={component.chip.h} accessibilityRole="button" accessibilityLabel={tags.length ? tagsLabel : addLabel}>
          {tagsNode}
        </Press>
      ) : tags.length ? (
        tagsNode
      ) : null}
    </View>
  );
}
