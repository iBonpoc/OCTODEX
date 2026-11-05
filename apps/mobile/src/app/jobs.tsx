import { useState } from "react";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import type { Job, JobStatus } from "@/data/types";
import { useI18n } from "@/i18n";
import { jobStatusView } from "@/features/jobs";
import { jobEstimateNumber, nextVisitOf, visitPeople } from "@/features/jobList";
import { categoryLabel } from "@/features/serviceCategories";
import { ChoiceChips } from "@/ui/controls";
import { CardList, Empty, Screen } from "@/ui/surfaces";
import { CardGrid, ListCard, ListCardHeader } from "@/ui/listCard";
import type { FactKey } from "@/ui/listCardLayout";
import { useDevice } from "@/theme/ThemeProvider";

type Filter = "unscheduled" | "scheduled" | "in_progress" | "done";
const FILTERS: Filter[] = ["unscheduled", "scheduled", "in_progress", "done"];
/** desktop row columns (docs/specs/06-list-cards.md, «Работы») */
const COLUMNS: FactKey[] = ["addr", "work", "when", "resp"];

/** All jobs by stage: waiting for a date → scheduled → in progress → done. Each job is a list card (spec 06, PR8). */
export default function Jobs() {
  const { db, role } = useStore();
  const { t, money, day } = useI18n();
  const { device } = useDevice();
  // the tech never sees amounts (spec 06 §7.6)
  const office = role !== "tech";
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  const work = db.jobs;
  const count = (f: Filter) => work.filter((j) => j.status === f).length;
  const [f, setF] = useState<Filter>(count("unscheduled") ? "unscheduled" : "scheduled");
  const list = work.filter((j) => j.status === f);
  const card = (j: Job) => {
    const p = db.properties.find((x) => x.id === j.propertyId);
    const c = db.customers.find((x) => x.id === p?.customerId);
    const v = nextVisitOf(db, j.id);
    const st = jobStatusView[j.status];
    const addr = p ? `${p.address}, ${p.city}` : undefined;
    const trade = categoryLabel(db.serviceCategories.find((x) => x.id === j.serviceCategoryId), t as never);
    return (
      <ListCard
        key={j.id}
        title={c?.name ?? "—"}
        lead={{ kind: "icon", icon: "wrench" }}
        value={office ? money(j.amountCents) : undefined}
        valueLabel={office ? t("card.val.total") : undefined}
        // read only: a job has no hand moves (statusMoves) — the date comes from scheduling, «done» from the visit's payment
        status={{ tone: st.status, label: t(st.label) }}
        trade={trade || undefined}
        facts={{
          phone: c?.phone,
          email: c?.phone ? undefined : c?.email,
          addr,
          work: j.title,
          when: v && j.status !== "unscheduled" ? day(v.start) : undefined,
          resp: visitPeople(db, v).map((m) => m.name).join(", ") || undefined,
          links: jobEstimateNumber(db, j),
        }}
        // contact buttons only open the phone / map / mail: nothing is written
        contact={{ phone: c?.phone, email: c?.email, addr }}
        density={device === "desktop" ? "row" : "rich"}
        columns={COLUMNS}
        onPress={() => router.push(`/job/${j.id}`)}
      />
    );
  };
  return (
    <Screen title={t("jobs.title")} back={back} help={t("jobs.help")} hintKey="jobs">
      <ChoiceChips value={f} onChange={setF} items={FILTERS.map((k) => ({ key: k, label: `${t(jobStatusView[k as JobStatus].label)} · ${count(k)}` }))} />
      {list.length === 0 ? (
        <Empty icon="wrench" title={t("jobs.empty")} />
      ) : device === "tablet" ? (
        <CardGrid>{list.map(card)}</CardGrid>
      ) : (
        <>
          {device === "desktop" ? <ListCardHeader title={t("card.fact.client")} columns={COLUMNS} value={office ? t("card.val.total") : undefined} /> : null}
          <CardList>{list.map(card)}</CardList>
        </>
      )}
    </Screen>
  );
}
