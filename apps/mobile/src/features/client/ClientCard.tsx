/**
 * The client — template «Объект» (prototype v2, docs/design/client-card.html, BUILD-SPEC §2.4, LAYOUT-RULES §3):
 * the header (initials, the name once, «StatusPill · tags · долг», the address → the route, «тел» / «смс» inline; «⌄» or a swipe
 * down opens the panel: contacts by person with types and ★, addresses, facts, «✎ Изменить»), the strip of five sections
 * «Обзор · Работы · Деньги · Объекты · Журнал» (the tech: «Обзор · Выезды · Объекты · Журнал»), ONE main step pinned at the bottom
 * with its reason (the chain «Новая смета → Отправить → Выставить счёт → Взять оплату», plus «Сообщить время», «В путь» and
 * «Вернуть в активные» — features/client/nextStep.ts). «＋» makes from the client (estimate, job, task, property, note);
 * «⋯» holds the rare: «Изменить», status, tags, people.
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
import { clientSectionKeys, type ClientMainStep, type ClientSectionKey } from "@/features/client/nextStep";
import { ClientDetails, ClientLog, ClientMoney, ClientOverview, ClientPlaces, ClientWork, clientStepOf, useClientFacts } from "@/features/client/ClientSections";
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
  money: "proto.client.sec.money",
  places: "proto.client.sec.places",
  log: "proto.client.sec.log",
};

const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

/** the testID of the main step: the old «Создать смету» keeps its id (e2e), the rest `client-next-<kind>` */
export const stepTestID = (s: ClientMainStep | null) => (s?.kind === "estimate" ? "client-make-estimate" : `client-next-${s?.kind ?? "none"}`);

export function ClientObject({ c, section, onSection, back }: { c: Customer; section: ClientSectionKey; onSection: (k: ClientSectionKey) => void; back: () => void }) {
  const store = useStore();
  const { db, role } = store;
  const { t, money } = useI18n();
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
  const inline: IconRowItem[] = [
    ...(tel ? [{ icon: "phone" as const, label: t("client.call"), a11y: `${t("client.call")} ${c.name}`, onPress: call, testID: "client-call" }] : []),
    ...(main && (tel || mail) ? [{ icon: tel ? ("sms" as const) : ("mail" as const), label: t("cc.sms"), a11y: `${tel ? t("cc.sms") : t("visit.message")} ${c.name}`, onPress: () => sms(), testID: "client-write" }] : []),
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
  const mainStep: MainAction | undefined = !step
    ? undefined
    : (() => {
        const testID = stepTestID(step);
        switch (step.kind) {
          case "pay":
            return { testID, label: t("cc.next.pay", { amount: money(step.owesCents) }), reason: t("cc.why.pay", { n: docNo(step.invoice), amount: money(step.owesCents) }), onPress: () => router.push(step.href as Href) };
          case "bill":
            return { testID, label: t("proto.client.billAmount", { amount: money(step.toInvoiceCents) }), reason: t("cc.why.bill", { n: docNo(step.estimate), amount: money(step.toInvoiceCents) }), onPress: () => router.push(step.href as Href) };
          case "send":
            return { testID, label: t("cc.next.send"), reason: t("cc.why.send", { n: docNo(step.estimate) }), onPress: () => router.push(step.href as Href) };
          case "estimate":
            return { testID, label: t("est.new"), reason: r.estimates.length ? undefined : t("cc.why.estimate"), onPress: () => router.push(step.href as Href) };
          case "restore":
            return { testID, label: t("proto.client.restore"), reason: t("proto.client.restoreWhy"), onPress: () => toast.show(t("client.statusSaved"), store.setCustomerStatus(c.id, "active")) };
          case "trip":
            return { testID, label: t("proto.client.trip"), reason: t("proto.client.tripWhy"), onPress: () => router.push(`/visit/${step.visitId}`) };
          case "remind":
            return { testID, label: t("proto.client.remindEstimate"), reason: t("proto.client.remindWhy", { n: docNo(step.estimate) }), onPress: () => router.push(`/estimate/${step.estimate.id}`) };
          case "tellTime":
            return { testID, label: t("proto.client.tellTime"), reason: t("proto.client.tellTimeWhy"), onPress: () => sms() };
        }
      })();

  /* ---------- «＋» and «⋯» ---------- */
  const made = fabItems("client", role, { customerId: c.id });
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
  const keys = clientSectionKeys(role, f.hasMoney);
  const current: ClientSectionKey = keys.includes(section) ? section : "overview";
  const workN = office ? r.jobs.length : f.visits.length;
  const sections = useMemo(
    () =>
      keys.map((k) => ({
        key: k,
        label: k === "work" && !office ? t("jobs.visits") : t(SECTION_LABEL[k]),
        // a number only where it means something (client-card.html §4): «Работы 2», «Объекты 2»
        count: k === "work" && workN ? workN : k === "places" && r.properties.length > 1 ? r.properties.length : undefined,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the words of the strip
    [keys.join(), office, workN, r.properties.length, t],
  );

  const owes = office && f.m.owesCents > 0 ? t("proto.client.owes", { amount: money(f.m.owesCents) }) : undefined;
  const body =
    current === "work" ? (
      <ClientWork c={c} f={f} />
    ) : current === "money" ? (
      <ClientMoney c={c} f={f} />
    ) : current === "places" ? (
      <ClientPlaces c={c} f={f} onRoute={route} />
    ) : current === "log" ? (
      <ClientLog c={c} f={f} />
    ) : (
      <ClientOverview c={c} f={f} onSection={onSection} />
    );

  return (
    <>
      <ObjectScreen<ClientSectionKey>
        testID="client-screen"
        back={back}
        header={{
          testID: "client-header",
          title: c.name,
          avatar: initials(c.name),
          status: { name: chip.s, label: t(chip.l), onPress: office && statusOptions.length ? () => setPicking(true) : undefined },
          meta: [
            ...tags.map((x) => ({ id: x.id, label: tagLabel(x, t) })),
            ...(noLateCallsNow(db, c) ? [{ id: "late", label: t("client.lateCalls") }] : []),
          ],
          amount: owes,
          address: place ? { text: [place.address, place.city.split(",")[0]].filter(Boolean).join(", "), onPress: () => route(place) } : undefined,
          actions: inline,
          details: <ClientDetails c={c} f={f} onCall={(p) => callDone(p)} onSms={(p) => sms(p)} onRoute={route} />,
          onEdit: office ? () => router.push(`/client/edit?id=${c.id}`) : undefined,
          labels: { expand: t("proto.client.expand"), collapse: t("proto.client.collapse"), more: (n) => t("cw4.moreTags", { n }), edit: t("ue.edit") },
        }}
        sections={sections}
        section={current}
        onSection={onSection}
        sectionsLabel={t("cl6.tabs")}
        main={mainStep}
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
