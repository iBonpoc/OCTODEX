import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space, type StatusName } from "@octo/design-tokens";
import { customerBalance, useStore } from "@/data/store";
import type { EstimateStatus, JobStatus } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, StatusChip } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Card, Divider, Empty, Grid, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";

const jobSt: Record<JobStatus, { s: StatusName; l: DictKey }> = {
  lead: { s: "info", l: "st.new" },
  estimate: { s: "info", l: "st.inspection" },
  unscheduled: { s: "warn", l: "st.toSchedule" },
  scheduled: { s: "neutral", l: "st.scheduled" },
  in_progress: { s: "info", l: "st.working" },
  done: { s: "ok", l: "st.paid" },
};
const estSt: Record<EstimateStatus, { s: StatusName; l: DictKey }> = {
  draft: { s: "neutral", l: "st.draft" },
  sent: { s: "info", l: "st.sent" },
  approved: { s: "ok", l: "st.approved" },
  declined: { s: "bad", l: "st.declined" },
};

/** Client → properties → jobs, estimates, invoices (DS data structure). */
export default function ClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useStore();
  const { t, money } = useI18n();
  const { c: col } = useTheme();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const c = db.customers.find((x) => x.id === id);
  if (!c)
    return (
      <Screen title={t("clients.title")} back={back}>
        <Empty icon="user" title={t("clients.empty")} />
      </Screen>
    );
  const props = db.properties.filter((p) => p.customerId === c.id);
  const estimates = db.estimates.filter((e) => e.customerId === c.id);
  const invoices = db.invoices.filter((i) => i.customerId === c.id);
  const tel = c.phone.replace(/[^\d+]/g, "");
  return (
    <Screen title={c.name} back={back} subtitle={`${c.phone}${c.email ? ` · ${c.email}` : ""}`}>
      <Card>
        <RowView style={{ justifyContent: "space-between" }}>
          <View>
            <T v="caption" tone="mut">
              {t("client.balance")}
            </T>
            <T v="title" tabular tone={customerBalance(db, c.id) > 0 ? "warn" : "ink"}>
              {money(customerBalance(db, c.id))}
            </T>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <T v="caption" tone="mut">
              {t("client.source")}
            </T>
            <T v="body" w="semibold">
              {c.source}
            </T>
          </View>
        </RowView>
        <RowView>
          <Button label={t("client.call")} icon="phone" onPress={() => Linking.openURL(`tel:${tel}`)} />
          <Button label={t("visit.message")} icon="message" variant="secondary" onPress={() => Linking.openURL(`sms:${tel}`)} />
        </RowView>
      </Card>

      <SectionTitle title={`${t("client.properties")} · ${props.length}`} />
      <Grid>
        {props.map((p) => {
          const jobs = db.jobs.filter((j) => j.propertyId === p.id);
          return (
            <Card key={p.id}>
              <RowView gap={space[1]}>
                <Icon name="home2" s={16} color={col.mut} />
                <T v="heading" style={{ flex: 1 }} numberOfLines={1}>
                  {p.address || p.city}
                </T>
              </RowView>
              <T v="caption" tone="mut">
                {p.city} · {t("visit.stories", { n: p.stories })}
              </T>
              <Button
                label={t("est.new")}
                icon="invoice"
                variant="secondary"
                size="sm"
                onPress={() => router.push(`/estimate/new?customerId=${c.id}&propertyId=${p.id}`)}
              />
              {jobs.length === 0 ? (
                <T v="caption" tone="mut">
                  {t("client.noJobs")}
                </T>
              ) : (
                jobs.map((j, i) => {
                  const v = db.visits.find((x) => x.jobId === j.id);
                  return (
                    <View key={j.id}>
                      {i > 0 ? <Divider /> : null}
                      <ListRow
                        title={j.title}
                        subtitle={j.amountCents ? money(j.amountCents) : undefined}
                        right={<StatusChip status={jobSt[j.status].s} label={t(jobSt[j.status].l)} />}
                        onPress={v ? () => router.push(`/visit/${v.id}`) : undefined}
                      />
                    </View>
                  );
                })
              )}
            </Card>
          );
        })}
      </Grid>

      {estimates.length > 0 ? (
        <>
          <SectionTitle title={t("client.estimates")} />
          <Card>
            {estimates.map((e, i) => (
              <View key={e.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow title={e.title} subtitle={money(e.totalCents)} right={<StatusChip status={estSt[e.status].s} label={t(estSt[e.status].l)} />} onPress={() => router.push(`/estimate/${e.id}`)} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {invoices.length > 0 ? (
        <>
          <SectionTitle title={t("client.invoices")} />
          <Card>
            {invoices.map((inv, i) => {
              const paid = inv.paidCents >= inv.totalCents;
              const overdue = !paid && new Date(inv.dueDate).getTime() < Date.now();
              return (
                <View key={inv.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={money(inv.totalCents)}
                    subtitle={db.jobs.find((j) => j.id === inv.jobId)?.title}
                    right={
                      <StatusChip
                        status={paid ? "ok" : overdue ? "bad" : "warn"}
                        label={t(paid ? "st.paid" : overdue ? "st.overdue" : "st.awaiting")}
                      />
                    }
                  />
                </View>
              );
            })}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
