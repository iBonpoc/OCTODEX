/**
 * Showcase section «Шаблоны экранов» of the prototype v2 (BUILD-PLAN §1 поток Г): one example of each of the five templates —
 * Обзор, Список, Объект, Редактор, Календарь — in its showcase frame (`preview`), on demo data. Each frame shows where the parts
 * always stand: «‹ назад» top left, «＋» and «⋯» on the right («⋯» last; «Удалить» asks first), the sections under the object's header,
 * ONE main button (an object's and an editor's — pinned at the bottom), search as an icon and the chips one strip in a list, the
 * day strip in the calendar. The names and sums are demo data, the words come from i18n.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { NO_UNDO } from "@/data/undo";
import { addDays, todayKey, type DayKey } from "@/features/calendar";
import type { DayLoad } from "@/features/planFeed";
import { Segmented, TextField } from "@/ui/controls";
import { GroupRow } from "@/ui/groupedList";
import { ListPanel } from "@/ui/listPanel";
import { useToast } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { Empty, FieldGroup } from "@/ui/surfaces";
import { CalendarScreen, EditorScreen, ListScreen, ObjectScreen, OverviewScreen } from "@/ui/templates";

/** demo people and sums (not UI words) */
const DEMO = [
  { id: "dk", name: "David Kim", initials: "DK", line: "Siding · 1420 Oak St", sum: "$1,240.00", group: "a" },
  { id: "mr", name: "Maria Rodriguez", initials: "MR", line: "Roof repair · 88 Pine Ave", sum: "$3,860.00", group: "a" },
  { id: "jl", name: "James Lee", initials: "JL", line: "Inspection · 7 Elm Ct", sum: "$0.00", group: "b" },
];

function Heading({ title, hint }: { title: string; hint: string }) {
  return (
    <View style={{ gap: space[1] }}>
      <T v="heading">{title}</T>
      <T v="caption" tone="mut">
        {hint}
      </T>
    </View>
  );
}

export function ProtoTemplates() {
  const { t } = useI18n();
  const toast = useToast();
  const said = (x: string) => () => toast.show(t("ds.proto.pressed", { x }), NO_UNDO);
  const pick = (k: string) => toast.show(t("ds.proto.pressed", { x: k }), NO_UNDO);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState("all");
  const [section, setSection] = useState<"overview" | "jobs" | "money" | "files">("overview");
  const [name, setName] = useState("");
  const [day, setDay] = useState<DayKey>(todayKey());
  const [view, setView] = useState("day");
  const loads = useMemo(() => new Map<DayKey, DayLoad>([[todayKey(), { n: 2, unassigned: 1 } as DayLoad], [addDays(todayKey(), 1), { n: 1, unassigned: 0 } as DayLoad]]), []);
  const create = { a11y: t("ds.tpl.create"), items: [{ key: "client", label: t("ds.tpl.newClient"), icon: "user" as const }, { key: "estimate", label: t("ds.proto.newEst"), icon: "doc" as const }] };
  const bell = { icon: "bell" as const, a11y: t("ds.tpl.bell"), onPress: said(t("ds.tpl.bell")), testID: "tpl-demo-bell" };
  // wave 3: the bell with its count (a status colour WITH the number), the a11y says it too
  const bellN = { ...bell, a11y: t("ds.proto.bellN", { n: 3 }), badge: { n: 3 }, testID: "tpl-demo-bell-n" };
  const more = [
    { key: "archive", label: t("ds.tpl.archive"), icon: "inbox" as const },
    { key: "delete", label: t("ds.tpl.delete"), icon: "trash" as const, destructive: true },
  ];
  const found = DEMO.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()));
  const row = (d: (typeof DEMO)[number]) => ({ key: d.id, title: d.name, subtitle: d.line, lead: { initials: d.initials }, value: d.sum, onPress: said(d.name), testID: `tpl-demo-row-${d.id}` });
  return (
    <View style={{ gap: space[6] }} testID="showcase-proto-templates">
      <Heading title={t("ds.tpl.overview")} hint={t("ds.tpl.overviewHint")} />
      <OverviewScreen
        preview
        testID="tpl-overview"
        title={t("ds.tpl.home")}
        greeting={{ initials: "AP", text: t("ds.proto.greet"), date: "Fri, Nov 21", onAvatar: said(t("ds.proto.more")), avatarLabel: t("ds.proto.more") }}
        headerIcons={[bellN]}
        create={create}
        onCreate={pick}
        next={{
          kicker: `${t("ds.tpl.next")} · 8:30–12:30`,
          when: t("ds.tpl.in10"),
          title: DEMO[0]!.name,
          sub: DEMO[0]!.line,
          main: { label: t("ds.tpl.onTheWay"), onPress: said(t("ds.tpl.onTheWay")), testID: "tpl-overview-main" },
        }}
        attention={{
          title: t("ds.tpl.attention"),
          all: { label: t("ds.tpl.all"), onPress: said(t("ds.tpl.all")) },
          rows: DEMO.map(({ ...d }) => { const { key, ...r } = row(d); return <GroupRow key={key} {...r} status={{ status: "bad", label: t("ds.proto.owes") }} value={undefined} />; }).concat(
            <GroupRow key="x" title="Ann Park" subtitle="Water heater · 5 Bay Rd" lead={{ initials: "AP" }} />,
          ),
        }}
        summary={[
          { label: t("ds.proto.jobs"), value: "3", testID: "tpl-sum-jobs" },
          { label: t("ds.proto.debt"), value: "$1,840.00", status: "bad", testID: "tpl-sum-debt" },
        ]}
        details={{ title: t("ds.proto.details"), children: <T v="body">{t("ds.proto.detailsText")}</T> }}
      />

      <Heading title={t("ds.tpl.list")} hint={t("ds.tpl.listHint")} />
      <ListScreen
        preview
        testID="tpl-list"
        title={t("ds.tpl.clients")}
        create={create}
        onCreate={pick}
        search={{ placeholder: t("ds.tpl.searchClients"), value: query, onChange: setQuery }}
        chips={{ items: [{ key: "all", label: t("ds.tpl.chipAll") }, { key: "debt", label: t("ds.proto.owes") }, { key: "new", label: t("ds.tpl.chipNew") }, { key: "vip", label: t("ds.proto.vip") }], value: chip, onChange: setChip }}
        groups={[
          { key: "a", title: t("ds.tpl.groupActive"), rows: found.filter((d) => d.group === "a") },
          { key: "b", title: t("ds.tpl.groupQuiet"), rows: found.filter((d) => d.group === "b") },
        ]}
        row={row}
        more={[{ key: "sort", label: t("ds.tpl.sort"), icon: "sliders" as const }]}
        onMore={pick}
        empty={<Empty icon="search" title={t("ds.tpl.nothing")} />}
        aside={
          <ListPanel title={DEMO[0]!.name} onOpen={said(t("ds.tpl.aside"))} onClose={said(t("common.close"))}>
            <T v="body" tone="mut">
              {t("ds.tpl.asideBody")}
            </T>
          </ListPanel>
        }
      />
      <T v="caption" tone="mut">
        {t("ds.tpl.aside")}
      </T>
      {/* visual v2 Деньги (макет 6): the parts of a tab — a Segmented 36 across the width, not a chips strip (`chipsAs="segment"`) */}
      <ListScreen
        preview
        testID="tpl-list-seg"
        title={t("ds.v2.owed")}
        search={{ placeholder: t("ds.tpl.searchClients"), value: query, onChange: setQuery }}
        chips={{ items: [{ key: "all", label: t("ds.tpl.chipAll") }, { key: "debt", label: t("ds.proto.owes") }, { key: "new", label: t("ds.tpl.chipNew") }], value: chip === "vip" ? "all" : chip, onChange: setChip }}
        chipsAs="segment"
        groups={[{ key: "a", title: t("ds.tpl.groupActive"), rows: found.filter((d) => d.group === "a") }]}
        row={row}
        empty={<Empty icon="search" title={t("ds.tpl.nothing")} />}
      />

      <Heading title={t("ds.tpl.object")} hint={t("ds.tpl.objectHint")} />
      <ObjectScreen
        preview
        testID="tpl-object"
        back={said(t("common.back"))}
        header={{
          testID: "tpl-object-header",
          title: DEMO[0]!.name,
          avatar: DEMO[0]!.initials,
          status: { name: "bad", label: t("ds.proto.owes") },
          meta: [{ id: "vip", label: t("ds.proto.vip") }],
          amount: "$1,840.00",
          address: { text: "1420 Oak St, Austin", onPress: said(t("ds.proto.route")) },
          labels: { expand: t("ds.proto.expand"), collapse: t("ds.proto.collapse"), more: (n) => t("ds.proto.moreN", { n }), edit: t("ds.proto.edit") },
        }}
        actions={[
          { icon: "phone", label: t("ds.proto.call"), a11y: `${t("ds.proto.call")} ${DEMO[0]!.name}`, onPress: said(t("ds.proto.call")), testID: "tpl-object-call" },
          { icon: "message", label: t("ds.proto.sms"), a11y: `${t("ds.proto.sms")} ${DEMO[0]!.name}`, onPress: said(t("ds.proto.sms")), testID: "tpl-object-sms" },
          { icon: "route", label: t("ds.proto.route"), a11y: `${t("ds.proto.route")} ${DEMO[0]!.name}`, onPress: said(t("ds.proto.route")), testID: "tpl-object-route" },
        ]}
        sections={[
          { key: "overview", label: t("ds.tpl.secOverview") },
          { key: "jobs", label: t("ds.proto.jobs"), count: 1 },
          { key: "money", label: t("ds.tpl.secMoney") },
          { key: "files", label: t("ds.tpl.secFiles") },
        ]}
        section={section}
        onSection={setSection}
        sectionsLabel={t("ds.tpl.sections")}
        main={{ label: `${t("ds.proto.issue")} · $3,078.00`, onPress: said(t("ds.proto.issue")), reason: t("ds.proto.issueReason"), testID: "tpl-object-main" }}
        second={{ label: t("ds.proto.newEst"), onPress: said(t("ds.proto.newEst")), testID: "tpl-object-second" }}
        create={create}
        onCreate={pick}
        more={more}
        onMore={pick}
      >
        <View testID={`tpl-object-section-${section}`}>
          <T v="body" tone="mut">
            {t("ds.tpl.sectionBody", { x: section })}
          </T>
        </View>
      </ObjectScreen>

      <Heading title={t("ds.tpl.editor")} hint={t("ds.tpl.editorHint")} />
      <EditorScreen
        preview
        testID="tpl-editor"
        title={t("ds.tpl.newClient")}
        back={said(t("common.back"))}
        dirty={name !== ""}
        save={{ label: t("ds.tpl.save"), onPress: said(t("ds.tpl.save")), disabled: name === "", reason: name === "" ? t("ds.tpl.saveReason") : undefined, testID: "tpl-editor-save" }}
        more={more}
        onMore={pick}
      >
        <FieldGroup title={t("ds.tpl.who")}>
          <TextField testID="tpl-editor-name" type="title" value={name} onChangeText={setName} placeholder={t("ds.tpl.namePh")} label={t("ds.tpl.namePh")} />
        </FieldGroup>
      </EditorScreen>

      <Heading title={t("ds.tpl.calendar")} hint={t("ds.tpl.calendarHint")} />
      <CalendarScreen
        preview
        testID="tpl-calendar"
        title={t("ds.tpl.plan")}
        headerIcons={[bell]}
        create={create}
        onCreate={pick}
        views={<Segmented testID="tpl-calendar-views" items={[{ key: "day", label: t("ds.tpl.vDay") }, { key: "week", label: t("ds.tpl.vWeek") }, { key: "month", label: t("ds.tpl.vMonth") }]} value={view} onChange={setView} full />}
        view={view === "week" || view === "month" ? view : "day"}
        day={day}
        onDay={setDay}
        loads={loads}
        dayTitle={t("ds.tpl.today")}
        body={view === "day" ? undefined : <Empty icon="calendar" title={t("ds.tpl.viewBody")} />}
        unassigned={{ label: t("ds.tpl.unassigned", { n: 1 }), onPress: said(t("ds.tpl.unassigned", { n: 1 })) }}
        items={
          day === todayKey()
            ? DEMO.slice(0, 2).map((d) => <GroupRow key={d.id} title={d.name} subtitle={d.line} lead={{ time: "8:30", sub: "AM" }} onPress={said(d.name)} />)
            : []
        }
        empty={<Empty icon="calendar" title={t("ds.tpl.freeDay")} />}
        undated={{ label: t("ds.tpl.undated", { n: 3 }), onPress: said(t("ds.tpl.undated", { n: 3 })) }}
      />
    </View>
  );
}
