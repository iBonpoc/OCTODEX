import { useState } from "react";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space } from "@octo/design-tokens";
import { daysSince, minutesSince, useStore } from "@/data/store";
import { LEAD_FUNNEL, type LostReason } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { LOST_REASONS, MANUAL_WIN_REASONS, isOpenLead, leadStatusView, type ManualWinReason } from "@/features/leads";
import { NotesBlock } from "@/features/NotesBlock";
import { ReplySheet } from "@/features/sheets";
import { Button, ChoiceChips, StatusChip, Steps, TextField } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, CardList, Divider, Empty, ItemCard, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";

/**
 * Lead card: funnel (new → replied → inspection → estimate sent → client), actions,
 * estimates made from this lead (opened / signed), notes. A lead becomes a client automatically when the
 * client signs, or manually with a reason (paper contract, verbal, paid).
 */
export default function LeadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db } = store;
  const { t, money, day } = useI18n();
  const toast = useToast();
  const [reply, setReply] = useState(false);
  const [sheet, setSheet] = useState<"won" | "lost" | null>(null);
  const [winReason, setWinReason] = useState<ManualWinReason>("paper");
  const [winText, setWinText] = useState("");
  const [lostReason, setLostReason] = useState<LostReason>("no_response");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/inbox"));
  const l = db.leads.find((x) => x.id === id);
  if (!l)
    return (
      <Screen title={t("inbox.title")} back={back}>
        <Empty icon="inbox" title={t("clients.empty")} />
      </Screen>
    );
  const sv = leadStatusView[l.status];
  const step = l.status === "lost" ? -1 : LEAD_FUNNEL.indexOf(l.status);
  const estimates = db.estimates.filter((e) => e.leadId === l.id || (l.customerId && e.customerId === l.customerId));
  const tel = l.phone.replace(/[^\d+]/g, "");
  const q = (msg: string) => (store.online ? msg : t("offline.queued"));
  const open = isOpenLead(l);

  const makeEstimate = () => {
    const target = store.leadEstimateTarget(l.id);
    if (!target) return;
    router.push(`/estimate/new?customerId=${target.customerId}&propertyId=${target.propertyId}&leadId=${l.id}`);
  };
  const ago =
    l.status !== "new"
      ? day(l.receivedAt)
      : minutesSince(l.receivedAt) < 60 * 24
        ? t("inbox.waiting", { m: minutesSince(l.receivedAt) })
        : t("lead.daysAgo", { d: daysSince(l.receivedAt) });

  return (
    <Screen title={l.name} back={back} subtitle={`${l.source} · ${ago}`}>
      <Card status={sv.status}>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="caption" tone="mut">
            {t("lead.funnel")}
          </T>
          <StatusChip status={sv.status} label={l.status === "lost" && l.lostReason ? `${t(sv.label)}: ${t(`lead.lost.${l.lostReason}` as DictKey)}` : t(sv.label)} />
        </RowView>
        {step >= 0 ? <Steps labels={LEAD_FUNNEL.map((s) => t(leadStatusView[s].label))} current={step} /> : null}
        {l.status === "won" ? (
          <T v="caption" tone="mut">
            {t(l.wonVia === "manual" ? "lead.wonManual" : "lead.wonApproval")}
          </T>
        ) : null}
      </Card>

      <Card>
        {l.message ? <T v="body">{l.message}</T> : null}
        <RowView gap={space[1]}>
          <Icon name="phone" s={16} />
          <T v="body" tabular>
            {l.phone}
          </T>
        </RowView>
        {l.email ? (
          <RowView gap={space[1]}>
            <Icon name="message" s={16} />
            <T v="body">{l.email}</T>
          </RowView>
        ) : null}
        {l.address || l.city ? (
          <RowView gap={space[1]}>
            <Icon name="pin" s={16} />
            <T v="body">{[l.address, l.city].filter(Boolean).join(", ")}</T>
          </RowView>
        ) : null}
        <RowView style={{ flexWrap: "wrap" }}>
          <Button label={t("client.call")} icon="phone" variant="secondary" onPress={() => Linking.openURL(`tel:${tel}`)} />
          <Button label={t("visit.message")} icon="message" variant="secondary" onPress={() => Linking.openURL(`sms:${tel}`)} />
        </RowView>
      </Card>

      {open ? (
        <Card>
          <T v="heading">{t("lead.next")}</T>
          <Button label={t("lead.makeEstimate")} icon="invoice" full onPress={makeEstimate} />
          <RowView style={{ flexWrap: "wrap" }}>
            {l.status === "new" ? <Button label={t("inbox.reply")} icon="send" variant="secondary" onPress={() => setReply(true)} /> : null}
            {l.status === "new" || l.status === "replied" ? (
              <Button
                label={t("inbox.book")}
                icon="calendar"
                variant="secondary"
                onPress={() => toast.show(q(t("toast.bookedTomorrow", { name: l.name })), store.bookLead(l.id))}
              />
            ) : null}
          </RowView>
          <Divider />
          <RowView style={{ flexWrap: "wrap" }}>
            <Button label={t("lead.makeClient")} icon="check" variant="ghost" onPress={() => setSheet("won")} />
            <Button label={t("lead.markLost")} icon="close" variant="ghost" onPress={() => setSheet("lost")} />
          </RowView>
        </Card>
      ) : l.customerId ? (
        <Button label={t("lead.openClient")} icon="user" variant="secondary" full onPress={() => router.push(`/client/${l.customerId}`)} />
      ) : null}

      {estimates.length ? (
        <>
          <SectionTitle title={t("client.estimates")} />
          <CardList>
            {estimates.map((e, i) => (
              <View key={e.id}>
                <ItemCard
                  title={e.title}
                  subtitle={`${money(e.totalCents)}${e.sentAt ? ` · ${t("st.sent")} ${day(e.sentAt)}` : ""}${e.viewedAt ? ` · ${t("ue.viewed", { date: day(e.viewedAt) })}` : ""}`}
                  right={
                    <StatusChip
                      status={e.status === "approved" ? "ok" : e.status === "sent" ? "info" : "neutral"}
                      label={t(e.status === "approved" ? "st.approved" : e.status === "sent" ? "st.sent" : "st.draft")}
                    />
                  }
                  onPress={() => router.push(`/estimate/${e.id}`)}
                />
              </View>
            ))}
          </CardList>
        </>
      ) : null}

      <NotesBlock subjectType="lead" subjectId={l.id} extraSubjects={l.customerId ? [{ type: "customer", id: l.customerId }] : []} />

      <ReplySheet leadId={reply ? l.id : null} onClose={() => setReply(false)} />
      <Sheet visible={sheet !== null} onClose={() => setSheet(null)} title={sheet === "won" ? t("lead.makeClient") : t("lead.markLost")}>
        <View style={{ gap: space[3] }}>
          {sheet === "won" ? (
            <>
              <T v="caption" tone="mut">
                {t("lead.makeClientHint")}
              </T>
              <ChoiceChips value={winReason} onChange={setWinReason} items={MANUAL_WIN_REASONS.map((r) => ({ key: r, label: t(`lead.win.${r}` as DictKey) }))} />
              <TextField value={winText} onChangeText={setWinText} placeholder={t("lead.winComment")} multiline />
              <Button
                label={t("lead.makeClient")}
                icon="check"
                full
                onPress={() => {
                  const text = `${t("lead.wonManualNote")}: ${t(`lead.win.${winReason}` as DictKey)}${winText.trim() ? ` — ${winText.trim()}` : ""}`;
                  toast.show(q(t("lead.convertedToast", { name: l.name })), store.convertLead(l.id, text));
                  setSheet(null);
                }}
              />
            </>
          ) : null}
          {sheet === "lost" ? (
            <>
              <ChoiceChips value={lostReason} onChange={setLostReason} items={LOST_REASONS.map((r) => ({ key: r, label: t(`lead.lost.${r}` as DictKey) }))} />
              <Button
                label={t("lead.markLost")}
                icon="close"
                variant="danger"
                full
                onPress={() => {
                  toast.show(q(t("lead.lostToast", { name: l.name })), store.loseLead(l.id, lostReason));
                  setSheet(null);
                }}
              />
            </>
          ) : null}
        </View>
      </Sheet>
    </Screen>
  );
}
