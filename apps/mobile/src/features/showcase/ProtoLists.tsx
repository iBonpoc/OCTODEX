/**
 * Showcase section «Список и календарь» of the prototype v2 (BUILD-PLAN §1 поток В): GroupedList / ListGroup / GroupRow,
 * DayStrip, StatGrid / StatTile, StatusPill, NowCard, ChoiceChips layout="strip". Registered by поток А (registry.ts).
 * The names and sums are demo data, the words come from i18n.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { space, type StatusName } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { todayKey, addDays, type DayKey } from "@/features/calendar";
import type { DayLoad } from "@/features/planFeed";
import { ChoiceChips } from "@/ui/controls";
import { DayStrip } from "@/ui/dayStrip";
import { GroupedList, GroupRow, ListGroup } from "@/ui/groupedList";
import { NowCard } from "@/ui/nowCard";
import { StatGrid, StatTile } from "@/ui/statTile";
import { StatusPill } from "@/ui/statusPill";
import { useToast } from "@/ui/overlays";
import { NO_UNDO } from "@/data/undo";

/** demo people of the samples (not UI words) */
const DEMO = [
  { id: "dk", name: "David Kim", initials: "DK", line: "Siding · 1420 Oak St", cents: "$1,240.00", st: "sent" as const },
  { id: "mr", name: "Maria Rodriguez", initials: "MR", line: "Roof repair · 88 Pine Ave", cents: "$3,860.00", st: "paid" as const },
  { id: "jl", name: "James Lee", initials: "JL", line: "Inspection · 7 Elm Ct", cents: "$0.00", st: "overdue" as const },
];
const TONE: Record<(typeof DEMO)[number]["st"], StatusName> = { sent: "info", paid: "ok", overdue: "bad" };

export function ProtoLists() {
  const { t } = useI18n();
  const toast = useToast();
  const [date, setDate] = useState<DayKey>(todayKey());
  const [chip, setChip] = useState("all");
  const [tile, setTile] = useState("overdue");
  const loads = useMemo(() => new Map<DayKey, DayLoad>([[todayKey(), { n: 3, unassigned: 1 } as DayLoad], [addDays(todayKey(), 2), { n: 1, unassigned: 0 } as DayLoad]]), []);
  const said = (label: string) => () => toast.show(label, NO_UNDO);
  return (
    <View style={{ gap: space[6] }} testID="showcase-proto-lists">
      <DayStrip date={date} loads={loads} onPick={setDate} testID="showcase-day-strip" />
      <ChoiceChips
        layout="strip"
        testID="showcase-chips-strip"
        value={chip}
        onChange={setChip}
        items={[
          { key: "all", label: t("cat.all") },
          { key: "est", label: t("nav.estimates") },
          { key: "inv", label: t("nav.invoices") },
          { key: "leads", label: t("nav.leads") },
          { key: "visits", label: t("tab.visits") },
        ]}
      />
      <NowCard
        testID="showcase-now-card"
        kicker={`${t("tday.now")} · 8:30–12:30`}
        status={{ status: "info", label: t("st.sent") }}
        title={DEMO[0]!.name}
        sub={DEMO[0]!.line}
        address={{ text: "1420 Oak St", a11y: "1420 Oak St", onPress: said("1420 Oak St") }}
        main={{ label: t("visit.call"), onPress: said(t("visit.call")), testID: "showcase-now-main" }}
      />
      <StatGrid testID="showcase-stat-grid">
        <StatTile label={t("money.overdue")} value="$4,120" pastel="peach" warn={t("st.overdue")} selected={tile === "overdue"} onPress={() => setTile("overdue")} testID="showcase-tile-overdue" />
        <StatTile label={t("visit.amountDue")} value="$9,800" pastel="butter" selected={tile === "due"} onPress={() => setTile("due")} testID="showcase-tile-due" />
        <StatTile label={t("st.paid")} value="$22,300" pastel="mint" selected={tile === "paid"} onPress={() => setTile("paid")} testID="showcase-tile-paid" />
        <StatTile label={t("st.draft")} value={0} pastel="lav" testID="showcase-tile-zero" />
      </StatGrid>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
        <StatusPill status="ok" label={t("st.paid")} />
        <StatusPill status="info" label={t("st.sent")} />
        <StatusPill status="warn" label={t("st.late")} />
        <StatusPill status="bad" label={t("st.overdue")} />
        <StatusPill status="neutral" label={t("st.draft")} onPress={said(t("st.draft"))} testID="showcase-pill-press" />
      </View>
      <GroupedList testID="showcase-grouped">
        <ListGroup title={t("nav.clients")} all={{ label: t("cat.all"), onPress: said(t("cat.all")), testID: "showcase-group-all" }}>
          {DEMO.map((d) => (
            <GroupRow
              key={d.id}
              testID={`showcase-row-${d.id}`}
              title={d.name}
              subtitle={d.line}
              lead={{ initials: d.initials }}
              value={d.cents}
              status={{ status: TONE[d.st], label: t(`st.${d.st}`) }}
              onPress={said(d.name)}
              swipe={{
                left: [{ key: "done", label: t("st.done"), icon: "check", tone: "ok", full: true, onPress: said(t("st.done")) }],
                right: [{ key: "del", label: t("est.draft.delete"), icon: "trash", tone: "bad", onPress: said(t("est.draft.delete")) }],
              }}
            />
          ))}
        </ListGroup>
        <ListGroup title={t("tab.visits")}>
          <GroupRow
            testID="showcase-row-quick"
            title={DEMO[1]!.name}
            subtitle={DEMO[1]!.line}
            lead={{ icon: "calendar" }}
            actions={[
              { icon: "phone", a11y: `${t("client.call")} ${DEMO[1]!.name}`, onPress: said(t("client.call")), testID: "showcase-row-call" },
              { icon: "message", a11y: `${t("ue.sendSms")} ${DEMO[1]!.name}`, onPress: said(t("ue.sendSms")), testID: "showcase-row-sms" },
            ]}
          />
          <GroupRow compact title={DEMO[2]!.name} subtitle={DEMO[2]!.line} lead={{ icon: "calendar" }} onPress={said(DEMO[2]!.name)} testID="showcase-row-compact" />
        </ListGroup>
      </GroupedList>
    </View>
  );
}
