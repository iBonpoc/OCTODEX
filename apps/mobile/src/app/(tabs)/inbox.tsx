import { useEffect, useState } from "react";
import { timing, type StatusName } from "@octo/design-tokens";
import { minutesSince, useStore } from "@/data/store";
import type { Lead, LeadStatus } from "@/data/types";
import { filterLeads, leadStatusView as statusOf, needsNextStep, openTasks, sourceName, waitingMinutes, waitStatus, type LeadFilter } from "@/features/leads";
import { EstimatesBoard, InvoicesBoard } from "@/features/boards";
import { usePersistentState } from "@/data/persist";
import { router, useLocalSearchParams } from "expo-router";
import { useI18n, type DictKey } from "@/i18n";
import { ReplySheet, useTick } from "@/features/sheets";
import { Button, ChoiceChips, Segmented, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Empty, Grid, RowView, Screen } from "@/ui/surfaces";



/** All requests in one place, with a "waiting N min" timer: whoever replies first wins the job. */
/** "Sales" tab: leads → estimates → invoices, each list as cards with filters. */
export default function Sales() {
  const { t } = useI18n();
  const [tab, setTab] = usePersistentState<"leads" | "estimates" | "invoices">("octo.salesTab.v1", "leads");
  // "‹ Leads" / "‹ Estimates" from a card opens Sales on that list
  const want = useLocalSearchParams<{ tab?: string }>().tab;
  useEffect(() => {
    if (want === "leads" || want === "estimates" || want === "invoices") setTab(want);
  }, [want]);
  const { db } = useStore();
  const newLeads = db.leads.filter((l) => l.status === "new").length;
  return (
    <Screen
      title={t("sales.title")}
      help={t("help.inbox")}
      hintKey="inbox"
      right={
        tab === "leads" ? (
          <Button label={t("quick.lead")} icon="plus" size="sm" onPress={() => router.push("/lead/new")} />
        ) : tab === "estimates" ? (
          <Button label={t("est.new")} icon="plus" size="sm" onPress={() => router.push("/estimate/new")} />
        ) : undefined
      }
    >
      <Segmented
        full
        value={tab}
        onChange={setTab}
        items={[
          { key: "leads", label: newLeads ? `${t("sales.leads")} · ${newLeads}` : t("sales.leads") },
          { key: "estimates", label: t("sales.estimates") },
          { key: "invoices", label: t("sales.invoices") },
        ]}
      />
      {tab === "leads" ? <LeadsBoard /> : tab === "estimates" ? <EstimatesBoard /> : <InvoicesBoard />}
    </Screen>
  );
}

function LeadsBoard() {
  useTick();
  const { t, day } = useI18n();
  const { db, role } = useStore();
  const [reply, setReply] = useState<string | null>(null);
  const [f, setF] = usePersistentState<LeadFilter>("octo.leadFilter.v1", "open");
  const [src, setSrc] = useState("");
  const [q, setQ] = useState("");
  const leads = filterLeads(db, role, { filter: f, sourceId: src || undefined, q });
  const count = (x: LeadFilter) => filterLeads(db, role, { filter: x }).length;
  const usedSources = db.sources.filter((s) => db.leads.some((l) => l.sourceId === s.id));
  const card = (l: Lead) => {
    const w = waitingMinutes(l);
    const sv = statusOf[l.status];
    const s = w !== null ? { status: waitStatus(w), label: t("inbox.waiting", { m: w }) } : { status: sv.status, label: t(sv.label) };
    const task = openTasks(db, l.id)[0];
    const warn = needsNextStep(db, l);
    return (
      <Card key={l.id} status={s.status} onPress={() => router.push(`/lead/${l.id}`)} accessibilityLabel={l.name}>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="caption" tone="mut" numberOfLines={1} style={{ flex: 1 }}>
            {[sourceName(db, l.sourceId), l.city].filter(Boolean).join(" · ")}
          </T>
          <StatusChip status={s.status} label={s.label} />
        </RowView>
        <T v="heading">{l.name}</T>
        {l.service || l.message ? (
          <T v="body" tone="mut" numberOfLines={2}>
            {l.service ?? l.message}
          </T>
        ) : null}
        {task ? (
          <T v="caption" tone="mut">
            {t("lead.next")}: {task.title}{task.dueAt ? ` · ${day(task.dueAt)}` : ""}
          </T>
        ) : warn ? (
          <T v="caption" tone="warn">
            ⚠ {t("lead.noNextStep")}
          </T>
        ) : null}
        {l.status === "new" ? (
          <RowView style={{ flexWrap: "wrap" }}>
            <Button label={t("inbox.reply")} icon="send" size="sm" onPress={() => setReply(l.id)} />
          </RowView>
        ) : null}
      </Card>
    );
  };
  return (
    <>
      <TextField type="search" value={q} onChangeText={setQ} placeholder={t("lead.search")} icon="search" />
      <ChoiceChips<LeadFilter>
        value={f}
        onChange={setF}
        items={(["open", "mine", "waiting", "won", "closed"] as const).map((k) => ({ key: k, label: `${t(`lead.f.${k}` as DictKey)} · ${count(k)}` }))}
      />
      {usedSources.length > 1 ? (
        <ChoiceChips<string> value={src} onChange={setSrc} items={[{ key: "", label: t("lead.allSources") }, ...usedSources.map((x) => ({ key: x.id, label: x.name }))]} />
      ) : null}
      {leads.length === 0 ? <Empty icon="inbox" title={t("inbox.empty")} hint={t("inbox.emptyHint")} /> : <Grid>{leads.map(card)}</Grid>}
      <ReplySheet leadId={reply} onClose={() => setReply(null)} />
    </>
  );
}
