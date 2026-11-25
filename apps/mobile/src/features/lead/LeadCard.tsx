/**
 * The lead — template «Объект» (prototype v2, object-cards «Лид», BUILD-SPEC §2.11, LAYOUT-RULES §3): the work of the screen is to
 * answer faster than the others and bring the lead to an estimate — or close it.
 * The same object system as the client (visual v2 «Объект», #2350): the header «Kevin Brooks | ◷ Новый»; QuickActions «Позвонить ·
 * SMS · Почта · Маршрут · Ответил в источнике» (a call always asks «Чем кончился?» after it, Р13); the «Сейчас» card — whose turn it is
 * in words and the ONE main step inside it (`leadStepOf`); the strip «Обзор · Переписка · Задачи · Сметы · Файлы». Nothing twice: the
 * address and the source are in «Контакт» / «Кто ведёт» only, the turn in the card only. The step order: «Ответить» →
 * «Открыть клиента» → «Что дальше?» → «Потерян или подождать?» → «Напомнить про смету» (+ «Потерян?») → «Составить смету» →
 * «Задачи» → «Вернуть сейчас» → «Вернуть в работу». «＋» makes from the lead (estimate, task, the estimate visit); «⋯» holds the rare:
 * status, «Сделать клиентом», «Отложить», «Закрыть лид». Built on `ObjectScreen` — nothing of its own; the rules are only called.
 */
import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import { MoreButton } from "@/ui/templates/parts";
import { ViewTabs } from "@/ui/viewTabs";
import { Image, Linking, Platform, View } from "react-native";
import { router } from "expo-router";
import { component, radius, size, space } from "@octo/design-tokens";
import { visitPropertyId } from "@/data/selectors";
import { useStore } from "@/data/store";
import type { Estimate, Lead, Photo, Task, Visit } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import {
  isClosedLead, isOpenLead, isOverdueTask, openTasks, isSnoozed, leadDuplicatesFor, leadStatusView, leadTimeline, leadTurn,
  MANUAL_WIN_REASONS, sourceName, sourceOf, timelineText, type ManualWinReason,
} from "@/features/leads";
import { leadSettingsOf } from "@/features/leadSettings";
import { canSeeClientMoney, canServe, notServed } from "@/features/clients";
import { estView } from "@/features/boards";
import { canMakeEstimateAt, canSeeEstimate, leadEstimatePropertyId } from "@/features/access";
import { cleanPhone, mailtoHref, smsHref } from "@/features/contactLinks";
import { useDialThenAsk } from "@/features/comms/dial";
import { liveUri } from "@/features/photoUri";
import { liveAssignees } from "@/features/schedule";
import { memberLabel } from "@/features/team";
import { NotesBlock } from "@/features/NotesBlock";
import { ServiceCategoryRow } from "@/features/ServiceCategoryPicker";
import { ReplySheet, useTick } from "@/features/sheets";
import { TaskSheet, type TaskDraft } from "@/features/tasks/TaskSheet";
import { ModulePlaces } from "@/modules/ModulePlaces";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, ChoiceChips, TextField } from "@/ui/controls";
import { GroupedList, GroupRow, ListGroup } from "@/ui/groupedList";
import { useOpening } from "@/ui/heldSheet";
import type { IconRowItem } from "@/ui/iconRow";
import { mapsUrl, type OS } from "@/ui/listCardLayout";
import { Sheet, useToast } from "@/ui/overlays";
import { Icon, T } from "@/ui/primitives";
import { Empty, Grid } from "@/ui/surfaces";
import { NowCard } from "@/ui/nowCard";
import { ObjectScreen, type MainAction, type MoreAction } from "@/ui/templates";
import { dayAtHour } from "./bookRules";
import { CloseSheet, LeadHistory, LeadOverview } from "./LeadParts";
import { BookSheet, CallResultSheet, LostOrWaitSheet, NextStepSheet, SnoozeSheet, StatusSheet } from "./LeadSheets";
import { fmtWait, leadStepOf, type LeadStep } from "./leadRows";

export type LeadSectionKey = "overview" | "history" | "tasks" | "estimates" | "files";
export const LEAD_SECTIONS: readonly LeadSectionKey[] = ["overview", "history", "tasks", "estimates", "files"];
const SECTION_LABEL: Record<LeadSectionKey, DictKey> = {
  overview: "lead.tab.overview",
  history: "lead.tab.conversation",
  tasks: "lead.tab.tasks",
  estimates: "lead.tab.estimates",
  files: "lead.tab.files",
};
/** `?tab=` of the address; an unknown one is the overview */
export const leadSectionOf = (s?: string): LeadSectionKey => (LEAD_SECTIONS.includes(s as LeadSectionKey) ? (s as LeadSectionKey) : "overview");

type SheetName = "won" | "close" | "reply" | "call" | "next" | "book" | "snooze" | "status" | "low" | null;
const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "#";

/** the panel beside the list on 1280 (spec 06): the lead's own content — «⋯» in the panel's header row, then «Сейчас», the sections strip and the open section */
export type LeadFrame = (parts: { more: ReactNode; now: ReactNode; tabs: ReactNode; body: ReactNode }) => ReactElement;

export function LeadObject({ l, section, onSection, back, frame }: { l: Lead; section: LeadSectionKey; onSection: (k: LeadSectionKey) => void; back: () => void; frame?: LeadFrame }) {
  useTick();
  const store = useStore();
  const { db, role } = store;
  const { t, day, time } = useI18n();
  const toast = useToast();
  const dial = useDialThenAsk();
  const [sheet, setSheet] = useState<SheetName>(null);
  const [taskEdit, setTaskEdit] = useState<TaskDraft | null>(null);
  // a form starts fresh at each opening — a counter that grows at the opening, not a key that flips at the close (#1163)
  const openCall = useOpening(sheet === "call");
  const openBook = useOpening(sheet === "book");
  const openSnooze = useOpening(sheet === "snooze");
  const openClose = useOpening(sheet === "close");
  const [winReason, setWinReason] = useState<ManualWinReason>("paper");
  const [winText, setWinText] = useState("");
  const q = (msg: string) => (store.online ? msg : t("offline.queued"));
  const settings = leadSettingsOf(db.company);
  const office = role !== "tech";
  const sv = leadStatusView[l.status];
  const turn = leadTurn(db, l, settings);
  const src = sourceOf(db, l.sourceId);
  const tel = cleanPhone(l.phone);
  const mail = mailtoHref(l.email);
  const addr = [l.address, l.city, l.state, l.zip].filter(Boolean).join(", ");
  const who = { role, mode: store.mode, me: db.me };
  // a tech: only the estimates the server shows him (canSeeEstimate, #1138); a new one only where he works (estimates_insert)
  const estimates = db.estimates.filter((e) => (e.leadId === l.id || (l.customerId && e.customerId === l.customerId)) && canSeeEstimate(db, who, e.id));
  const mayMakeEstimate = canMakeEstimateAt(db, who, leadEstimatePropertyId(db, l));
  const servable = canServe(db, l.customerId);
  const tasks = db.tasks.filter((x) => x.subjectType === "lead" && x.subjectId === l.id);
  const openTaskN = tasks.filter((x) => !x.doneAt).length;
  const visits = db.visits.filter((v) => v.leadId === l.id || (!!l.propertyId && visitPropertyId(db, v) === l.propertyId));
  const photos = visits.flatMap((v) => v.photos);
  const events = leadTimeline(db, l, db.me, t("acct.deletedName"));

  /* ---------- contact ---------- */
  const touch = (kind: "sms" | "email" | "marketplace", url?: string | null) => {
    if (url) Linking.openURL(url).catch(() => {});
    store.touchLead(l.id, kind);
  };
  const call = () => tel && dial(tel, () => setSheet("call"));
  const actions: IconRowItem[] = [
    { icon: "phone", label: t("client.call"), a11y: `${t("client.call")} ${l.name}`, onPress: call, disabled: !tel, reason: t("proto.leads.noPhone"), testID: "lead-call" },
    { icon: "sms", label: t("cc.sms"), a11y: `${t("cc.sms")} ${l.name}`, onPress: () => touch("sms", smsHref(l.phone)), disabled: !tel, reason: t("proto.leads.noPhone"), testID: "lead-sms" },
    { icon: "mail", label: t("proto.leads.mail"), a11y: `${t("lead.emailTo")} ${l.name}`, onPress: () => touch("email", mail), disabled: !mail, reason: t("proto.leads.noEmail"), testID: "lead-mail" },
    ...(addr ? [{ icon: "navigate" as const, label: t("client.route"), a11y: `${t("client.route")}: ${addr}`, onPress: () => Linking.openURL(mapsUrl(addr, Platform.OS as OS)).catch(() => {}), testID: "lead-route" }] : []),
    ...(src?.kind === "marketplace"
      ? [{ icon: "check" as const, label: t("proto.leads.answered"), a11y: t("lead.answeredIn", { source: src.name }), onPress: () => { touch("marketplace"); toast.show(q(t("proto.leads.answeredToast", { source: src.name }))); }, testID: "lead-answered" }]
      : []),
  ];

  /* ---------- the one main step ---------- */
  const makeEstimate = () => {
    if (!mayMakeEstimate) return void toast.show(t("est.tech.notHere"));
    const target = store.leadEstimateTarget(l.id);
    if (target) router.push(`/estimate/new?customerId=${target.customerId}&propertyId=${target.propertyId}&leadId=${l.id}`);
  };
  const remind = () => {
    const e = estimates.find((x) => x.status === "sent");
    Linking.openURL(smsHref(l.phone, t("lead.remindText", { name: l.name.split(" ")[0] ?? l.name, title: e?.title ?? "" }), Platform.OS) ?? "").catch(() => {});
    store.touchLead(l.id, "sms");
    toast.show(q(t("toast.reminded", { name: l.name })), store.markReminded(l.id));
  };
  const step = leadStepOf(l, turn, { servable, tech: role === "tech", lostReason: !!l.lostReason });
  const reasonOf = (s: LeadStep): string | undefined => {
    switch (s) {
      case "reply":
        return turn.kind === "reply" ? t("proto.leads.why.reply", { time: fmtWait(turn.minutes, t), n: settings.replyBadMin }) : undefined;
      case "client":
        return t(servable ? "proto.leads.why.won" : "proto.leads.why.noService");
      case "next":
        return t("proto.leads.why.next");
      case "lowOrWait":
        return t("proto.leads.why.low");
      case "remind":
        return turn.kind === "wait" ? t("proto.leads.why.remind", { n: turn.days }) : undefined;
      case "estimate":
        return turn.kind === "step" && turn.dueAt ? t("proto.leads.why.estimate", { date: day(turn.dueAt) }) : undefined;
      case "tasks":
        return turn.kind === "step" ? [turn.title, turn.dueAt ? `${day(turn.dueAt)} ${time(turn.dueAt)}` : undefined].filter(Boolean).join(" · ") || undefined : undefined;
      case "unsnooze":
        return turn.kind === "snoozed" ? t("lead.turn.snoozed", { date: day(turn.until) }) : undefined;
      case "reopen":
        return l.lostReason ? t("proto.leads.why.closed", { r: l.lostReason === "other" && l.lostReasonText ? l.lostReasonText : t(`lead.reason.${l.lostReason}` as DictKey) }) : undefined;
    }
  };
  const mainOf = (s: LeadStep): MainAction => {
    const base = { testID: `lead-next-${s}`, reason: reasonOf(s) };
    switch (s) {
      case "reply":
        return { ...base, label: t("inbox.reply"), onPress: () => setSheet("reply") };
      case "client":
        return { ...base, label: t("lead.openClient"), onPress: () => router.push(`/client/${l.customerId}`) };
      case "next":
        return { ...base, label: t("lead.next.title"), onPress: () => setSheet("next") };
      case "lowOrWait":
        return { ...base, label: t("lead.low.title"), onPress: () => setSheet("low") };
      case "remind":
        return { ...base, label: t("lead.remind"), onPress: remind };
      case "estimate":
        return { ...base, label: t("lead.makeEstimate"), onPress: makeEstimate };
      case "tasks": {
        // on «Задачи» itself the step is the task: «Выполнено» (with «Отменить»), not a jump to where you already are
        const first = openTasks(db, l.id)[0];
        if (section === "tasks" && first)
          return { ...base, label: t("w6.task.doneBtn"), onPress: () => toast.show(q(t("task.doneToast")), store.saveTask({ ...first, doneAt: new Date().toISOString() }).undo) };
        return { ...base, label: t("lead.tab.tasks"), onPress: () => onSection("tasks") };
      }
      case "unsnooze":
        return { ...base, label: t("lead.unsnooze"), onPress: () => toast.show(q(t("lead.unsnoozed")), store.unsnoozeLead(l.id)) };
      case "reopen":
        return { ...base, label: t("lead.reopen"), onPress: () => toast.show(q(t("lead.reopened", { name: l.name })), store.reopenLead(l.id)) };
    }
  };
  const main = step ? mainOf(step) : undefined;
  // «Потерян?» beside «Напомнить про смету» (object-cards: долго без ответа — вторая кнопка в ряд)
  const second: MainAction | undefined = step === "remind" ? { testID: "lead-next-lost", label: t("proto.leads.lost"), onPress: () => setSheet("low") } : undefined;

  /* ---------- «＋» and «⋯» ---------- */
  const open = isOpenLead(l);
  const newTask = () => setTaskEdit({ subjectType: "lead", subjectId: l.id, title: "", assigneeId: db.me, dueAt: dayAtHour(1, 9) });
  const create = open
    ? {
        a11y: t("proto.leads.createFor", { name: l.name }),
        items: [
          ...(mayMakeEstimate ? [{ key: "estimate", label: t("lead.makeEstimateShort"), icon: "invoice" as const, testID: "lead-create-estimate" }] : []),
          { key: "task", label: t("task.new"), icon: "check" as const, testID: "lead-create-task" },
          ...(office ? [{ key: "book", label: t("lead.next.book"), icon: "calendar" as const, testID: "lead-create-book" }] : []),
        ],
      }
    : undefined;
  const onCreate = (k: string) => (k === "estimate" ? makeEstimate() : k === "task" ? newTask() : setSheet("book"));
  const more: MoreAction = [
    { key: "status", label: t("lead.status.title"), icon: "tag", testID: "lead-act-status" },
    ...(open && office ? [{ key: "won", label: t("lead.makeClient"), icon: "userCheck" as const, testID: "lead-act-client" }] : []),
    ...(open ? [isSnoozed(l) ? { key: "unsnooze", label: t("lead.unsnooze"), icon: "refresh" as const, testID: "lead-act-unsnooze" } : { key: "snooze", label: t("lead.snooze.title"), icon: "clock" as const, testID: "lead-act-snooze" }] : []),
    ...(open ? [{ key: "close", label: t("lead.closeTitle"), icon: "close" as const, testID: "lead-act-close" }] : []),
  ];
  const onMore = (k: string) => {
    if (k === "unsnooze") return toast.show(q(t("lead.unsnoozed")), store.unsnoozeLead(l.id));
    setSheet(k as SheetName);
  };

  /* ---------- the strip ---------- */
  const sections = useMemo(
    () =>
      LEAD_SECTIONS.map((k) => ({
        key: k,
        label: t(SECTION_LABEL[k]),
        // a number only where it means something (object-cards: «Переписка 2 · Задачи 1»)
        count: k === "history" && events.length ? events.length : k === "tasks" && openTaskN ? openTaskN : k === "estimates" && estimates.length ? estimates.length : undefined,
      })),
    [t, events.length, openTaskN, estimates.length],
  );

  /* ---------- the header ---------- */
  const statusLabel = isClosedLead(l) && l.lostReason ? `${t(sv.label)}: ${l.lostReason === "other" && l.lostReasonText ? l.lostReasonText : t(`lead.reason.${l.lostReason}` as DictKey)}` : t(sv.label);
  const turnWord =
    turn.kind === "reply" ? t("proto.leads.turn.reply", { time: fmtWait(turn.minutes, t) })
    : turn.kind === "wait" ? t("lead.turn.wait", { n: turn.days })
    : turn.kind === "step" ? t(turn.status === "bad" ? "lead.turn.stepOverdue" : "lead.turn.step")
    : turn.kind === "noStep" ? t("lead.turn.noStep")
    : turn.kind === "snoozed" ? t("lead.turn.snoozed", { date: day(turn.until) })
    : null;

  const body =
    section === "history" ? (
      <View style={{ gap: space[4] }}>
        <NotesBlock subjectType="lead" subjectId={l.id} />
        {events.length ? <LeadHistory l={l} /> : <Empty icon="sms" title={t("lead.conv.empty")} />}
      </View>
    ) : section === "tasks" ? (
      <LeadTasks tasks={tasks} visitsOf={visits} onEdit={setTaskEdit} onNew={newTask} />
    ) : section === "estimates" ? (
      <LeadEstimatesList list={estimates} onNew={open && mayMakeEstimate ? makeEstimate : undefined} />
    ) : section === "files" ? (
      <LeadFiles photos={photos} />
    ) : (
      <View style={{ gap: space[6] }}>
        <LeadDups l={l} />
        <LeadOverview l={l} />
        <ServiceCategoryRow value={l.serviceCategoryId} onChange={(id) => toast.show(t("dir.changed"), store.updateLead(l.id, { serviceCategoryId: id }))} />
        <ListGroup title={t("lead.recent")} all={events.length > 3 ? { label: t("lead.recent.all"), onPress: () => onSection("history"), testID: "lead-recent-all" } : undefined} testID="lead-recent">
          {events.slice(0, 3).map((e) => (
            <GroupRow key={e.id} compact lead={{ icon: e.icon }} title={timelineText(e, t)} subtitle={`${day(e.at)} ${time(e.at)}`} testID={`lead-event-${e.id}`} />
          ))}
        </ListGroup>
        {/* add-on modules' place (docs/specs/33 П15): nothing unless a module is switched on */}
        <ModulePlaces place="lead" ctx={{ leadId: l.id, customerId: l.customerId, propertyId: l.propertyId }} />
      </View>
    );

  const nowCard = (

          // «чей ход» once — the card's title (the step's reason, else the turn's word); the step inside without it
          main || turnWord ? (
            <NowCard testID="lead-now" kicker={t("proto.client.now")} title={main?.reason ?? turnWord ?? statusLabel} main={main ? { ...main, reason: undefined } : undefined} second={second} />
          ) : undefined
        
  );
  const sheets = (
    <>
      <ReplySheet leadId={sheet === "reply" ? l.id : null} onClose={() => setSheet(null)} />
      <CallResultSheet key={`call-${openCall}`} l={l} visible={sheet === "call"} onClose={() => setSheet(null)} onAnswered={() => (isOpenLead(l) ? setSheet("next") : undefined)} />
      <NextStepSheet office={office} l={l} visible={sheet === "next"} onClose={() => setSheet(null)} onBook={() => setSheet("book")} onEstimate={makeEstimate} onCloseLead={() => setSheet("close")} />
      <BookSheet key={`book-${openBook}`} l={l} visible={sheet === "book"} onClose={() => setSheet(null)} />
      <SnoozeSheet key={`snooze-${openSnooze}`} l={l} visible={sheet === "snooze"} onClose={() => setSheet(null)} />
      <StatusSheet
        l={l}
        visible={sheet === "status"}
        onClose={() => setSheet(null)}
        onMakeClient={office ? () => setSheet("won") : undefined}
        onCloseLead={() => setSheet("close")}
        onSnooze={() => setSheet("snooze")}
      />
      <LostOrWaitSheet l={l} visible={sheet === "low"} onClose={() => setSheet(null)} />
      <CloseSheet key={`close-${openClose}`} l={l} visible={sheet === "close"} onClose={() => setSheet(null)} />
      <Sheet visible={sheet === "won"} onClose={() => setSheet(null)} title={t("lead.makeClient")}>
        <T v="caption" tone="mut">{t("lead.makeClientHint")}</T>
        <ChoiceChips value={winReason} onChange={setWinReason} items={MANUAL_WIN_REASONS.map((r) => ({ key: r, label: t(`lead.win.${r}` as DictKey) }))} />
        <TextField type="note" value={winText} onChangeText={setWinText} placeholder={t("lead.winComment")} />
        <Button
          label={t("lead.makeClient")}
          icon="check"
          full
          testID="lead-make-client"
          onPress={() => {
            const text = `${t("lead.wonManualNote")}: ${t(`lead.win.${winReason}` as DictKey)}${winText.trim() ? ` — ${winText.trim()}` : ""}`;
            toast.show(q(t("lead.convertedToast", { name: l.name })), store.convertLead(l.id, text));
            setSheet(null);
          }}
        />
      </Sheet>
      <TaskSheet value={taskEdit} onClose={() => setTaskEdit(null)} />
    </>
  );
  if (frame)
    return (
      <>
        {frame({
          more: <MoreButton items={more} onMore={onMore} testID="lead-more" />,
          now: nowCard,
          tabs: <ViewTabs testID="lead-screen-sections" items={sections} value={section} onChange={onSection} label={t("proto.leads.sections")} />,
          body,
        })}
        {sheets}
      </>
    );
  return (
    <>
      <ObjectScreen<LeadSectionKey>
        testID="lead-screen"
        back={back}
        header={{
          testID: "lead-header",
          title: l.name || "—",
          avatar: initials(l.name),
          status: { name: sv.status, label: statusLabel, onPress: () => setSheet("status") },
          labels: { expand: t("proto.client.expand"), collapse: t("proto.client.collapse"), more: (n) => t("cw4.moreTags", { n }) },
        }}
        actions={actions}
        now={nowCard}
        sections={sections}
        section={section}
        onSection={onSection}
        sectionsLabel={t("proto.leads.sections")}
        more={more}
        onMore={onMore}
        create={create}
        onCreate={onCreate}
      >
        {body}
      </ObjectScreen>

      {sheets}
    </>
  );
}

/** clients / leads found by the same phone or email — first in the overview, when there are any (object-cards «Лид») */
function LeadDups({ l }: { l: Lead }) {
  const { db, role } = useStore();
  const { t, day } = useI18n();
  // a tech sees only the duplicate leads he may see (canSeeLead, review #442) — one rule, unit-tested
  const dups = leadDuplicatesFor(db, role, l);
  // «do not service» (04 §4, §12): the client of this lead, or a client with the same phone / email
  const own = l.customerId ? db.customers.find((c) => c.id === l.customerId) : undefined;
  const closed = notServed([...(own ? [own] : []), ...dups.customers.filter((c) => c.id !== l.customerId)]);
  const closedIds = new Set(closed.map((c) => c.id));
  const clients = dups.customers.filter((c) => c.id !== l.customerId && !closedIds.has(c.id));
  return (
    <ListGroup title={t("proto.leads.dups")} testID="lead-dups">
      {closed.map((c) => (
        <GroupRow
          key={c.id}
          testID={`lead-noservice-${c.id}`}
          lead={{ icon: "alert" }}
          title={t("lead.noService", { name: c.name })}
          subtitle={c.statusReason ? t("client.reason", { r: c.statusReason }) : t("lead.noServiceHint")}
          status={{ status: "bad", label: t("client.st.doNotService") }}
          onPress={() => router.push(`/client/${c.id}`)}
        />
      ))}
      {clients.map((c) => (
        <GroupRow
          key={c.id}
          testID={`lead-dup-client-${c.id}`}
          lead={{ initials: initials(c.name) }}
          title={t("lead.alreadyClient", { name: c.name })}
          subtitle={t("lead.alreadyClientHint")}
          status={{ status: "warn", label: t("proto.leads.dupSign") }}
          onPress={() => router.push(`/client/${c.id}`)}
        />
      ))}
      {dups.leads.map((d) => (
        <GroupRow
          key={d.id}
          testID={`lead-dup-lead-${d.id}`}
          lead={{ initials: initials(d.name) }}
          title={t("lead.possibleDup", { date: day(d.receivedAt) })}
          subtitle={d.name}
          status={{ status: leadStatusView[d.status].status, label: t(leadStatusView[d.status].label) }}
          onPress={() => router.push(`/lead/${d.id}`)}
        />
      ))}
    </ListGroup>
  );
}

/** «Задачи»: open first, then the done ones (5); a swipe right — «Готово» / «Вернуть» with «Отменить»; the estimate visits under them */
function LeadTasks({ tasks, visitsOf, onEdit, onNew }: { tasks: Task[]; visitsOf: Visit[]; onEdit: (x: Task) => void; onNew: () => void }) {
  const store = useStore();
  const { db } = store;
  const { t, day, time } = useI18n();
  const toast = useToast();
  const open = tasks.filter((x) => !x.doneAt).sort((a, b) => (a.dueAt ?? "~").localeCompare(b.dueAt ?? "~"));
  const done = tasks.filter((x) => x.doneAt).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "")).slice(0, 5);
  const toggle = (x: Task) => toast.show(store.online ? t(x.doneAt ? "task.reopened" : "task.doneToast") : t("offline.queued"), store.saveTask({ ...x, doneAt: x.doneAt ? undefined : new Date().toISOString() }).undo);
  const row = (x: Task) => (
    <GroupRow
      key={x.id}
      compact
      testID={`lead-task-${x.id}`}
      lead={{ icon: x.doneAt ? "check" : "clock" }}
      title={x.title}
      subtitle={[x.dueAt ? `${day(x.dueAt)} ${time(x.dueAt)}` : t("task.noDate"), memberLabel(db.members.find((m) => m.id === x.assigneeId), t)].filter(Boolean).join(" · ")}
      status={isOverdueTask(x) ? { status: "bad", label: t("task.overdue") } : undefined}
      swipe={{ left: [{ key: "done", label: t(x.doneAt ? "swipe.reopen" : "swipe.done"), icon: x.doneAt ? "undo" : "check", tone: x.doneAt ? undefined : "ok", full: true, onPress: () => toggle(x), testID: `lead-task-done-${x.id}` }] }}
      onPress={() => onEdit(x)}
    />
  );
  return (
    <GroupedList testID="lead-tasks">
      {open.length ? (
        <ListGroup title={t("task.title")} all={{ label: t("task.new"), onPress: onNew, testID: "lead-task-new" }}>
          {open.map(row)}
        </ListGroup>
      ) : (
        <Empty icon="check" title={t("task.none")} action={<Button testID="lead-task-new" label={t("task.new")} icon="plus" variant="secondary" onPress={onNew} />} />
      )}
      <ListGroup title={t("task.doneList")}>{done.map(row)}</ListGroup>
      <ListGroup title={t("lead.visits")} testID="lead-visits">
        {visitsOf.map((v) => {
          const tech = db.members.find((m) => m.id === v.techId);
          const nobody = !liveAssignees(v, db.members).length;
          return (
            <GroupRow
              key={v.id}
              compact
              testID={`lead-visit-${v.id}`}
              lead={{ icon: "calendar" }}
              title={v.jobId ? db.jobs.find((j) => j.id === v.jobId)?.title || t("prop.h.visit") : t("st.inspection")}
              subtitle={[day(v.start), time(v.start), memberLabel(tech, t) ?? t("plan.unassigned")].filter(Boolean).join(" · ")}
              status={nobody ? { status: "warn", label: t("plan.unassigned") } : undefined}
              onPress={() => router.push(`/visit/${v.id}`)}
            />
          );
        })}
      </ListGroup>
    </GroupedList>
  );
}

/** «Сметы»: what each is for, «номер · отправлена · просмотрена», the sum (to who sees client money), its status */
function LeadEstimatesList({ list, onNew }: { list: Estimate[]; onNew?: () => void }) {
  const { role } = useStore();
  const { t, money, day } = useI18n();
  if (!list.length)
    return (
      <View testID="lead-estimates">
        <Empty icon="invoice" title={t("lead.noEstimates")} action={onNew ? <Button testID="lead-new-estimate" label={t("lead.makeEstimateShort")} icon="plus" variant="secondary" onPress={onNew} /> : undefined} />
      </View>
    );
  return (
    <View testID="lead-estimates">
      <ListGroup title={t("client.estimates")} all={onNew ? { label: t("lead.makeEstimateShort"), onPress: onNew, testID: "lead-new-estimate" } : undefined}>
        {list.map((e) => (
          <GroupRow
            key={e.id}
            testID={`lead-estimate-${e.id}`}
            lead={{ icon: "invoice" }}
            title={e.title || e.number || t("est.detail")}
            subtitle={[e.title ? e.number : undefined, e.sentAt ? `${t("st.sent")} ${day(e.sentAt)}` : undefined, e.viewedAt ? t("ue.viewed", { date: day(e.viewedAt) }) : undefined].filter(Boolean).join(" · ") || undefined}
            value={canSeeClientMoney(role) ? money(e.totalCents) : undefined}
            status={canSeeClientMoney(role) ? undefined : { status: estView[e.status].s, label: t(estView[e.status].l) }}
            onPress={() => router.push(`/estimate/${e.id}`)}
          />
        ))}
      </ListGroup>
    </View>
  );
}

/** «Файлы»: the photos taken on the lead's visits */
function LeadFiles({ photos }: { photos: Photo[] }) {
  const { t } = useI18n();
  const { c } = useTheme();
  if (!photos.length)
    return (
      <View testID="lead-files">
        <Empty icon="image" title={t("lead.noPhotos")} />
      </View>
    );
  return (
    <View testID="lead-files">
      <Grid>
        {photos.map((p) => (
          <View key={p.id} testID={`lead-photo-${p.id}`} style={{ height: component.mediaH, borderRadius: radius.inner, overflow: "hidden", backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}>
            {/* a dead `blob:` of a page that is gone (web, after a reload) is the picture sign, never loaded (features/photoUri) */}
            {liveUri(p.uri) ? <Image source={{ uri: liveUri(p.uri) }} style={{ width: "100%", height: "100%" }} /> : <Icon name="image" s={size.iconLg} color={c.mut} />}
          </View>
        ))}
      </Grid>
    </View>
  );
}

