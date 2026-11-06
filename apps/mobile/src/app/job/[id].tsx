import { lateAfterOf } from "@/features/scheduleSettings";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space } from "@octo/design-tokens";
import { jobProfit, useStore } from "@/data/store";
import { canSeeProfit } from "@/nav/roles";
import { useI18n } from "@/i18n";
import { ContractStatement } from "@/features/ContractStatement";
import { jobStatusView } from "@/features/jobs";
import { NotesBlock } from "@/features/NotesBlock";
import { ServiceCategoryRow } from "@/features/ServiceCategoryPicker";
import { useToast } from "@/ui/overlays";
import { visitStatus } from "@/features/visits";
import { Button, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, CardList, Empty, ItemCard, RowView, Screen, SectionTitle } from "@/ui/surfaces";

/** Job card: client & address, visits, contract statement (invoices / receipts), expenses & profit, notes. */
export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db } = store;
  const { t, money, day, time } = useI18n();
  const toast = useToast();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/jobs"));
  const j = db.jobs.find((x) => x.id === id);
  if (!j)
    return (
      <Screen title={t("jobs.title")} back={back}>
        <Empty icon="wrench" title={t("clients.empty")} />
      </Screen>
    );
  const p = db.properties.find((x) => x.id === j.propertyId);
  const c = db.customers.find((x) => x.id === p?.customerId);
  const visits = db.visits.filter((v) => v.jobId === j.id).sort((a, b) => a.start.localeCompare(b.start));
  const expenses = db.expenses.filter((x) => x.jobId === j.id);
  const pr = jobProfit(db, j.id);
  const st = jobStatusView[j.status];
  const tel = (c?.phone ?? "").replace(/[^\d+]/g, "");
  const addr = [p?.address, p?.city].filter(Boolean).join(", ");
  const showMoney = canSeeProfit(store.role);
  return (
    <Screen title={j.title} back={back} subtitle={c?.name} fab="job" fabCtx={{ jobId: j.id, customerId: c?.id, propertyId: p?.id }}>
      <Card status={st.status}>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="body" tone="mut" style={{ flex: 1 }}>
            {addr}
          </T>
          <StatusChip status={st.status} label={t(st.label)} />
        </RowView>
        {showMoney ? (
          <T v="title" tabular>
            {money(j.amountCents)}
          </T>
        ) : null}
        <RowView style={{ flexWrap: "wrap" }}>
          {tel ? <Button label={t("client.call")} icon="phone" variant="secondary" onPress={() => Linking.openURL(`tel:${tel}`)} /> : null}
          {addr ? <Button label={t("jobs.route")} icon="route" variant="secondary" onPress={() => Linking.openURL(`https://maps.apple.com/?daddr=${encodeURIComponent(addr)}`)} /> : null}
          {c ? <Button label={t("jobs.client")} icon="user" variant="ghost" onPress={() => router.push(`/client/${c.id}`)} /> : null}
          {j.estimateId ? <Button label={t("est.detail")} icon="invoice" variant="ghost" onPress={() => router.push(`/estimate/${j.estimateId}`)} /> : null}
        </RowView>
      </Card>

      <SectionTitle
        title={t("jobs.visits")}
        right={<Button label={visits.length ? t("sch.another") : t("sch.title")} icon="calendar" size="sm" variant={visits.length ? "ghost" : "primary"} onPress={() => router.push(`/job/schedule?jobId=${j.id}`)} />}
      />
      {visits.length ? (
        <CardList>
          {visits.map((v) => {
            const vs = visitStatus(v, Date.now(), lateAfterOf(db));
            const tech = db.members.find((m) => m.id === v.techId);
            return (
              <ItemCard
                key={v.id}
                status={vs.status}
                title={`${day(v.start)} · ${time(v.start)}`}
                subtitle={[tech?.name ?? t("sch.noTech"), `${v.durationMin} ${t("sch.min")}`].join(" · ")}
                right={<StatusChip status={vs.status} label={t(vs.label)} />}
                onPress={() => router.push(`/visit/${v.id}`)}
              />
            );
          })}
        </CardList>
      ) : (
        <T v="caption" tone="mut">
          {t("ue.toSchedule")}
        </T>
      )}

      {showMoney && j.amountCents > 0 ? <ContractStatement jobId={j.id} /> : null}

      {showMoney ? (
        <View style={{ gap: space[2] }}>
          <SectionTitle title={t("jobs.costs")} right={<Button label={t("quick.receipt")} icon="plus" size="sm" variant="ghost" onPress={() => router.push("/expense/new")} />} />
          {expenses.length ? (
            <CardList>
              {expenses.map((x) => (
                <ItemCard key={x.id} title={x.vendor} subtitle={`${t(`exp.cat.${x.category}`)} · ${day(x.at)}`} right={<T v="body" tabular>{money(x.amountCents)}</T>} />
              ))}
            </CardList>
          ) : null}
          <Card>
            <RowView style={{ justifyContent: "space-between" }}>
              <T v="body" tone="mut">
                {t("jobs.expenses")}
              </T>
              <T v="body" tabular>
                {money(pr.expenses)}
              </T>
            </RowView>
            <RowView style={{ justifyContent: "space-between" }}>
              <T v="heading">{t("jobs.profit")}</T>
              <T v="title" tabular tone={pr.profit < 0 ? "bad" : "ink"}>
                {money(pr.profit)}
                {pr.marginPct !== null ? ` · ${pr.marginPct}%` : ""}
              </T>
            </RowView>
          </Card>
        </View>
      ) : null}

      <ServiceCategoryRow value={j.serviceCategoryId} onChange={(id) => toast.show(t("dir.changed"), store.setJobCategory(j.id, id))} />
      <NotesBlock subjectType="job" subjectId={j.id} />
    </Screen>
  );
}
