import { useState } from "react";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import type { Job, JobStatus } from "@/data/types";
import { useI18n } from "@/i18n";
import { jobStatusView } from "@/features/jobs";
import { ChoiceChips, StatusChip } from "@/ui/controls";
import { CardList, Empty, ItemCard, Screen } from "@/ui/surfaces";

type Filter = "unscheduled" | "scheduled" | "in_progress" | "done";
const FILTERS: Filter[] = ["unscheduled", "scheduled", "in_progress", "done"];

/** All jobs by stage: waiting for a date → scheduled → in progress → done. Each job is a card. */
export default function Jobs() {
  const { db } = useStore();
  const { t, money, day } = useI18n();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  const work = db.jobs;
  const count = (f: Filter) => work.filter((j) => j.status === f).length;
  const [f, setF] = useState<Filter>(count("unscheduled") ? "unscheduled" : "scheduled");
  const nextVisit = (j: Job) =>
    db.visits.filter((v) => v.jobId === j.id).sort((a, b) => a.start.localeCompare(b.start)).find((v) => v.step !== "paid") ?? db.visits.find((v) => v.jobId === j.id);
  const list = work.filter((j) => j.status === f);
  return (
    <Screen title={t("jobs.title")} back={back} help={t("jobs.help")} hintKey="jobs">
      <ChoiceChips value={f} onChange={setF} items={FILTERS.map((k) => ({ key: k, label: `${t(jobStatusView[k as JobStatus].label)} · ${count(k)}` }))} />
      {list.length === 0 ? (
        <Empty icon="wrench" title={t("jobs.empty")} />
      ) : (
        <CardList>
          {list.map((j) => {
            const p = db.properties.find((x) => x.id === j.propertyId);
            const c = db.customers.find((x) => x.id === p?.customerId);
            const v = nextVisit(j);
            const st = jobStatusView[j.status];
            return (
              <ItemCard
                key={j.id}
                status={st.status}
                title={`${c?.name ?? "—"} · ${j.title}`}
                subtitle={[money(j.amountCents), v ? day(v.start) : t("st.toSchedule"), p?.address].filter(Boolean).join(" · ")}
                right={<StatusChip status={st.status} label={t(st.label)} />}
                onPress={() => router.push(`/job/${j.id}`)}
              />
            );
          })}
        </CardList>
      )}
    </Screen>
  );
}
