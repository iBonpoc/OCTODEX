import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { ID } from "@/data/types";
import { useI18n } from "@/i18n";
import { uid } from "@/features/estimateDoc";
import { daysSince, SCHEDULE_DEFAULTS, waitingJobs, type PlanWho } from "@/features/schedule";
import { VisitFormSheet } from "@/features/VisitForm";
import { Button, ChoiceChips, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { CardList, Divider, ItemCard, ListRow } from "@/ui/surfaces";

/**
 * Parts of the Plan tab for the office (docs/specs/03 §7.2, wave П3b): «Ждут даты», «Чей план», «+».
 * Only for those who plan (canPlan): a tech and sales never see them.
 */

/** «Ждут даты · N» (S8b / S9a on the screen): jobs without a date, the oldest first → «Запланировать» */
export function WaitingJobs() {
  const { db } = useStore();
  const { t, money } = useI18n();
  const [all, setAll] = useState(false);
  const list = waitingJobs(db);
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 2);
  return (
    <View style={{ gap: space[2] }}>
      <T v="heading" tone="warn">
        {t("plan.waiting", { n: list.length })}
      </T>
      <CardList>
        {shown.map(({ job, since }) => {
          const property = db.properties.find((p) => p.id === job.propertyId);
          const customer = db.customers.find((c) => c.id === property?.customerId);
          const d = daysSince(since);
          const ago = d === null ? undefined : d === 0 ? t("plan.signedToday") : t("plan.signedAgo", { n: d });
          return (
            <ItemCard
              key={job.id}
              title={customer?.name ?? job.title}
              subtitle={[job.title, money(job.amountCents), ago].filter(Boolean).join(" · ")}
              right={<Button label={t("plan.schedule")} icon="calendar" size="sm" variant="secondary" onPress={() => router.push(`/job/schedule?jobId=${job.id}`)} />}
              onPress={() => router.push(`/job/${job.id}`)}
            />
          );
        })}
      </CardList>
      {list.length > 2 && !all ? <Button label={t("plan.showAll")} variant="ghost" size="sm" onPress={() => setAll(true)} /> : null}
    </View>
  );
}

/** «Чей план»: Все · Я · people (techs of the company) */
export function PlanWhoChips({ who, onChange }: { who: PlanWho; onChange: (w: PlanWho) => void }) {
  const { db } = useStore();
  const { t } = useI18n();
  const people = db.members.filter((m) => m.roles.includes("tech") && !m.pending && m.id !== db.me);
  const meTech = db.members.some((m) => m.id === db.me && m.roles.includes("tech"));
  return (
    <ChoiceChips
      value={who}
      onChange={onChange}
      items={[
        { key: "all", label: t("plan.who.all") },
        ...(meTech ? [{ key: "me", label: t("plan.who.me") }] : []),
        ...people.map((m) => ({ key: m.id, label: m.name.split(" ")[0] ?? m.name })),
      ]}
    />
  );
}

/** «+»: what to put in the plan — an inspection at a property (the visit form) or a job from «Ждут даты» */
export function PlanAddSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const store = useStore();
  const { db } = store;
  const { t, day, time } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [propertyId, setPropertyId] = useState<ID | null>(null);
  const waiting = waitingJobs(db);
  const needle = q.trim().toLowerCase();
  const properties = db.properties
    .map((p) => ({ p, c: db.customers.find((c) => c.id === p.customerId) }))
    .filter(({ p, c }) => !needle || `${c?.name ?? ""} ${p.address} ${p.city}`.toLowerCase().includes(needle))
    .slice(0, 8);
  const close = () => { setQ(""); onClose(); };
  return (
    <>
      <Sheet visible={visible && !propertyId} onClose={close} title={t("plan.addTitle")}>
        <View style={{ gap: space[3] }}>
          {waiting.length ? (
            <View>
              <T v="heading">{t("plan.addJob")}</T>
              {waiting.map(({ job }, i) => (
                <View key={job.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow title={job.title} subtitle={db.customers.find((c) => c.id === db.properties.find((p) => p.id === job.propertyId)?.customerId)?.name} onPress={() => { close(); router.push(`/job/schedule?jobId=${job.id}`); }} />
                </View>
              ))}
            </View>
          ) : null}
          <T v="heading">{t("plan.addInspection")}</T>
          <TextField type="search" value={q} onChangeText={setQ} placeholder={t("plan.search")} icon="search" />
          <View>
            {properties.map(({ p, c }, i) => (
              <View key={p.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow title={c?.name ?? p.address} subtitle={[p.address, p.city].filter(Boolean).join(", ")} onPress={() => setPropertyId(p.id)} />
              </View>
            ))}
          </View>
        </View>
      </Sheet>
      {propertyId ? (
        <VisitFormSheet
          visible
          onClose={() => { setPropertyId(null); close(); }}
          title={t("vf.addInspection")}
          saveLabel={t("lead.next.book")}
          init={{ durationMin: SCHEDULE_DEFAULTS.inspectionMin, propertyId }}
          onSave={(v) => {
            const visitId = uid();
            const r = store.addInspection(propertyId, { ...v, visitId });
            toast.show(t("vf.inspectionSaved", { date: day(v.start), time: time(v.start) }), r.undo);
            return visitId;
          }}
        />
      ) : null}
    </>
  );
}
