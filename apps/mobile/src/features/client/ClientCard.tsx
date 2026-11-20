import { ModulePlaces } from "@/modules/ModulePlaces";
import { useState, type ReactElement, type ReactNode } from "react";
import { isOpenVisit } from "@/features/schedule";
import { Linking, View } from "react-native";
import { router, type Href } from "expo-router";
import { component, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { findJob } from "@/data/jobs";
import { peopleOf } from "@/data/people";
import { canServe, canSeeClientMoney, statusChoices, clientMoneyOf, clientStatusChip, noLateCallsNow, statusOf, tagLabel, tagsOf } from "@/features/clients";
import { clientRecords, type ClientRow, type ClientTab } from "@/features/clientRows";
import { ClientSection } from "@/features/client/ClientSections";
import { clientCurrent, clientNextStep, type NextStep } from "@/features/client/nextStep";
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
import { estView } from "@/features/boards";
import { jobStatusView } from "@/features/jobs";
import { invoiceChip } from "@/features/ContractStatement";
import { invoiceTitle } from "@/features/invoiceTitle";
import { NotesBlock } from "@/features/NotesBlock";
import type { Customer, CustomerStatus, Estimate, Invoice, Job } from "@/data/types";
import { useI18n } from "@/i18n";
import { fabItems } from "@/nav/sections";
import { Button, StatusChip } from "@/ui/controls";
import { Icon, Press, T, type IconKey } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { CardGrid, ListCard, StatusPicker, type ListCardProps } from "@/ui/listCard";
import { ActionBar } from "@/ui/actionBar";
import { MetaLine } from "@/ui/metaLine";
import { Card, CardList, ListRow, RowView, SectionTitle } from "@/ui/surfaces";
import { cleanPhone, mailtoHref } from "@/features/contactLinks";

/** the history shows this many cards, the rest open in place («Показать все · N») */
const HISTORY_FIRST = 5;

/** the next step's button: its word and its icon (06-decision.md п.3) */
const STEP_ICON: Record<NextStep["kind"], IconKey> = { estimate: "invoice", send: "send", bill: "invoice", pay: "dollar" };

/**
 * Where the card's parts stand: the client's own screen pins `bar` at the bottom of a phone and puts `next` into the page from
 * 820 (DS §8.9); the desktop puts the summary and `next` in a side column. The panel beside the list on 1280 keeps one column.
 */
export type ClientFrame = (parts: { summary: ReactNode; content: ReactNode; rest: ReactNode; next: ReactNode; bar: ReactNode }) => ReactElement;

/**
 * The client card (redesign 20.11.2026, docs/design/2026-11-20-direction/06-decision.md; designers' «Карточка клиента» 5.2):
 * ONE page, top to bottom — the address and «Позвонить · SMS · Маршрут»; «Сейчас» (the document of the next step or the one
 * waiting for the client, the jobs not done, the next visit); «История» (estimates, jobs, invoices — compact cards); notes;
 * photos; «О клиенте» (contacts, properties, tasks, leads, the log — each opens its own list `?s=<row>`). At the bottom — one
 * main button, the next step along the chain (features/client/nextStep.ts). The same body in the panel beside the list on 1280.
 * `tab` / `onTab` — the old view tabs' address (`?tab=`), kept so an old link still opens; the page has no tabs now.
 */
export function ClientCardBody({ c, frame }: { c: Customer; tab?: ClientTab; onTab?: (t: ClientTab) => void; frame?: ClientFrame }) {
  const store = useStore();
  const { db, role } = store;
  const { t, money, moneyWhole, day } = useI18n();
  const toast = useToast();
  const [sheet, setSheet] = useState<null | "tags" | "status" | "people">(null);
  const [picking, setPicking] = useState(false);
  const [allHistory, setAllHistory] = useState(false);
  /** wave 6-2: after «Позвонить» — «Чем кончился?» (the call goes to the client; a technician — to his job) */
  const [calling, setCalling] = useState<CallPreset | null>(null);
  const dial = useDialThenAsk();
  const [writing, setWriting] = useState<MessagePreset | null>(null);
  /** «SMS»: SMS or email — a small sheet when the client has both (prototype v6) */
  const [writeAsk, setWriteAsk] = useState(false);
  const office = role !== "tech";
  const status = statusOf(c);
  const chip = clientStatusChip[status];
  const tags = tagsOf(db, c);
  /** the same rules as the «＋» of this card: the role, the tie to the client */
  const estimateItem = fabItems("client", role, { customerId: c.id }).find((i) => i.id === "estimate");
  const [main] = peopleOf(c);
  const r = clientRecords(db, c, role, store.mode);
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
  const place = props[0];
  const routeTo = () => place && Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(`${place.address}, ${place.city}`)}`).catch(() => {});
  const call = () => tel && dial(tel, () => setCalling({ ...(callPlaceForClient(db, role, c.id) ?? {}), customerId: c.id, contactId: main?.id }));
  const write = () => (tel && mail ? setWriteAsk(true) : tel && main ? setWriting({ owner: { type: "customer", id: c.id }, person: main }) : mail ? Linking.openURL(mail).catch(() => {}) : undefined);

  // the status is chosen in the one StatusPicker (DS §9 А10, spec 56 wave 4), not in a menu at the chip
  const chooseStatus = (st: CustomerStatus) => {
    setPicking(false);
    if (st === status) return;
    if (st === "do_not_service") return setSheet("status"); // needs a reason: the page of that choice
    toast.show(t("client.statusSaved"), store.setCustomerStatus(c.id, st));
  };
  // the mark is the director's and the office's (04 §12.8): sales see no «Не обслуживаем» and cannot lift it
  const statusOptions = statusChoices(status, role);

  /* ---------- the next step and what the client is on now ---------- */
  const step = clientNextStep({ estimates: r.estimates, jobs: r.jobs, invoices: r.invoices, role, newEstimateHref: estimateItem && canServe(db, c.id) ? estimateItem.href : undefined });
  const now = clientCurrent(step, r.estimates, r.jobs);
  const docNo = (x: { number?: string; title?: string }) => x.number || x.title || "";
  const stepLabel = !step
    ? ""
    : step.kind === "pay"
      ? t("cc.next.pay", { amount: money(step.owesCents) })
      : step.kind === "bill"
        ? t("inv.issue")
        : step.kind === "send"
          ? t("cc.next.send")
          : t("est.new");
  const stepWhy = !step
    ? undefined
    : step.kind === "pay"
      ? t("cc.why.pay", { n: docNo(step.invoice), amount: money(step.owesCents) })
      : step.kind === "bill"
        ? t("cc.why.bill", { n: docNo(step.estimate), amount: money(step.toInvoiceCents) })
        : step.kind === "send"
          ? t("cc.why.send", { n: docNo(step.estimate) })
          : r.estimates.length
            ? undefined
            : t("cc.why.estimate");
  // the old «Создать смету» keeps its testID (e2e): the first step of the chain is the same button
  const stepTestID = step?.kind === "estimate" ? "client-make-estimate" : `client-next-${step?.kind ?? "none"}`;
  const stepButton = (bar: boolean) =>
    step ? <Button testID={stepTestID} label={stepLabel} icon={STEP_ICON[step.kind]} size={bar ? "bar" : undefined} full onPress={() => router.push(step.href as Href)} /> : null;
  const stepNote = stepWhy ? (
    <View testID="client-next-why">
      <T v="caption" tone="mut" center numberOfLines={2}>
        {stepWhy}
      </T>
    </View>
  ) : null;

  /* ---------- the cards of documents: the same words in «Сейчас» and «История» ---------- */
  const estimateCard = (e: Estimate, density: ListCardProps["density"]) => {
    const v = estView[e.status];
    return (
      <ListCard
        key={`e${e.id}`}
        density={density}
        testID={`client-estimate-${e.id}`}
        lead={{ kind: "icon", icon: "invoice" }}
        title={e.title || e.number || t("cc.kind.estimate")}
        when={[t("cc.kind.estimate"), e.title ? e.number : null].filter(Boolean).join(" · ")}
        value={office ? money(e.totalCents) : undefined}
        status={{ tone: v.s, label: t(v.l) }}
        onPress={() => router.push(`/estimate/${e.id}`)}
      />
    );
  };
  const jobCard = (j: Job, density: ListCardProps["density"]) => {
    const v = jobStatusView[j.status];
    const p = db.properties.find((x) => x.id === j.propertyId);
    return (
      <ListCard
        key={`j${j.id}`}
        density={density}
        testID={`client-job-${j.id}`}
        lead={{ kind: "icon", icon: "wrench" }}
        title={j.title || j.number || t("cc.kind.job")}
        when={[t("cc.kind.job"), j.title ? j.number : null, p && props.length > 1 ? propertyTitle(p) : null].filter(Boolean).join(" · ")}
        value={office ? money(j.amountCents) : undefined}
        status={{ tone: v.status, label: t(v.label) }}
        onPress={() => router.push(`/job/${j.id}`)}
      />
    );
  };
  const invoiceCard = (inv: Invoice, density: ListCardProps["density"]) => {
    const ic = invoiceChip(inv);
    return (
      <ListCard
        key={`i${inv.id}`}
        density={density}
        testID={`client-invoice-${inv.id}`}
        lead={{ kind: "icon", icon: "invoice" }}
        title={(inv.title && invoiceTitle(inv, t)) || findJob(db, inv.jobId)?.title || inv.number || t("cc.kind.invoice")}
        when={[t("cc.kind.invoice"), inv.number].filter(Boolean).join(" · ")}
        value={money(inv.totalCents)}
        status={{ tone: ic.s, label: t(ic.l, ic.p) }}
        onPress={() => router.push(`/invoice/${inv.id}`)}
      />
    );
  };

  /* ---------- «История»: estimates, jobs, invoices — newest first, without what «Сейчас» shows ---------- */
  const shownDoc = now.doc?.type === "estimate" ? `e${now.doc.e.id}` : now.doc?.type === "invoice" ? `i${now.doc.i.id}` : "";
  const shownJobs = new Set(now.jobs.map((j) => j.id));
  const estDay = (e: Estimate) => e.approvedAt ?? e.sentAt ?? e.savedAt ?? "";
  const history = [
    ...r.estimates.filter((e) => `e${e.id}` !== shownDoc).map((e) => ({ at: estDay(e), node: estimateCard(e, "compact") })),
    ...r.jobs
      .filter((j) => !shownJobs.has(j.id))
      .map((j) => {
        const e = r.estimates.find((x) => x.id === j.estimateId);
        return { at: e ? estDay(e) : "", node: jobCard(j, "compact") };
      }),
    ...r.invoices.filter((i) => `i${i.id}` !== shownDoc && i.status !== "void").map((i) => ({ at: i.sentAt ?? i.dueDate ?? "", node: invoiceCard(i, "compact") })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const historyShown = allHistory ? history : history.slice(0, HISTORY_FIRST);

  const summary = (
    // the head of the page: the address, one line «number · status · tags», the quick actions — above everything on a phone and a
    // tablet, the side column 360 on a desktop (DS §12.3)
    <View testID="client-summary" style={{ width: "100%", gap: space[3] }}>
      {place ? (
        <View testID="client-address" style={{ marginTop: -space[2] }}>
          <T v="body" tone="mut" numberOfLines={2}>
            {[place.address, place.city].filter(Boolean).join(", ")}
          </T>
        </View>
      ) : null}
      {/* one line, never wrapped (spec 56 §3а.6): number · status · tags, the tags that do not fit — «+N»; the tags open their sheet */}
      <MetaLine
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
      {/* Позвонить · SMS · Маршрут — one line, a word under each (designers 5.2); nothing to do — no tile */}
      <View testID="client-actions" style={{ flexDirection: "row", gap: space[2], paddingVertical: space[1] }}>
        {tel ? <ActionTile testID="client-call" icon="phone" label={t("client.call")} onPress={call} /> : null}
        {main && (tel || mail) ? <ActionTile testID="client-write" icon={tel ? "sms" : "mail"} label={tel ? t("cc.sms") : t("visit.message")} onPress={write} /> : null}
        {place ? <ActionTile testID="client-route" icon="navigate" label={t("client.route")} onPress={routeTo} /> : null}
      </View>
      {lateCalls ? <StatusChip status="warn" label={t("client.lateCalls")} /> : null}
      {status === "do_not_service" ? (
        <T v="caption" tone="mut">
          {[c.statusReason ? t("client.reason", { r: c.statusReason }) : null, t("client.noServiceHint")].filter(Boolean).join(" · ")}
        </T>
      ) : null}
      {/* step 17 C3: other clients with the same phone / email / address — «Слить» or «Не дубль» (docs/specs/04 §13) */}
      <ClientDupCards c={c} />
      {canSeeClientMoney(role) && (m.invoicedCents > 0 || m.paidTotalCents > 0) ? (
        // money only, three equal figures on one line — unslop 05.11; a client with no money yet has none
        <Card>
          <RowView style={{ alignItems: "flex-start" }}>
            <MoneyCell testID="client-owes" label={t("cl6.money.owes")} value={moneyWhole(m.owesCents)} tone={m.owesCents > 0 ? "warn" : "ink"} />
            <MoneyCell testID="client-paid" label={t("cl6.money.paid")} value={moneyWhole(m.paidTotalCents)} />
            <MoneyCell testID="client-invoiced" label={t("cl6.money.invoiced")} value={moneyWhole(m.invoicedCents)} />
          </RowView>
        </Card>
      ) : null}
    </View>
  );

  const hasNow = !!now.doc || now.jobs.length > 0 || !!nextVisit || openTasks.length > 0;
  const content = (
    <View testID="client-page" style={{ gap: space[3] }}>
      {/* «Сейчас»: the document the next step is about (or the one waiting for the client), the jobs not done, the next visit */}
      {hasNow ? (
        <>
          <SectionTitle title={t("cc.now")} />
          <View testID="client-now">
            <CardList>
              {now.doc ? (now.doc.type === "estimate" ? estimateCard(now.doc.e, "regular") : invoiceCard(now.doc.i, "regular")) : null}
              {now.jobs.map((j) => jobCard(j, "regular"))}
              {nextVisit ? (
                <View testID="client-next-visit">
                  <Card style={{ paddingVertical: space[1] }}>
                    <ListRow
                      title={`${t("client.nextVisit")} · ${day(nextVisit.start)}`}
                      subtitle={r.jobs.find((j) => j.id === nextVisit.jobId)?.title}
                      left={<Icon name="route" />}
                      onPress={() => router.push(`/visit/${nextVisit.id}`)}
                    />
                  </Card>
                </View>
              ) : null}
              {openTasks.length ? (
                // a single hint about this client, not a list of objects (06 «10а, остаток» п.6): Card + ListRow
                <Card style={{ paddingVertical: space[1] }}>
                  <ListRow title={t("client.openTasks", { n: openTasks.length })} subtitle={openTasks[0]!.title} left={<Icon name="check" />} onPress={() => open("tasks")} />
                </Card>
              ) : null}
            </CardList>
          </View>
        </>
      ) : null}
      {/* add-on modules' place (spec 33 П24 А3): nothing unless a module is switched on */}
      <ModulePlaces place="client" ctx={{ customerId: c.id, leadIds: db.leads.filter((l) => l.customerId === c.id).map((l) => l.id), places: db.properties.filter((p) => p.customerId === c.id).map((p) => ({ id: p.id, address: p.address, ...(p.city ? { city: p.city } : {}), leadIds: db.leads.filter((l) => l.propertyId === p.id).map((l) => l.id) })) }} />
      {/* spec 35 §4г («Деньги и отчёты»): the client's money without an invoice — apply or refund it on its receipt */}
      {canSeeClientMoney(role) ? <AdvancesBlock customerId={c.id} /> : null}

      {/* «История»: estimates, jobs, invoices — one object, one compact card (rule 12); all of it in «Сейчас» — no section */}
      {history.length || !hasNow ? (
        <>
          <SectionTitle title={t("cc.history")} />
          <View testID="client-history">
            {history.length ? (
              <CardGrid>{historyShown.map((h) => h.node)}</CardGrid>
            ) : (
              <Card style={{ paddingVertical: space[1] }}>
                <ListRow title={t("cc.historyEmpty")} subtitle={step?.kind === "estimate" ? t("cc.historyEmptyHint") : undefined} left={<Icon name="clock" />} />
              </Card>
            )}
          </View>
          {history.length > HISTORY_FIRST && !allHistory ? (
            <Button testID="client-history-all" label={t("cc.historyAll", { n: history.length })} variant="ghost" size="sm" onPress={() => setAllHistory(true)} />
          ) : null}
        </>
      ) : null}

      {/* the notes block has its own title with the number */}
      <ClientSection c={c} s="notes" />

      {/* photos from the visits and files: only when there are any (an empty block would only push «О клиенте» down) */}
      {r.photos.length + r.files.length ? (
        <>
          <SectionTitle title={t("cc.photos")} />
          <ClientSection c={c} s="files" />
        </>
      ) : null}

      {/* «О клиенте»: everything else of the client, each row opens its own list (`?s=<row>`, the same lists as before) */}
      <SectionTitle title={t("cc.about")} />
      <View testID="client-about">
        <Card style={{ paddingVertical: space[1] }}>
          {r.people.length > 1 || office ? (
            <View testID="client-people">
              <ListRow
                title={t("client.row.people")}
                subtitle={r.people.map((p) => p.name || c.name).join(" · ")}
                left={<Icon name="users" />}
                right={<Count n={r.people.length} />}
                onPress={() => (office ? setSheet("people") : open("people"))}
              />
            </View>
          ) : null}
          <ListRow
            title={t("client.row.properties")}
            subtitle={props.map((p) => propertyTitle(p)).join(" · ") || undefined}
            left={<Icon name="pin" />}
            right={<Count n={props.length} />}
            onPress={() => open("properties")}
          />
          {office ? (
            // where the invoices go (office): the property's address until one is set; opens the client's form
            <View testID="client-billing">
              <ListRow
                title={t("client.row.billing")}
                subtitle={c.billing ? billingLine(c.billing) : place ? `${t("client.row.billingSame")} · ${propertyTitle(place)}` : t("client.row.billingSame")}
                left={<Icon name="invoice" />}
                onPress={() => router.push(`/client/edit?id=${c.id}`)}
              />
            </View>
          ) : null}
          <ListRow title={t("client.tab.tasks")} left={<Icon name="check" />} right={<Count n={openTasks.length} />} onPress={() => open("tasks")} />
          {r.leads.length ? (
            <View testID="client-leads">
              <ListRow title={t("client.row.leads")} left={<Icon name="inbox" />} right={<Count n={r.leads.length} />} onPress={() => open("leads")} />
            </View>
          ) : null}
          <ListRow
            title={t("cc.events")}
            subtitle={office && c.sourceId ? t("client.cameFrom", { source: sourceName(db, c.sourceId) }) : undefined}
            left={<Icon name="clock" />}
            onPress={() => open("history")}
          />
        </Card>
      </View>
    </View>
  );

  // the one main button inline (from 820, the panel on 1280): the reason over it, as on the pinned bar of a phone
  const next = step ? (
    <View testID="client-next" style={{ gap: space[2] }}>
      {stepButton(false)}
      {stepNote}
    </View>
  ) : null;
  const bar = step ? <ActionBar testID="client-next-bar" summary={stepNote} main={stepButton(true)} /> : null;

  const rest = (
    <>
      <StatusPicker
        visible={picking}
        onClose={() => setPicking(false)}
        title={t("client.statusTitle")}
        options={statusOptions.map((x) => ({ key: x, tone: clientStatusChip[x].s, label: t(clientStatusChip[x].l), current: x === status, enabled: true, form: x === "do_not_service" }))}
        onPick={(k) => chooseStatus(k as CustomerStatus)}
      />
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
  if (frame) return frame({ summary, content, rest, next, bar });
  return (
    <>
      {summary}
      {next}
      {content}
      {rest}
    </>
  );
}

/** the number at the right of a row of «О клиенте»; nothing — no number */
function Count({ n }: { n: number }) {
  return n ? (
    <T v="body" tone="mut" tabular>
      {String(n)}
    </T>
  ) : null;
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
