/**
 * #3124 В1 (spec 71 §16): the client in the look «Линия работы» — instead of the sections strip, the client's work in rows
 * (rule 12: `ListGroup` / `GroupRow`): «Идут» — the jobs going, each with its current step and «шаг N из M», and an estimate not
 * signed yet with no job of its own («Ждёт подписи»); «Закрытые» — done and cancelled jobs; then «Объекты · N ›» and «Без работы · N ›»
 * (a visit or an invoice with no job) that open in place, and «История» from «⋯». A row opens the job in the same look — «‹» comes back.
 * Only the view: the data are what the client card already reads (useClientFacts); the base does not change.
 */
import { router, type Href } from "expo-router";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import type { Customer, Job, Property } from "@/data/types";
import { useI18n } from "@/i18n";
import { estView } from "@/features/boards";
import { jobStatusView } from "@/features/jobs";
import { jobLineOf, unsignedWithoutJob } from "@/features/job/jobLine";
import { LINE_KIND } from "@/features/job/JobLine";
import { ClientLog, ClientPlaces, type ClientFacts } from "@/features/client/ClientSections";
import { invoiceTitle } from "@/features/invoiceTitle";
import { GroupRow, ListGroup } from "@/ui/groupedList";

export type ClientLinePanel = null | "places" | "other" | "log";

export function ClientLine({ c, f, panel, onPanel, onRoute }: {
  c: Customer;
  f: ClientFacts;
  /** what is open in place under the rows */
  panel: ClientLinePanel;
  onPanel: (p: ClientLinePanel) => void;
  onRoute: (p: Property) => void;
}) {
  const { t, money, day } = useI18n();
  const { db, r, office } = f;
  const cancelled = (db.cancelledJobs ?? []).filter((j) => j.customerId === c.id || r.properties.some((p) => p.id === j.propertyId));
  const going = r.jobs.filter((j) => j.status !== "done");
  const closed = [...r.jobs.filter((j) => j.status === "done"), ...cancelled];
  const waiting = office ? unsignedWithoutJob(r.estimates, [...r.jobs, ...cancelled]) : [];
  const otherVisits = f.visits.filter((v) => !v.jobId);
  const otherInvoices = office ? r.invoices.filter((i) => !i.jobId && i.status !== "void") : [];
  const otherN = otherVisits.length + otherInvoices.length;
  const toggle = (p: Exclude<ClientLinePanel, null>) => onPanel(panel === p ? null : p);

  const jobRow = (j: Job, isCancelled: boolean) => {
    const line = jobLineOf(db, j.id, office);
    const at = line.current ? line.steps.indexOf(line.current) + 1 : 0;
    const st = jobStatusView[j.status];
    const sub = isCancelled
      ? t("line.cancelled")
      : line.current
        ? `${t(LINE_KIND[line.current.kind])} · ${t("line.stepOf", { i: at, n: line.steps.length })}`
        : line.steps.length
          ? t("line.allClosed")
          : t("line.noSteps");
    return (
      <GroupRow
        key={j.id}
        testID={`client-line-job-${j.id}`}
        title={j.title}
        subtitle={sub}
        value={office && j.amountCents > 0 ? money(j.amountCents) : undefined}
        status={isCancelled ? { status: "neutral", label: t("line.cancelled") } : { status: st.status, label: t(st.label) }}
        onPress={() => router.push(`/job/${j.id}` as Href)}
        chevron
        wrap
      />
    );
  };

  return (
    <View testID="client-line" style={{ gap: space[4] }}>
      <ListGroup title={t("line.going")} count={going.length + waiting.length} testID="client-line-going">
        {going.map((j) => jobRow(j, false))}
        {waiting.map((e) => (
          <GroupRow
            key={e.id}
            testID={`client-line-est-${e.id}`}
            title={e.title || e.number || t("line.kind.estimate")}
            subtitle={[e.number, e.sentAt ? day(e.sentAt) : null].filter(Boolean).join(" · ") || undefined}
            value={money(e.totalCents)}
            status={{ status: estView[e.status].s, label: e.status === "draft" ? t(estView[e.status].l) : t("line.awaitSign"), draft: !!estView[e.status].d }}
            onPress={() => router.push(`/estimate/${e.id}` as Href)}
            chevron
            wrap
          />
        ))}
      </ListGroup>
      <ListGroup title={t("line.closed")} count={closed.length} testID="client-line-closed">
        {closed.map((j) => jobRow(j, cancelled.includes(j)))}
      </ListGroup>
      <ListGroup testID="client-line-more">
        {r.properties.length ? <GroupRow testID="client-line-places" title={`${t("line.places")} · ${r.properties.length}`} onPress={() => toggle("places")} chevron /> : null}
        {otherN ? <GroupRow testID="client-line-other" title={`${t("line.noJob")} · ${otherN}`} onPress={() => toggle("other")} chevron /> : null}
      </ListGroup>
      {panel === "places" ? <ClientPlaces c={c} f={f} onRoute={onRoute} /> : null}
      {panel === "other" ? (
        <ListGroup title={t("line.noJob")} testID="client-line-other-list">
          {otherVisits.map((v) => (
            <GroupRow key={v.id} testID={`client-line-visit-${v.id}`} title={t("line.kind.visit")} subtitle={day(v.start)} onPress={() => router.push(`/visit/${v.id}` as Href)} chevron />
          ))}
          {otherInvoices.map((i) => (
            <GroupRow key={i.id} testID={`client-line-inv-${i.id}`} title={i.number || invoiceTitle(i, t)} subtitle={invoiceTitle(i, t)} value={money(i.totalCents)} onPress={() => router.push(`/invoice/${i.id}` as Href)} chevron />
          ))}
        </ListGroup>
      ) : null}
      {panel === "log" ? <ClientLog c={c} f={f} /> : null}
    </View>
  );
}
