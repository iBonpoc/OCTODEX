/**
 * The client — template «Объект», by visual v2 «Объект — Клиент» (docs/design/visual-v2.html, #2350):
 * the one header «Sarah Mitchell ⌄ | VIP · Постоянный / ◷ Активный» («⌄» or a swipe down opens the panel: contacts by person with
 * types and ★, addresses, facts, «✎ Изменить»); the quick actions — five icons 44 with their words «Позвонить · SMS · Маршрут · Почта ·
 * Замер»; the «Сейчас» card with its three figures and the ONE main step inside it (the chain «Новая смета → Отправить → Выставить
 * счёт → Взять оплату», plus «Сообщить время», «В путь» and «Вернуть в активные» — features/client/nextStep.ts); then one strip of
 * sections «Обзор · Работы · Сметы · Счета · Объекты · Журнал» that scrolls sideways (the tech: «Обзор · Выезды · Объекты · Журнал»).
 * Nothing twice: the address and the phone live in the panel (and in «Маршрут» / «Позвонить»), the sum once — in the card's figures.
 * «＋» makes from the client (estimate, job, task, property, note); «⋯» holds the rare: «Изменить», status, tags, people.
 * Built on `ObjectScreen` (src/ui/templates) — nothing of its own. Business rules are only called.
 */
import { useMemo, useState } from "react";
import { Linking } from "react-native";
import { router, type Href } from "expo-router";
import { useStore } from "@/data/store";
import { peopleOf } from "@/data/people";
import type { Customer, CustomerStatus, Person, Property } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { canServe, clientStatusChip, noLateCallsNow, statusChoices, tagLabel, tagsOf } from "@/features/clients";
import { CallSheet, type CallPreset } from "@/features/comms/CallSheet";
import { useDialThenAsk } from "@/features/comms/dial";
import { MessageSheet, type MessagePreset } from "@/features/comms/MessageSheet";
import { callPlaceForClient } from "@/features/comms/comms";
import { PeopleSheet, StatusSheet, TagsSheet } from "@/features/client/ClientSheets";
import { newProperty, PropertySheet } from "@/features/client/PropertySheets";
import { clientSectionKeys, jobChain, type ClientMainStep, type ClientSectionKey } from "@/features/client/nextStep";
import { clientMeasureHref, clientPlaceCtx } from "@/features/client/clientMeasure";
import { ClientContacts } from "@/features/client/ClientContacts";
import { ClientDetails, ClientEstimates, ClientLog, ClientMoney, ClientNowCard, ClientOverview, ClientPlaces, ClientVisits, ClientWork, clientStepOf, useClientFacts } from "@/features/client/ClientSections";
import { TaskSheet, type TaskDraft } from "@/features/tasks/TaskSheet";
import { cleanPhone, mailtoHref } from "@/features/contactLinks";
import { propertyMapQuery } from "@/features/properties";
import { fabItems } from "@/nav/sections";
import { StatusPicker } from "@/ui/listCard";
import { useToast } from "@/ui/overlays";
import { ObjectScreen, type MainAction, type MoreAction } from "@/ui/templates";
import type { IconRowItem } from "@/ui/iconRow";

const SECTION_LABEL: Record<ClientSectionKey, DictKey> = {
  overview: "client.tab.overview",
  work: "proto.client.sec.work",
  estimates: "cl6.tab.estimates",
  money: "cl6.tab.invoices",
  visits: "jobs.visits",
  places: "proto.client.sec.places",
  log: "proto.client.sec.log",
};

const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

/** the header's tags: the first one, the rest as «+N» */
export const headTags = (all: { id: string; label: string }[]) => (all.length > 1 ? [all[0]!, { id: "more", label: `+${all.length - 1}` }] : all);

/** the testID of the main step: the old «Создать смету» keeps its id (e2e), the rest `client-next-<kind>` */
export const stepTestID = (s: ClientMainStep | null) => (s?.kind === "estimate" ? "client-make-estimate" : `client-next-${s?.kind ?? "none"}`);

export function ClientObject({ c, section, onSection, back }: { c: Customer; section: ClientSectionKey; onSection: (k: ClientSectionKey) => void; back: () => void }) {
  const store = useStore();
  const { db, role } = store;
  const { t } = useI18n();
  const toast = useToast();
  const f = useClientFacts(c);
  const { r, office, status } = f;
  const dial = useDialThenAsk();
  const [picking, setPicking] = useState(false);
  const [sheet, setSheet] = useState<null | "tags" | "status" | "people">(null);
  const [calling, setCalling] = useState<CallPreset | null>(null);
  const [writing, setWriting] = useState<MessagePreset | null>(null);
  const [taskEdit, setTaskEdit] = useState<TaskDraft | null>(null);
  const [newProp, setNewProp] = useState<Property | null>(null);
  const [main] = peopleOf(c);
  const chip = clientStatusChip[status];
  const tags = tagsOf(db, c);
  const tel = cleanPhone(c.phone);
  const mail = mailtoHref(c.email);
  const place = r.properties[0];

  /* ---------- contact ---------- */
  const callDone = (p?: Person) => setCalling({ ...(callPlaceForClient(db, role, c.id) ?? {}), customerId: c.id, contactId: (p ?? main)?.id });
  const call = () => tel && dial(tel, () => callDone());
  const sms = (p?: Person) => (tel || p ? setWriting({ owner: { type: "customer", id: c.id }, person: p ?? main }) : mail ? Linking.openURL(mail).catch(() => {}) : undefined);
  const route = (p: Property) => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(propertyMapQuery(p))}`).catch(() => {});
  // #2996: «Замер» is the measuring module's measurement (never a new estimate); no such module — no icon
  const measureHref = canServe(db, c.id) ? clientMeasureHref(db, role, clientPlaceCtx(db, c.id, r.leadIds, r.properties)) : undefined;
  /** v2 «быстрые действия»: five icons 44 with their words; what cannot be done is dimmed with the reason (VoiceOver) */
  const quick: IconRowItem[] = [
    { icon: "phone", label: t("client.call"), a11y: `${t("client.call")} ${c.name}`, onPress: call, testID: "client-call", disabled: !tel, reason: t("w2b.client.noPhone") },
    { icon: "message", label: t("cc.sms"), a11y: `${t("cc.sms")} ${c.name}`, onPress: () => sms(), testID: "client-write", disabled: !tel || !main, reason: t("w2b.client.noPhone") },
    { icon: "route", label: t("client.route"), a11y: place ? `${t("client.route")}: ${place.address}` : t("client.route"), onPress: () => place && route(place), testID: "client-route", disabled: !place, reason: t("w2b.client.noPlace") },
    { icon: "mail", label: t("cl6.writeMail"), a11y: `${t("cl6.writeMail")} ${c.name}`, onPress: () => mail && Linking.openURL(mail).catch(() => {}), testID: "client-mail", disabled: !mail, reason: t("w2b.client.noMail") },
    ...(measureHref ? [{ icon: "measure" as const, label: t("w2b.client.measure"), a11y: `${t("w2b.client.measure")}: ${c.name}`, onPress: () => router.push(measureHref as Href), testID: "client-measure" }] : []),
  ];

  /* ---------- status ---------- */
  const statusOptions = statusChoices(status, role);
  const chooseStatus = (st: CustomerStatus) => {
    setPicking(false);
    if (st === status) return;
    if (st === "do_not_service") return setSheet("status"); // needs a reason
    toast.show(t("client.statusSaved"), store.setCustomerStatus(c.id, st));
  };

  /* ---------- the one main step ---------- */
  const estimateItem = fabItems("client", role, { customerId: c.id }).find((i) => i.id === "estimate");
  const step = clientStepOf(f, estimateItem && canServe(db, c.id) ? estimateItem.href : undefined);
  const docNo = (x: { number?: string; title?: string }) => x.number || x.title || "";
  const nowJob = f.now && (f.now.kind === "working" || f.now.kind === "scheduled") ? f.now.job : undefined;
  const nowEst = nowJob ? r.estimates.find((e) => e.id === nowJob.estimateId) : undefined;
  const depositPaid = !!nowJob && jobChain(nowJob, nowEst, r.invoices).some((x) => x.key === "deposit" && x.done);
  const mainStep: MainAction | undefined = !step
    ? undefined
    : (() => {
        const testID = stepTestID(step);
        switch (step.kind) {
          case "pay":
            return { testID, label: t("w2b.client.pay"), reason: t("w2b.client.payWhy", { n: docNo(step.invoice) }), onPress: () => router.push(step.href as Href) };
          case "bill":
            // v2 макет 3 «задаток оплачен, …»: the deposit of the «Сейчас» job paid — say so; else the plain reason
            return { testID, label: t("inv.issue"), reason: depositPaid ? t("px2.cv.billWhyDeposit") : t("w2b.client.billWhy"), onPress: () => router.push(step.href as Href) };
          case "send":
            return { testID, label: t("cc.next.send"), reason: t("cc.why.send", { n: docNo(step.estimate) }), onPress: () => router.push(step.href as Href) };
          case "estimate":
            return { testID, label: t("est.new"), reason: r.estimates.length ? undefined : t("cc.why.estimate"), onPress: () => router.push(step.href as Href) };
          case "restore":
            return { testID, outline: true, label: t("proto.client.restore"), reason: t("proto.client.restoreWhy"), onPress: () => toast.show(t("client.statusSaved"), store.setCustomerStatus(c.id, "active")) };
          case "trip":
            return { testID, label: t("proto.client.trip"), reason: t("proto.client.tripWhy"), onPress: () => router.push(`/visit/${step.visitId}`) };
          case "remind":
            return { testID, label: t("proto.client.remindEstimate"), reason: t("proto.client.remindWhy", { n: docNo(step.estimate) }), onPress: () => router.push(`/estimate/${step.estimate.id}`) };
          case "tellTime":
            return { testID, label: t("proto.client.tellTime"), reason: t("proto.client.tellTimeWhy"), onPress: () => sms() };
        }
      })();

  /* ---------- «＋» and «⋯» ---------- */
  // «Не обслуживаем» (04 §12): no new estimate or job for the client — «＋» keeps the task, the note and the property
  const made = canServe(db, c.id) ? fabItems("client", role, { customerId: c.id }) : [];
  const create = office
    ? {
        a11y: t("proto.client.createFor", { name: c.name }),
        items: [
          ...made.map((i) => ({ key: i.id, label: t(i.label), icon: i.icon, testID: `client-create-${i.id}` })),
          { key: "task", label: t("task.new"), icon: "check" as const, testID: "client-create-task" },
          { key: "note", label: t("proto.client.note"), icon: "note" as const, testID: "client-create-note" },
          { key: "property", label: t("prop.add"), icon: "home2" as const, testID: "client-create-property" },
        ],
      }
    : undefined;
  const onCreate = (k: string) => {
    const item = made.find((i) => i.id === k);
    if (item?.href) return router.push(item.href as Href);
    if (k === "task") return setTaskEdit({ subjectType: "customer", subjectId: c.id, title: "", assigneeId: db.me });
    if (k === "note") return onSection("log");
    if (k === "property") return setNewProp(newProperty(c.id));
  };
  const more: MoreAction = office
    ? [
        { key: "edit", label: t("ue.edit"), icon: "pencil", testID: "client-act-edit" },
        ...(statusOptions.length ? [{ key: "status", label: t("client.statusTitle"), icon: "tag" as const, testID: "client-act-status" }] : []),
        { key: "tags", label: t("proto.client.tags"), icon: "tag", testID: "client-act-tags" },
        { key: "people", label: t("client.people"), icon: "users", testID: "client-act-people" },
      ]
    : [];
  const onMore = (k: string) => {
    if (k === "edit") router.push(`/client/edit?id=${c.id}`);
    else if (k === "status") setPicking(true);
    else if (k === "tags" || k === "people") setSheet(k);
  };

  /* ---------- the strip ---------- */
  const keys = clientSectionKeys(role, f.hasMoney, r.properties.length > 1);
  const current: ClientSectionKey = keys.includes(section) ? section : "overview";
  const workN = office ? r.jobs.length : f.visits.length;
  const sections = useMemo(
    () =>
      keys.map((k) => ({
        key: k,
        label: k === "work" && !office ? t("jobs.visits") : t(SECTION_LABEL[k]),
        // a number only where it means something (v2: «Работы 2 · Сметы 1 · Счета 2»)
        count: k === "work" ? workN || undefined : k === "estimates" ? r.estimates.length || undefined : k === "money" ? r.invoices.length || undefined : k === "visits" ? f.visits.length || undefined : k === "places" ? r.properties.length : undefined,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the words of the strip
    [keys.join(), office, workN, r.estimates.length, r.invoices.length, f.visits.length, r.properties.length, t],
  );

  const body =
    current === "work" ? (
      <ClientWork c={c} f={f} />
    ) : current === "estimates" ? (
      <ClientEstimates f={f} />
    ) : current === "money" ? (
      <ClientMoney c={c} f={f} />
    ) : current === "visits" ? (
      <ClientVisits f={f} />
    ) : current === "places" ? (
      <ClientPlaces c={c} f={f} onRoute={route} />
    ) : current === "log" ? (
      <ClientLog c={c} f={f} />
    ) : (
      <ClientOverview c={c} f={f} onSection={onSection} />
    );
  // the header's status: «◷ Активный» (v2) — not «Клиент» on a client's own card; the others say their own word
  const statusWord = status === "active" ? t("w2b.client.active") : t(chip.l);

  return (
    <>
      <ObjectScreen<ClientSectionKey>
        testID="client-screen"
        back={back}
        header={{
          testID: "client-header",
          title: c.name,
          avatar: initials(c.name),
          // v2 макет 3: «◷ Активный» — the clock for an active client
          status: { name: chip.s, label: statusWord, icon: status === "active" ? "clock" : undefined, onPress: office && statusOptions.length ? () => setPicking(true) : undefined },
          // the line right of the rule (v2 «Клиент · VIP», the founder 21.11 «нет разделения Клиент · VIP»): what it is and its first
          // tag — never «VIP · Постоя…»; all of them are in «⋯ Метки»
          kindWord: t("client.card"),
          meta: headTags([...tags.map((x) => ({ id: x.id, label: tagLabel(x, t) })), ...(noLateCallsNow(db, c) ? [{ id: "late", label: t("client.lateCalls") }] : [])]).slice(0, 1),
          details: <ClientDetails c={c} f={f} onCall={(p) => callDone(p)} onSms={(p) => sms(p)} onRoute={route} />,
          // v2 «⌄ в свёрнутой»: the contacts, one row 48 each, over the page
          contacts: <ClientContacts c={c} f={f} onCall={(p) => callDone(p)} onSms={(p) => sms(p)} onRoute={route} />,
          onEdit: office ? () => router.push(`/client/edit?id=${c.id}`) : undefined,
          // «⌄» says what it opens (the founder 21.11: «стрелочка вниз возле имени — не понимаю, что делает»)
          labels: { expand: t("hdr.contacts"), collapse: t("hdr.contactsHide"), more: (n) => t("cw4.moreTags", { n }), edit: t("ue.edit") },
        }}
        actions={quick}
        now={<ClientNowCard f={f} main={mainStep} />}
        sections={sections}
        section={current}
        onSection={onSection}
        sectionsLabel={t("cl6.tabs")}
        sectionsLook="chips"
        create={create}
        onCreate={onCreate}
        more={more}
        onMore={onMore}
      >
        {body}
      </ObjectScreen>
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
      <TaskSheet value={taskEdit} onClose={() => setTaskEdit(null)} />
      <PropertySheet value={newProp} onClose={() => setNewProp(null)} />
    </>
  );
}
